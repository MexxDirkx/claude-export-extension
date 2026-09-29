import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderConversation } from '../src/core/export.js';
import { createZip } from '../src/core/zip.js';

const branched = JSON.parse(readFileSync(new URL('../fixtures/branched.json', import.meta.url), 'utf8'));

test('exports a real 374-message branched conversation in every format', async () => {
  const files = renderConversation(branched, ['markdown', 'text', 'html', 'json']);
  assert.equal(files.length, 4);

  const byExt = Object.fromEntries(files.map((f) => [f.name.split('.').pop(), f.data]));
  for (const [ext, data] of Object.entries(byExt)) {
    assert.ok(data.length > 1000, `${ext} export is suspiciously small: ${data.length} bytes`);
  }

  assert.match(byExt.md, /^# Branched conversation$/m);
  assert.match(byExt.html, /^<!doctype html>/i);
  assert.doesNotMatch(byExt.txt, /```/);
  assert.deepEqual(JSON.parse(byExt.json), branched);

  const zip = await createZip(files);
  assert.equal(zip[0], 0x50);
});

test('the exported transcript contains no abandoned-branch messages', () => {
  const [md] = renderConversation(branched, ['markdown']);
  const speakerTurns = (md.data.match(/^\*\*(You|Claude)\*\* —/gm) || []).length;
  // 362 messages sit on the active chain; turns with no prose are dropped, so
  // the transcript must never exceed that and must not reach the full 374.
  assert.ok(speakerTurns <= 362, `got ${speakerTurns} turns, expected at most 362`);
  assert.ok(speakerTurns > 300, `got ${speakerTurns} turns, expected the bulk of the conversation`);
});
