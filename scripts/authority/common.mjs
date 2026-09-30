// Shared helpers for original-source authority adapters. Refresh functions fetch,
// validate the complete response, archive raw bytes only in a caller-supplied
// private audit directory, and replace the committed factual projection atomically.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export const USER_AGENT = 'AxionBench source adapter/1';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const stableRowsSha256 = (rows) => sha256(Buffer.from(JSON.stringify(rows)));

export async function fetchBytes(url, { fetcher = fetch, maxBytes = 25_000_000 } = {}) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': USER_AGENT } });
  assert.equal(response.status, 200, `source retrieval failed for ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 0 && bytes.length <= maxBytes, `source size outside reviewed bounds for ${url}: ${bytes.length} bytes`);
  return bytes;
}

export async function archiveRaw(auditDir, bytes, extension) {
  assert.ok(auditDir, 'a private audit directory is required');
  await mkdir(auditDir, { recursive: true });
  const path = resolve(auditDir, `${sha256(bytes)}.${extension}`);
  try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert.equal(sha256(await readFile(path)), sha256(bytes), 'content-addressed raw capture changed');
  }
  return path;
}

// Replace only after validation. A same-digest refresh keeps the first retrieval
// time; an older source generation than the last-good projection is refused.
export async function replaceProjection(output, projection, { generatedKey = 'generatedAt' } = {}) {
  let previous = null;
  try { previous = JSON.parse(await readFile(output, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous?.source?.sha256 === projection.source.sha256) projection.source.retrievedAt = previous.source.retrievedAt;
  const before = previous?.source?.[generatedKey];
  const after = projection.source[generatedKey];
  if (before && after) assert.ok(Date.parse(after) >= Date.parse(before), `stale refresh refused: source ${generatedKey} ${after} is older than last-good ${before}`);
  await mkdir(dirname(resolve(output)), { recursive: true });
  const temporary = `${resolve(output)}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(projection, null, 2) + '\n');
  await rename(temporary, resolve(output));
  return projection;
}

// RFC 4180 CSV with quoted fields, doubled quotes and embedded newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  assert.ok(!quoted, 'unterminated quoted CSV field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((cells) => cells.length > 1 || cells[0] !== '');
  assert.ok(header && new Set(header).size === header.length, 'CSV header missing or duplicated');
  return body.map((cells, index) => {
    assert.equal(cells.length, header.length, `CSV row ${index + 2} has ${cells.length} cells; header has ${header.length}`);
    return Object.fromEntries(header.map((key, column) => [key, cells[column]]));
  });
}

// Minimal ZIP reader (stored or deflated entries) for the public Epoch export.
export function readZip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  assert.ok(end >= 0, 'ZIP end record missing');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'ZIP central directory is malformed');
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50, 'ZIP local header is malformed');
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const raw = bytes.subarray(dataStart, dataStart + compressed);
    assert.ok(method === 0 || method === 8, `unsupported ZIP compression for ${name}`);
    if (!name.endsWith('/')) files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export const slug = (value) => value.trim().toLowerCase()
  .replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')
  .replace(/[._/\s:]+/g, '-').replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
