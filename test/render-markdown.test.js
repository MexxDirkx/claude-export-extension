import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/core/render/markdown.js';

const meta = {
  uuid: 'd9e85010-a860-444a-b948-f22887ba4b36',
  name: 'Song Lyrics',
  created_at: '2026-09-02T05:11:41Z',
  model: 'claude-opus-5',
};

const thread = [
  { role: 'human', text: 'Write me a chorus.', createdAt: '2026-09-02T05:11:41Z' },
  { role: 'assistant', text: '## Chorus\n\nHere it is.', createdAt: '2026-09-02T05:11:50Z' },
];

test('renders the title, both speakers and their text', () => {
  const md = renderMarkdown(thread, meta);

  assert.match(md, /^# Song Lyrics$/m);
  assert.match(md, /\*\*You\*\*/);
  assert.match(md, /\*\*Claude\*\*/);
  assert.match(md, /Write me a chorus\./);
  assert.match(md, /Here it is\./);
});

test('does not let speaker labels collide with headings inside the reply', () => {
  const md = renderMarkdown(thread, meta);
  // The assistant's own "## Chorus" must survive as a real heading, so speaker
  // labels cannot themselves be ## headings.
  assert.match(md, /^## Chorus$/m);
  assert.doesNotMatch(md, /^## (You|Claude)$/m);
});

test('links back to the original conversation', () => {
  assert.match(renderMarkdown(thread, meta), /https:\/\/claude\.ai\/chat\/d9e85010-a860-444a-b948-f22887ba4b36/);
});
