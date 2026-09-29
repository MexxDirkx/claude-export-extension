// Popup: a view over the worker's job state.
//
// It starts jobs and renders progress; it never fetches or renders exports
// itself, so closing the popup mid-archive changes nothing.

import { FORMATS } from '../core/formats.js';

const DEFAULT_FORMATS = ['markdown', 'text'];
const CHAT_URL = /^https:\/\/claude\.ai\/chat\/([0-9a-f-]{36})/i;

const $ = (id) => document.getElementById(id);

const el = {
  formatList: $('format-list'),
  exportCurrent: $('export-current'),
  currentHint: $('current-hint'),
  exportAll: $('export-all'),
  progress: $('progress'),
  barFill: $('bar-fill'),
  progressLabel: $('progress-label'),
  cancel: $('cancel'),
  outcome: $('outcome'),
  outcomeText: $('outcome-text'),
  dismiss: $('dismiss'),
};

let activeTab = null;
let conversationId = null;
let onClaudeTab = false;

async function callWorker(op, args = {}) {
  const response = await chrome.runtime.sendMessage({ channel: 'claude-exporter-worker', op, args });
  if (!response?.ok) throw new Error(response?.error ?? 'The extension worker did not respond.');
  return response.data;
}

// ------------------------------------------------------------ formats

async function loadFormats() {
  const stored = await chrome.storage.local.get('formats');
  const selected = new Set(stored.formats ?? DEFAULT_FORMATS);

  el.formatList.replaceChildren(...FORMATS.map((format) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = format.id;
    input.checked = selected.has(format.id);
    input.addEventListener('change', saveFormats);
    label.append(input, document.createTextNode(format.label));
    return label;
  }));
  syncButtons();
}

const chosenFormats = () =>
  [...el.formatList.querySelectorAll('input:checked')].map((input) => input.value);

async function saveFormats() {
  await chrome.storage.local.set({ formats: chosenFormats() });
  syncButtons();
}

// ------------------------------------------------------------ rendering

function syncButtons(state) {
  const running = state?.status === 'running';
  const noFormat = chosenFormats().length === 0;
  el.exportCurrent.disabled = running || noFormat || !conversationId || !onClaudeTab;
  el.exportAll.disabled = running || noFormat || !onClaudeTab;

  if (!onClaudeTab) {
    el.currentHint.textContent = 'Open claude.ai in this tab to export.';
  } else if (noFormat) {
    el.currentHint.textContent = 'Pick at least one format.';
  } else if (!conversationId) {
    el.currentHint.textContent = 'Open a conversation on claude.ai to export it.';
  } else {
    el.currentHint.textContent = 'Saves loose files into your Downloads folder.';
  }
}

function render(state) {
  const running = state.status === 'running';
  el.progress.hidden = !running;

  if (running) {
    const pct = state.total ? Math.floor((state.completed / state.total) * 100) : 0;
    el.barFill.style.width = `${pct}%`;
    el.progressLabel.textContent = state.total
      ? `${state.label} — ${state.completed} of ${state.total}`
      : state.label;
  }

  el.outcome.hidden = state.status !== 'done' && state.status !== 'error';
  el.outcome.className = `outcome ${state.status === 'error' ? 'error' : 'success'}`;
  if (state.status === 'error') {
    el.outcomeText.textContent = state.error;
  } else if (state.status === 'done') {
    el.outcomeText.textContent = describeResult(state);
  }

  syncButtons(state);
}

function describeResult(state) {
  const result = state.result ?? {};
  if (result.kind === 'single') {
    return `Exported “${result.name}” as ${result.files} file${result.files === 1 ? '' : 's'}.`;
  }
  if (result.kind === 'empty') return 'No conversations found.';
  if (result.kind === 'archive') {
    const size = `${(result.bytes / 1048576).toFixed(1)} MB`;
    const failed = result.total - result.exported;
    const tail = failed ? ` ${failed} failed — see export-errors.txt.` : '';
    return `Exported ${result.exported} of ${result.total} conversations (${size}).${tail}`;
  }
  return 'Done.';
}

// ------------------------------------------------------------ wiring

el.exportCurrent.addEventListener('click', () =>
  callWorker('exportSingle', { tabId: activeTab.id, conversationId, formats: chosenFormats() })
    .catch(showError));

el.exportAll.addEventListener('click', () =>
  callWorker('exportAll', { tabId: activeTab.id, formats: chosenFormats() })
    .catch(showError));

el.cancel.addEventListener('click', () => callWorker('cancel').catch(showError));
el.dismiss.addEventListener('click', () => callWorker('reset').then(render).catch(showError));

function showError(error) {
  render({ status: 'error', error: error.message, completed: 0, total: 0, label: '' });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.channel === 'claude-exporter-progress') render(message.state);
});

(async () => {
  await loadFormats();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  conversationId = tab?.url?.match(CHAT_URL)?.[1] ?? null;

  onClaudeTab = Boolean(tab?.url?.startsWith('https://claude.ai/'));

  render(await callWorker('getState'));
})().catch(showError);
