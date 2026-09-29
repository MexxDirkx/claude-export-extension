// Minimal ZIP writer.
//
// Compression comes from the platform's CompressionStream('deflate-raw'), so
// there is no third-party archiver to vendor or keep patched — only the
// container format lives here.
//
// Scope: no ZIP64. That caps an archive at 65535 entries and 4 GB, orders of
// magnitude beyond a personal conversation archive; createZip throws rather
// than emit an archive that silently exceeds those limits.

const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

const encoder = new TextEncoder();

export async function createZip(files) {
  if (files.length > MAX_ENTRIES) {
    throw new Error(`ZIP supports at most ${MAX_ENTRIES} entries, got ${files.length}`);
  }

  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const body = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const compressed = await deflateRaw(body);
    const crc = crc32(body);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);              // version needed
    lv.setUint16(6, 0x0800, true);          // UTF-8 filename flag
    lv.setUint16(8, 8, true);               // method: deflate
    lv.setUint16(10, 0, true);              // mod time (unset)
    lv.setUint16(12, 0x2100, true);         // mod date: 1996-08-01, a fixed value
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, body.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);              // extra field length
    local.set(nameBytes, 30);

    chunks.push(local, compressed);
    central.push({ nameBytes, crc, compressedSize: compressed.length, size: body.length, offset });
    offset += local.length + compressed.length;

    if (offset > MAX_BYTES) throw new Error('ZIP archive exceeds the 4 GB non-ZIP64 limit');
  }

  const directoryStart = offset;
  for (const entry of central) {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);              // version made by
    hv.setUint16(6, 20, true);              // version needed
    hv.setUint16(8, 0x0800, true);
    hv.setUint16(10, 8, true);
    hv.setUint16(12, 0, true);
    hv.setUint16(14, 0x2100, true);
    hv.setUint32(16, entry.crc, true);
    hv.setUint32(20, entry.compressedSize, true);
    hv.setUint32(24, entry.size, true);
    hv.setUint16(28, entry.nameBytes.length, true);
    hv.setUint16(30, 0, true);              // extra
    hv.setUint16(32, 0, true);              // comment
    hv.setUint16(34, 0, true);              // disk number
    hv.setUint16(36, 0, true);              // internal attrs
    hv.setUint32(38, 0, true);              // external attrs
    hv.setUint32(42, entry.offset, true);
    header.set(entry.nameBytes, 46);
    chunks.push(header);
    offset += header.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, offset - directoryStart, true);
  ev.setUint32(16, directoryStart, true);
  chunks.push(end);

  return concat(chunks);
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
