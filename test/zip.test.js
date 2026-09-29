import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip } from '../src/core/zip.js';

// Reads the archive back with Python's zipfile: an independent implementation,
// so a bug in our writer cannot be masked by a matching bug in our reader.
function readBack(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const path = join(dir, 'a.zip');
  writeFileSync(path, bytes);
  const out = execFileSync('python3', ['-c', `
import json, zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
assert bad is None, bad
print(json.dumps({n: z.read(n).decode('utf8') for n in z.namelist()}))
`, path], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('round-trips file names and contents', async () => {
  const bytes = await createZip([
    { name: 'markdown/first.md', data: '# First\n\nhello' },
    { name: 'text/second.txt', data: 'plain content' },
  ]);

  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.deepEqual(readBack(bytes), {
    'markdown/first.md': '# First\n\nhello',
    'text/second.txt': 'plain content',
  });
});

test('round-trips non-ascii names and contents', async () => {
  const bytes = await createZip([{ name: 'md/café-déjà-🎵.md', data: 'héllo wörld 🎶' }]);
  assert.deepEqual(readBack(bytes), { 'md/café-déjà-🎵.md': 'héllo wörld 🎶' });
});

test('actually compresses repetitive text', async () => {
  const data = 'the quick brown fox\n'.repeat(2000);
  const bytes = await createZip([{ name: 'a.txt', data }]);
  assert.ok(bytes.length < data.length / 4, `expected compression, got ${bytes.length} vs ${data.length}`);
  assert.deepEqual(readBack(bytes), { 'a.txt': data });
});

test('writes a valid empty archive', async () => {
  const bytes = await createZip([]);
  assert.deepEqual(readBack(bytes), {});
});

test('handles many entries', async () => {
  const files = Array.from({ length: 300 }, (_, i) => ({ name: `c/${i}.txt`, data: `body ${i}` }));
  const back = readBack(await createZip(files));
  assert.equal(Object.keys(back).length, 300);
  assert.equal(back['c/299.txt'], 'body 299');
});
