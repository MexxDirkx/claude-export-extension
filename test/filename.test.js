import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationBasename, uniqueName } from '../src/core/filename.js';

test('builds a date-prefixed slug from the conversation name', () => {
  const name = conversationBasename({
    name: 'Song Lyrics & Chord Ideas',
    created_at: '2026-09-02T05:11:41.698590Z',
    uuid: 'd9e85010-a860-444a-b948-f22887ba4b36',
  });

  assert.equal(name, '2026-09-02-song-lyrics-chord-ideas');
});

test('strips accents rather than dropping the words', () => {
  assert.equal(
    conversationBasename({ name: 'Café déjà vu', created_at: '2026-09-02T00:00:00Z', uuid: 'x' }),
    '2026-09-02-cafe-deja-vu',
  );
});

test('falls back to the uuid when the name has no usable characters', () => {
  assert.equal(
    conversationBasename({ name: '🎵🎶', created_at: '2026-09-02T00:00:00Z', uuid: 'd9e85010-a860-444a-b948-f22887ba4b36' }),
    '2026-09-02-d9e85010',
  );
});

test('truncates very long names without cutting mid-word', () => {
  const base = conversationBasename({
    name: 'a'.repeat(20) + ' ' + 'b'.repeat(200),
    created_at: '2026-09-02T00:00:00Z',
    uuid: 'x',
  });
  assert.ok(base.length <= 80, `basename too long: ${base.length}`);
  assert.ok(!base.endsWith('-'), 'should not end on a separator');
});

test('numbers collisions instead of overwriting', () => {
  const taken = new Set();
  assert.equal(uniqueName('2026-09-02-notes', taken), '2026-09-02-notes');
  assert.equal(uniqueName('2026-09-02-notes', taken), '2026-09-02-notes-2');
  assert.equal(uniqueName('2026-09-02-notes', taken), '2026-09-02-notes-3');
});
