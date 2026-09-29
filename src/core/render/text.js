// Plain-text transcript.
//
// Message bodies arrive as Markdown, so the syntax that only exists to be
// rendered (fences, emphasis markers, link brackets) is flattened away. The
// flattening is deliberately conservative: anything ambiguous is left alone
// rather than risk mangling the words themselves.

import { formatTimestamp, conversationUrl, speakerLabel } from './shared.js';

const RULE = '='.repeat(72);

export function renderText(thread, meta) {
  const subtitle = [
    formatTimestamp(meta.created_at),
    `${thread.length} message${thread.length === 1 ? '' : 's'}`,
    meta.model,
  ].filter(Boolean).join(' · ');

  const out = [
    meta.name || 'Untitled conversation',
    subtitle,
    conversationUrl(meta.uuid),
    '',
  ];

  for (const message of thread) {
    out.push(RULE);
    out.push(`${speakerLabel(message.role)}  (${formatTimestamp(message.createdAt)})`);
    out.push(RULE, '');
    out.push(flatten(message.text), '');
  }

  return `${out.join('\n').trimEnd()}\n`;
}

export function flatten(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    out.push(inline(line.replace(/^\s{0,3}#{1,6}\s+/, '')));
  }

  return out.join('\n');
}

function inline(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => (alt ? `${alt} (${url})` : url))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1$2');
}
