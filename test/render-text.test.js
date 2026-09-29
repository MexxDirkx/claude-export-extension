import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderText } from '../src/core/render/text.js';

const meta = { uuid: 'u1', name: 'Song Lyrics', created_at: '2026-09-02T05:11:41Z', model: 'claude-opus-5' };
const one = (text) => renderText([{ role: 'assistant', text, createdAt: '2026-09-02T05:11:50Z' }], meta);

test('labels speakers in plain text', () => {
  const txt = renderText([
    { role: 'human', text: 'Hello', createdAt: '2026-09-02T05:11:41Z' },
    { role: 'assistant', text: 'Hi there', createdAt: '2026-09-02T05:11:50Z' },
  ], meta);

  assert.match(txt, /^Song Lyrics$/m);
  assert.match(txt, /\bYou\b/);
  assert.match(txt, /\bClaude\b/);
  assert.match(txt, /Hello/);
  assert.match(txt, /Hi there/);
});

test('strips heading markers', () => {
  const txt = one('## Chorus\n\nSing it.');
  assert.match(txt, /^Chorus$/m);
  assert.doesNotMatch(txt, /## Chorus/);
});

test('strips bold and italic markers but keeps the words', () => {
  const txt = one('This is **very** important and _quite_ nice.');
  assert.match(txt, /This is very important and quite nice\./);
});

test('flattens links to text plus url', () => {
  const txt = one('See [the docs](https://example.com/x) for more.');
  assert.match(txt, /See the docs \(https:\/\/example\.com\/x\) for more\./);
});

test('keeps fenced code content and drops the fences', () => {
  const txt = one('Run this:\n\n```bash\necho hello\n```\n\nDone.');
  assert.match(txt, /echo hello/);
  assert.doesNotMatch(txt, /```/);
});

test('leaves inline code content intact', () => {
  assert.match(one('Use `npm test` now.'), /Use npm test now\./);
});
