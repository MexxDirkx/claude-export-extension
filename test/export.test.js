import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConversation, FORMATS } from '../src/core/export.js';

const conv = {
  uuid: 'd9e85010-a860-444a-b948-f22887ba4b36',
  name: 'Song Lyrics',
  created_at: '2026-09-02T05:11:41Z',
  model: 'claude-opus-5',
  current_leaf_message_uuid: 'm2',
  chat_messages: [
    { uuid: 'm1', parent_message_uuid: 'root', sender: 'human', created_at: '2026-09-02T05:11:41Z', content: [{ type: 'text', text: 'Hi' }] },
    { uuid: 'm2', parent_message_uuid: 'm1', sender: 'assistant', created_at: '2026-09-02T05:11:50Z', content: [{ type: 'text', text: '## Hello' }] },
  ],
};

test('exposes exactly the four supported formats', () => {
  assert.deepEqual(FORMATS.map((f) => f.id), ['markdown', 'text', 'html', 'json']);
});

test('renders one file per selected format with the right extension', () => {
  const files = renderConversation(conv, ['markdown', 'text']);
  assert.deepEqual(files.map((f) => f.name), [
    'markdown/2026-09-02-song-lyrics.md',
    'text/2026-09-02-song-lyrics.txt',
  ]);
});

test('json output is the untouched api response', () => {
  const [file] = renderConversation(conv, ['json']);
  assert.equal(file.name, 'json/2026-09-02-song-lyrics.json');
  assert.deepEqual(JSON.parse(file.data), conv);
});

test('every format of one conversation shares a basename', () => {
  const files = renderConversation(conv, ['markdown', 'text', 'html', 'json']);
  const stems = new Set(files.map((f) => f.name.split('/')[1].replace(/\.[^.]+$/, '')));
  assert.equal(stems.size, 1);
});

test('numbers same-day duplicate titles instead of overwriting', () => {
  const taken = new Set();
  const a = renderConversation(conv, ['markdown'], taken);
  const b = renderConversation({ ...conv, uuid: 'other' }, ['markdown'], taken);
  assert.equal(a[0].name, 'markdown/2026-09-02-song-lyrics.md');
  assert.equal(b[0].name, 'markdown/2026-09-02-song-lyrics-2.md');
});
