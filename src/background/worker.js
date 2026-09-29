// Job orchestrator.
//
// Owns the export job so that closing the popup cannot abandon a half-finished
// archive. It never talks to claude.ai directly: API calls are relayed through
// the content script (page origin, so the session cookie is sent), and blob URLs
// are minted in the offscreen document (service workers have no
// URL.createObjectURL).
//
// The decision-making here — retry policy, concurrency, paging — lives in
// tested modules under core/; what remains is chrome API plumbing.

import { renderConversation } from '../core/export.js';
import { createZip } from '../core/zip.js';
import { withRetry } from '../core/retry.js';
import { runPool } from '../core/pool.js';
import { collectAllPages } from '../core/paginate.js';

const PAGE_SIZE = 30;
const CONCURRENCY = 3;

const idleState = () => ({
  status: 'idle',
  label: '',
  total: 0,
  completed: 0,
  failures: [],
  error: null,
  result: null,
});

let state = idleState();
let cancelRequested = false;
const isCancelled = () => cancelRequested;

// ---------------------------------------------------------------- state

// Progress callbacks fire without awaiting, so the persisted copy is written
// through a chain: the in-memory state is updated synchronously in call order,
// and storage is written in that same order. Without this a late progress write
// could land after the final "done" write and leave the popup showing a job
// that has already finished.
let writes = Promise.resolve();

function setState(patch) {
  state = { ...state, ...patch };
  const snapshot = state;
  updateBadge();

  writes = writes.then(async () => {
    await chrome.storage.session.set({ job: snapshot });
    try {
      await chrome.runtime.sendMessage({ channel: 'claude-exporter-progress', state: snapshot });
    } catch {
      // No popup open. Progress stays in session storage for when it reopens.
    }
  });
  return writes;
}

function updateBadge() {
  const badge = (text, color) => {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  };

  if (state.status === 'running' && state.total > 0) {
    badge(`${Math.floor((state.completed / state.total) * 100)}%`, '#b8552a');
  } else if (state.status === 'error') {
    badge('!', '#c0392b');
  } else if (state.status === 'done') {
    badge('✓', '#2d7d46');
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000);
  } else {
    badge('');
  }
}

// ---------------------------------------------------------------- plumbing

async function callContent(tabId, op, args = {}) {
  const response = await chrome.tabs.sendMessage(tabId, { channel: 'claude-exporter', op, args });
  if (!response?.ok) {
    throw Object.assign(new Error(response?.error ?? 'The claude.ai page did not respond.'),
      { status: response?.status ?? null });
  }
  return response.data;
}

// Content scripts only load on navigation, so a claude.ai tab that was already
// open when the extension was installed has none. activeTab lets us inject one
// on demand when the user invokes the extension from that tab.
async function ensureContentScript(tabId) {
  try {
    await callContent(tabId, 'ping');
    return;
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/content.js'] });
  }
  await callContent(tabId, 'ping');
}

async function callOffscreen(op, args = {}) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Create a downloadable blob URL for the exported files.',
    });
  }
  const response = await chrome.runtime.sendMessage({ channel: 'claude-exporter-offscreen', op, args });
  if (!response?.ok) throw new Error(response?.error ?? 'The export worker did not respond.');
  return response.data;
}

async function download(url, filename) {
  const id = await chrome.downloads.download({ url, filename, saveAs: false });

  // Hold the blob until Chrome has finished reading it.
  const onChanged = (delta) => {
    if (delta.id !== id || !delta.state) return;
    if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
      chrome.downloads.onChanged.removeListener(onChanged);
      callOffscreen('revoke', { url }).catch(() => {});
    }
  };
  chrome.downloads.onChanged.addListener(onChanged);
}

const fetchConversation = (tabId, uuid) =>
  withRetry(() => callContent(tabId, 'conversation', { uuid }), { isCancelled });

// ---------------------------------------------------------------- jobs

async function exportSingle({ tabId, conversationId, formats }) {
  await setState({ ...idleState(), status: 'running', label: 'Exporting this conversation', total: 1 });
  await ensureContentScript(tabId);

  const { conversation } = await fetchConversation(tabId, conversationId);
  const files = renderConversation(conversation, formats);

  for (const file of files) {
    // Single exports are loose files, not an archive, so drop the format folder.
    const name = file.name.split('/').pop();
    const { url } = await callOffscreen('blobFor', { name, data: file.data });
    await download(url, `claude-exports/${name}`);
  }

  await setState({
    status: 'done',
    completed: 1,
    result: { kind: 'single', files: files.length, name: conversation.name || 'Untitled' },
  });
}

async function exportAll({ tabId, formats }) {
  await setState({ ...idleState(), status: 'running', label: 'Listing conversations' });
  await ensureContentScript(tabId);

  const summaries = await collectAllPages(
    (offset, limit) => withRetry(() => callContent(tabId, 'listPage', { offset, limit }), { isCancelled }),
    {
      pageSize: PAGE_SIZE,
      isCancelled,
      onProgress: (found) => setState({ label: `Found ${found} conversations` }),
    },
  );

  if (cancelRequested) return finishCancelled();
  if (summaries.length === 0) {
    await setState({ status: 'done', result: { kind: 'empty' } });
    return;
  }

  await setState({ status: 'running', label: 'Exporting', total: summaries.length, completed: 0 });

  const taken = new Set();
  const entries = [];

  const { failures } = await runPool(summaries, CONCURRENCY, async (summary) => {
    const { conversation } = await fetchConversation(tabId, summary.uuid);
    entries.push(...renderConversation(conversation, formats, taken));
  }, {
    isCancelled,
    onProgress: (completed) => setState({ completed }),
  });

  if (cancelRequested) return finishCancelled();

  await setState({ label: 'Building archive', failures });
  if (failures.length) {
    entries.push({ name: 'export-errors.txt', data: errorReport(failures) });
  }

  const bytes = await createZip(entries);
  const name = `claude-export-${new Date().toISOString().slice(0, 10)}.zip`;
  const { url } = await callOffscreen('blobFor', { name, data: bytes });
  await download(url, `claude-exports/${name}`);

  await setState({
    status: 'done',
    result: {
      kind: 'archive',
      exported: summaries.length - failures.length,
      total: summaries.length,
      bytes: bytes.length,
    },
  });
}

function errorReport(failures) {
  const lines = [
    'These conversations could not be exported.',
    'Running the export again will retry them.',
    '',
  ];
  for (const { item, error } of failures) {
    lines.push(`${item.name || 'Untitled'} (${item.uuid})\n  ${error}\n`);
  }
  return lines.join('\n');
}

const finishCancelled = () => setState({ ...idleState(), label: '' });

// ---------------------------------------------------------------- messages

const JOBS = { exportSingle, exportAll };

async function startJob(op, args) {
  if (state.status === 'running') throw new Error('An export is already running.');
  cancelRequested = false;
  try {
    await JOBS[op](args);
  } catch (error) {
    if (error?.message === 'Cancelled') await finishCancelled();
    else await setState({ status: 'error', error: error?.message ?? String(error) });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.channel !== 'claude-exporter-worker') return undefined;

  (async () => {
    switch (message.op) {
      case 'getState':
        return (await chrome.storage.session.get('job')).job ?? state;
      case 'cancel':
        cancelRequested = true;
        return { cancelling: true };
      case 'reset':
        await setState(idleState());
        return { reset: true };
      case 'exportSingle':
      case 'exportAll':
        // Deliberately not awaited: the popup gets an immediate ack and follows
        // progress events, so closing it cannot abort the job.
        startJob(message.op, message.args);
        return { started: true };
      default:
        throw new Error(`Unknown worker operation: ${message.op}`);
    }
  })()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message ?? String(error) }));

  return true;
});
