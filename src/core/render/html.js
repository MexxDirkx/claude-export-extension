// Self-contained HTML transcript.
//
// The document embeds its own CSS and references nothing external, so it opens
// correctly from a folder, a USB stick or an email attachment years from now.
//
// Message bodies are untrusted: they can contain raw HTML that Claude quoted
// from a web page. Raw HTML tokens are therefore escaped rather than emitted,
// and link/image URLs are restricted to safe schemes.

import { Marked } from '../../vendor/marked.esm.js';
import { formatTimestamp, conversationUrl, speakerLabel } from './shared.js';

const SAFE_SCHEME = /^(https?:|mailto:|#|\/|\.)/i;

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const safeUrl = (url) => (SAFE_SCHEME.test(String(url ?? '').trim()) ? String(url).trim() : '');

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const url = safeUrl(href);
      const label = this.parser.parseInline(tokens);
      if (!url) return label;
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(url)}"${t} rel="noopener noreferrer">${label}</a>`;
    },
    image({ href, title, text }) {
      const url = safeUrl(href);
      if (!url) return escapeHtml(text);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${t}>`;
    },
  },
});

const STYLES = `
:root { color-scheme: light dark; --bg:#fbfaf9; --fg:#22201d; --muted:#6b6660;
  --rule:#e5e1dc; --human-bg:#f0eeea; --code-bg:#f3f1ee; --accent:#b8552a; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#1a1917; --fg:#e8e5e0; --muted:#9a948c; --rule:#33302c;
    --human-bg:#232120; --code-bg:#232120; --accent:#e08a5f; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
  font:16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 6rem; }
header { border-bottom: 1px solid var(--rule); padding-bottom: 1.5rem; margin-bottom: 2.5rem; }
h1 { font-size: 1.75rem; line-height:1.25; margin: 0 0 .5rem; }
.meta { color: var(--muted); font-size: .875rem; }
.meta a { color: var(--muted); }
.msg { margin: 0 0 2.25rem; }
.msg-head { display:flex; gap:.6rem; align-items:baseline; margin-bottom:.6rem; }
.who { font-weight:650; font-size:.8125rem; letter-spacing:.02em; text-transform:uppercase; }
.msg.human .who { color: var(--accent); }
.when { color: var(--muted); font-size:.75rem; }
.body { overflow-wrap:anywhere; }
.msg.human .body { background:var(--human-bg); padding:1rem 1.15rem; border-radius:.6rem; }
.body > :first-child { margin-top:0; }
.body > :last-child { margin-bottom:0; }
.body h1,.body h2,.body h3,.body h4 { line-height:1.3; margin:1.6rem 0 .6rem; }
.body h1 { font-size:1.4rem; } .body h2 { font-size:1.2rem; } .body h3 { font-size:1.05rem; }
pre { background:var(--code-bg); padding:.9rem 1rem; border-radius:.5rem; overflow-x:auto; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.875em; }
:not(pre) > code { background:var(--code-bg); padding:.15em .35em; border-radius:.25em; }
blockquote { margin:1rem 0; padding-left:1rem; border-left:3px solid var(--rule); color:var(--muted); }
table { border-collapse:collapse; width:100%; display:block; overflow-x:auto; }
th,td { border:1px solid var(--rule); padding:.4rem .6rem; text-align:left; }
img { max-width:100%; height:auto; }
hr { border:0; border-top:1px solid var(--rule); margin:2rem 0; }
`.trim();

export function renderHtml(thread, meta) {
  const title = escapeHtml(meta.name || 'Untitled conversation');
  const subtitle = [
    formatTimestamp(meta.created_at),
    `${thread.length} message${thread.length === 1 ? '' : 's'}`,
    meta.model,
  ].filter(Boolean).map(escapeHtml).join(' · ');
  const url = conversationUrl(meta.uuid);

  const messages = thread.map((message) => `
    <article class="msg ${message.role === 'human' ? 'human' : 'assistant'}">
      <div class="msg-head">
        <span class="who">${escapeHtml(speakerLabel(message.role))}</span>
        <time class="when">${escapeHtml(formatTimestamp(message.createdAt))}</time>
      </div>
      <div class="body">${marked.parse(message.text)}</div>
    </article>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<header>
<h1>${title}</h1>
<p class="meta">${subtitle}<br><a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(url)}</a></p>
</header>
${messages}
</main>
</body>
</html>
`;
}
