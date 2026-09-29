// Markdown transcript.
//
// Speaker labels are bold paragraphs rather than headings on purpose: Claude's
// replies are themselves Markdown and routinely open with `##`, so heading-based
// labels would interleave with the reply's own document structure.

import { formatTimestamp, conversationUrl, speakerLabel } from './shared.js';

export function renderMarkdown(thread, meta) {
  const lines = [`# ${meta.name || 'Untitled conversation'}`, ''];

  const subtitle = [
    formatTimestamp(meta.created_at),
    `${thread.length} message${thread.length === 1 ? '' : 's'}`,
    meta.model,
  ].filter(Boolean).join(' · ');
  lines.push(`*${subtitle}*`, '', conversationUrl(meta.uuid), '');

  for (const message of thread) {
    lines.push('---', '');
    lines.push(`**${speakerLabel(message.role)}** — ${formatTimestamp(message.createdAt)}`, '');
    lines.push(message.text, '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
