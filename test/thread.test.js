import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildThread } from '../src/core/thread.js';

const branched = JSON.parse(readFileSync(new URL('../fixtures/branched.json', import.meta.url), 'utf8'));

test('follows the active leaf chain and drops abandoned branches', () => {
  const thread = buildThread(branched);
  // The fixture holds 374 messages, but only 362 are reachable from
  // current_leaf_message_uuid; the other 12 are edit/regenerate leftovers.
  assert.equal(branched.chat_messages.length, 374);
  assert.ok(thread.length <= 362, `expected at most 362 messages, got ${thread.length}`);

  const reachable = new Set();
  const byUuid = new Map(branched.chat_messages.map((m) => [m.uuid, m]));
  let cur = branched.current_leaf_message_uuid;
  while (byUuid.has(cur)) {
    reachable.add(cur);
    cur = byUuid.get(cur).parent_message_uuid;
  }
  for (const m of thread) {
    assert.ok(reachable.has(m.uuid), `message ${m.uuid} is not on the active chain`);
  }
});

const conv = (messages) => ({
  uuid: 'c1',
  name: 'Test',
  current_leaf_message_uuid: messages[messages.length - 1].uuid,
  chat_messages: messages,
});

const msg = (uuid, parent, sender, content) => ({
  uuid,
  parent_message_uuid: parent,
  sender,
  created_at: '2026-01-01T00:00:00Z',
  content,
});

test('keeps text blocks and discards thinking and tool blocks', () => {
  const thread = buildThread(conv([
    msg('m1', 'root', 'human', [{ type: 'text', text: 'What is the capital?' }]),
    msg('m2', 'm1', 'assistant', [
      { type: 'thinking', thinking: 'The user wants a capital city.' },
      { type: 'text', text: 'Let me look that up.' },
      { type: 'tool_use', name: 'web_search', input: { query: 'capital' } },
      { type: 'tool_result', name: 'web_search', content: [{ type: 'knowledge' }] },
      { type: 'text', text: 'It is Paris.' },
    ]),
  ]));

  assert.equal(thread.length, 2);
  assert.equal(thread[0].text, 'What is the capital?');
  assert.equal(thread[1].text, 'Let me look that up.\n\nIt is Paris.');
});

test('drops messages that carry no prose', () => {
  const thread = buildThread(conv([
    msg('m1', 'root', 'human', [{ type: 'text', text: 'Run it.' }]),
    msg('m2', 'm1', 'assistant', [{ type: 'tool_use', name: 'bash_tool', input: {} }]),
    msg('m3', 'm2', 'assistant', [{ type: 'text', text: 'Done.' }]),
  ]));

  assert.deepEqual(thread.map((m) => m.text), ['Run it.', 'Done.']);
});

test('falls back to array order when the leaf uuid is unknown', () => {
  const messages = [
    msg('m1', 'root', 'human', [{ type: 'text', text: 'First' }]),
    msg('m2', 'm1', 'assistant', [{ type: 'text', text: 'Second' }]),
  ];
  const thread = buildThread({ chat_messages: messages, current_leaf_message_uuid: 'gone' });

  assert.deepEqual(thread.map((m) => m.text), ['First', 'Second']);
});
