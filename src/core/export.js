// Turns one API conversation payload into the files the user asked for.
//
// Archive paths are format-first (markdown/…, text/…) so a reader can grab every
// transcript in their preferred format without walking hundreds of folders.

import { buildThread } from './thread.js';
import { conversationBasename, uniqueName } from './filename.js';
import { renderMarkdown } from './render/markdown.js';
import { renderText } from './render/text.js';
import { renderHtml } from './render/html.js';
import { FORMATS } from './formats.js';

export { FORMATS };

const RENDERERS = {
  markdown: (thread, meta) => renderMarkdown(thread, meta),
  text: (thread, meta) => renderText(thread, meta),
  html: (thread, meta) => renderHtml(thread, meta),
  json: (thread, meta, conversation) => `${JSON.stringify(conversation, null, 2)}\n`,
};

export function renderConversation(conversation, formatIds, taken = new Set()) {
  const thread = buildThread(conversation);
  const basename = uniqueName(conversationBasename(conversation), taken);

  return FORMATS
    .filter((format) => formatIds.includes(format.id))
    .map((format) => ({
      name: `${format.dir}/${basename}.${format.ext}`,
      data: RENDERERS[format.id](thread, conversation, conversation),
    }));
}
