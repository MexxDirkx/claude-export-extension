// Derives test fixtures from a captured HAR. Structure (message tree, block
// types, timestamps) is preserved; all human-readable text is replaced with
// synthetic filler so no personal conversation content lands in the repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod '
  + 'tempor incididunt ut labore et dolore magna aliqua enim minim veniam quis').split(' ');

const idFor = (real, kind) => {
  const h = createHash('sha256').update(String(real)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// Deterministic filler of roughly the same length as the original.
const filler = (real) => {
  if (typeof real !== 'string' || real === '') return real;
  const seed = parseInt(createHash('sha256').update(real).digest('hex').slice(0, 8), 16);
  const words = [];
  let n = seed;
  let len = 0;
  while (len < real.length) {
    n = (n * 1103515245 + 12345) >>> 0;
    const w = WORDS[n % WORDS.length];
    words.push(w);
    len += w.length + 1;
  }
  return words.join(' ').slice(0, Math.max(real.length, 1));
};

const scrubBlock = (b) => {
  const out = { ...b };
  if (typeof out.text === 'string') out.text = filler(out.text);
  if (typeof out.thinking === 'string') out.thinking = filler(out.thinking);
  if (typeof out.message === 'string') out.message = filler(out.message);
  if (Array.isArray(out.summaries)) out.summaries = out.summaries.map((s) => ({ ...s, summary: filler(s.summary) }));
  if (out.input) out.input = { redacted: true };
  if (out.display_content) out.display_content = { type: 'text', text: 'redacted' };
  if (out.content) out.content = Array.isArray(out.content) ? [{ type: 'redacted' }] : 'redacted';
  if (out.structured_content) delete out.structured_content;
  if (out.id) out.id = idFor(out.id);
  if (out.tool_use_id) out.tool_use_id = idFor(out.tool_use_id);
  return out;
};

const scrubConversation = (c, name) => ({
  ...c,
  uuid: idFor(c.uuid),
  name,
  summary: '',
  current_leaf_message_uuid: c.current_leaf_message_uuid ? idFor(c.current_leaf_message_uuid) : null,
  chat_messages: (c.chat_messages || []).map((m) => ({
    ...m,
    uuid: idFor(m.uuid),
    parent_message_uuid: m.parent_message_uuid ? idFor(m.parent_message_uuid) : m.parent_message_uuid,
    text: filler(m.text),
    content: (m.content || []).map(scrubBlock),
    files: (m.files || []).map((f, i) => ({
      ...f,
      uuid: idFor(f.uuid),
      file_uuid: idFor(f.file_uuid),
      file_name: `attachment-${i + 1}${(f.file_name || '').replace(/^.*(\.[^.]+)$/, '$1')}`,
    })),
  })),
});

const har = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const convs = [];
for (const e of har.log.entries) {
  const u = e.request.url;
  if (!u.includes('/chat_conversations/') || u.includes('composer') || !u.includes('tree=True')) continue;
  let t = e.response.content.text;
  if (!t) continue;
  if (e.response.content.encoding === 'base64') t = Buffer.from(t, 'base64').toString('utf8');
  convs.push(JSON.parse(t));
}

const branched = convs.reduce((a, b) => (b.chat_messages.length > a.chat_messages.length ? b : a));
writeFileSync('fixtures/branched.json',
  JSON.stringify(scrubConversation(branched, 'Branched conversation'), null, 2));

const withFiles = convs.find((c) => c.chat_messages.some((m) => (m.files || []).length));
if (withFiles && withFiles !== branched) {
  writeFileSync('fixtures/with-files.json',
    JSON.stringify(scrubConversation(withFiles, 'Conversation with attachments'), null, 2));
}

console.log('conversations in HAR:', convs.length);
console.log('branched.json: messages =', branched.chat_messages.length);
