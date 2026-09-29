// Runs in the claude.ai page context.
//
// Every API call the extension makes goes through here. That is deliberate:
// requests issued from a page-origin script are same-origin, so the browser
// attaches the session cookie exactly as it does for claude.ai's own traffic.
// A fetch from the service worker would be treated as cross-site and the
// SameSite session cookie would be dropped.
//
// No module imports: content scripts are classic scripts.

(() => {
  if (window.__claudeExporterInstalled) return;
  window.__claudeExporterInstalled = true;

  const API_HEADERS = {
    accept: '*/*',
    'content-type': 'application/json',
    'anthropic-client-platform': 'web_claude_ai',
  };

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function apiGet(path) {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: API_HEADERS,
    });
    if (!response.ok) {
      throw new ApiError(`${response.status} ${response.statusText} for ${path}`, response.status);
    }
    return response.json();
  }

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // The org uuid prefixes every API path but is never returned by a discovery
  // call the page makes. Two independent sources, checked against each other.
  let cachedOrgId = null;
  async function resolveOrgId() {
    if (cachedOrgId) return cachedOrgId;

    const fromCookie = readCookie('lastActiveOrg');
    let orgs = null;
    try {
      orgs = await apiGet('/api/organizations');
    } catch {
      orgs = null;
    }

    if (Array.isArray(orgs) && orgs.length) {
      const matchesCookie = orgs.find((o) => o.uuid === fromCookie);
      const chatCapable = orgs.find((o) => (o.capabilities ?? []).includes('chat'));
      cachedOrgId = (matchesCookie ?? chatCapable ?? orgs[0]).uuid;
    } else if (fromCookie) {
      cachedOrgId = fromCookie;
    }

    if (!cachedOrgId) {
      throw new Error('Could not determine your Claude organization. Open a chat on claude.ai and try again.');
    }
    return cachedOrgId;
  }

  const OPS = {
    async ping() {
      return { ok: true };
    },

    async orgId() {
      return { orgId: await resolveOrgId() };
    },

    // One page of the conversation list. The caller pages until has_more is false.
    async listPage({ offset, limit }) {
      const org = await resolveOrgId();
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        consistency: 'eventual',
      });
      const page = await apiGet(`/api/organizations/${org}/chat_conversations_v2?${params}`);
      return { items: page.data ?? [], hasMore: Boolean(page.has_more) };
    },

    async conversation({ uuid }) {
      const org = await resolveOrgId();
      const params = new URLSearchParams({
        tree: 'True',
        rendering_mode: 'messages',
        render_all_tools: 'true',
        consistency: 'strong',
      });
      return { conversation: await apiGet(`/api/organizations/${org}/chat_conversations/${uuid}?${params}`) };
    },
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.channel !== 'claude-exporter') return undefined;

    const op = OPS[message.op];
    if (!op) {
      sendResponse({ ok: false, error: `Unknown operation: ${message.op}` });
      return undefined;
    }

    op(message.args ?? {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message ?? String(error),
        status: error?.status ?? null,
      }));

    return true; // keep the channel open for the async response
  });
})();
