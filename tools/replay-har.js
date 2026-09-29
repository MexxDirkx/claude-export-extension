// Replays conversation responses captured in a HAR through the real export
// pipeline. Verification aid: proves the exporter handles genuine API payloads,
// not just fixtures.
//
//   node tools/replay-har.js claude.ai.har out/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderConversation } from '../src/core/export.js';
import { createZip } from '../src/core/zip.js';

const [harPath, outDir = 'out'] = process.argv.slice(2);
const har = JSON.parse(readFileSync(harPath, 'utf8'));

const conversations = [];
for (const entry of har.log.entries) {
  const url = entry.request.url;
  if (!url.includes('/chat_conversations/') || url.includes('composer') || !url.includes('tree=True')) continue;
  let text = entry.response.content.text;
  if (!text) continue;
  if (entry.response.content.encoding === 'base64') text = Buffer.from(text, 'base64').toString('utf8');
  conversations.push(JSON.parse(text));
}

const taken = new Set();
const entries = conversations.flatMap((c) => renderConversation(c, ['markdown', 'text', 'html', 'json'], taken));

mkdirSync(outDir, { recursive: true });
const bytes = await createZip(entries);
writeFileSync(`${outDir}/claude-export.zip`, bytes);

console.log(`conversations: ${conversations.length}`);
console.log(`files: ${entries.length}`);
console.log(`archive: ${(bytes.length / 1024).toFixed(0)} KB`);
