import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/core/render/html.js';

const meta = { uuid: 'u1', name: 'Song Lyrics', created_at: '2026-09-02T05:11:41Z', model: 'claude-opus-5' };
const one = (text) => renderHtml([{ role: 'assistant', text, createdAt: '2026-09-02T05:11:50Z' }], meta);

test('produces a standalone document titled after the conversation', () => {
  const html = one('Hi');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>Song Lyrics<\/title>/);
  assert.match(html, /<\/html>\s*$/);
});

test('renders markdown structure as real html', () => {
  const html = one('## Chorus\n\n- one\n- two\n\n**bold**');
  assert.match(html, /<h2[^>]*>Chorus<\/h2>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test('neutralises raw html embedded in a message', () => {
  const html = one('Before <script>alert(1)</script> after <img src=x onerror=alert(2)>');
  // The document must contain no live tag from the message at all; the escaped
  // text (&lt;script&gt;...) is inert and may remain visible to the reader.
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /Before/);
  assert.match(html, /after/);
});

test('drops javascript: urls from links', () => {
  const html = one('[click](javascript:alert(1))');
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('escapes the conversation title', () => {
  const html = renderHtml([], { ...meta, name: '</title><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('is fully self-contained with no external resources', () => {
  const html = one('# Hi\n\ntext');
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/i);
});

test('labels both speakers', () => {
  const html = renderHtml([
    { role: 'human', text: 'Q', createdAt: '2026-09-02T05:11:41Z' },
    { role: 'assistant', text: 'A', createdAt: '2026-09-02T05:11:50Z' },
  ], meta);
  assert.match(html, />You</);
  assert.match(html, />Claude</);
});
