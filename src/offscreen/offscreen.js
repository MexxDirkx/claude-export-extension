// Blob workshop.
//
// MV3 service workers have no URL.createObjectURL, so bytes that are about to
// become a download are handed here and come back as a blob: URL the worker can
// pass to chrome.downloads.
//
// Deliberately stateless: Chrome may terminate an idle offscreen document, so
// nothing that matters is kept here between calls.

const MIME = {
  md: 'text/markdown',
  txt: 'text/plain',
  html: 'text/html',
  json: 'application/json',
  zip: 'application/zip',
};

const mimeFor = (name) => MIME[name.split('.').pop()] ?? 'application/octet-stream';

const OPS = {
  blobFor({ name, data }) {
    const url = URL.createObjectURL(new Blob([data], { type: mimeFor(name) }));
    return { url };
  },

  revoke({ url }) {
    URL.revokeObjectURL(url);
    return { revoked: true };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.channel !== 'claude-exporter-offscreen') return undefined;

  const op = OPS[message.op];
  if (!op) {
    sendResponse({ ok: false, error: `Unknown offscreen operation: ${message.op}` });
    return undefined;
  }

  try {
    sendResponse({ ok: true, data: op(message.args ?? {}) });
  } catch (error) {
    sendResponse({ ok: false, error: error?.message ?? String(error) });
  }
  return undefined;
});
