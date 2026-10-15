// node scripts/release/verify-capture.mjs --capture <capture.json> [--release-manifest <file>]
// Read-only check of a deployed-site capture record (screenshots, hero video,
// page titles) before it is cited as acceptance evidence. A capture record:
//   { "schemaVersion": "axionbench-capture-v1", "url": "https://<approved host>/...",
//     "capturedAt": ISO time, "productSha256": hosted release product digest,
//     "dataSha256": hosted data digest, "browser": "...",
//     "files": [{ "path": "relative/to/record", "sha256", "bytes", "kind": "screenshot"|"video",
//                 "viewport": { "width", "height" }, "title": "page title" }] }
// Each file must be a regular file of exactly the recorded size and hash, a
// screenshot must be PNG, and a video must be an MP4 (ISO BMFF "ftyp" box).
// With --release-manifest the capture must name that exact release.
// It proves the files are the recorded bytes; it cannot prove what a screen showed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathProblem, sha256, validateManifest } from './manifest.mjs';

export const CAPTURE_SCHEMA = 'axionbench-capture-v1';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 200 * 1024 * 1024;

// Probe and fully decode every video frame. A renamed WebM, an ftyp stub,
// truncated tail, unsupported codec or a static image cannot pass this check.
export function verifyVideo(path, expected, { run = spawnSync } = {}) {
  assert(expected && expected.codec === 'h264', 'video metadata must require browser-playable h264');
  const execute = (tool, args) => {
    const result = run(tool, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    assert(!result.error && result.status === 0, `${tool} video probe/decode unavailable or failed: ${result.error?.code ?? result.status}`);
    assert(!(result.stderr ?? '').trim(), `${tool} reported video decode errors`);
    return result.stdout;
  };
  const probe = JSON.parse(execute(process.env.AXIONBENCH_FFPROBE ?? 'ffprobe',
    ['-v','error','-show_streams','-show_format','-of','json',path]));
  assert(probe.format?.format_name?.split(',').includes('mp4'), 'video container is not MP4');
  const videos = probe.streams?.filter(s => s.codec_type === 'video');
  assert(videos?.length === 1, 'video must have one video stream');
  const stream = videos[0]; assert.equal(stream.codec_name, 'h264', 'video codec must be h264');
  assert.equal(stream.pix_fmt, 'yuv420p', 'video must use browser-compatible yuv420p');
  for (const key of ['width','height']) {
    assert(Number.isInteger(stream[key]) && stream[key] >= 100 && stream[key] <= 4096, 'video dimensions out of bounds');
    assert.equal(stream[key], expected[key], `video ${key} differs from capture metadata`);
  }
  const duration = Number(probe.format.duration);
  assert(Number.isFinite(duration) && duration >= 2 && duration <= 180, 'video duration must be 2–180 seconds');
  assert(Number.isFinite(expected.duration) && Math.abs(duration - expected.duration) <= 0.1, 'video duration differs from capture metadata');
  const decoded = execute(process.env.AXIONBENCH_FFMPEG ?? 'ffmpeg',
    ['-v','error','-xerror','-i',path,'-map','0:v:0','-an','-f','framemd5','-']);
  const rows = decoded.split('\n').filter(l => /^0,/.test(l)).map(l => l.split(',').map(v => v.trim()));
  assert(rows.length >= 2 && rows.every(r => r.length === 6 && /^[a-f0-9]{32}$/.test(r[5])), 'video full frame decoding did not succeed');
  assert(new Set(rows.map(r => r[5])).size >= 2, 'video has no changing frames');
  if (stream.nb_frames && stream.nb_frames !== 'N/A') assert.equal(rows.length, Number(stream.nb_frames), 'video decoding stopped before the last frame');
  return { codec: stream.codec_name, width: stream.width, height: stream.height, duration, frames: rows.length,
    changingFrames: true, probeSha256: sha256(Buffer.from(JSON.stringify(probe))), decodedSha256: sha256(Buffer.from(decoded)) };
}

export async function verifyCapture(record, { root, hostname, releaseManifest = null }) {
  assert.equal(record?.schemaVersion, CAPTURE_SCHEMA, 'unknown capture schema');
  const url = new URL(record.url);
  assert.equal(url.protocol, 'https:', 'capture must be of the HTTPS site');
  assert.equal(url.username + url.password + url.port + url.hash, '', 'capture URL cannot contain credentials, port or fragment');
  assert.equal(url.hostname, hostname, `capture is of ${url.hostname}, not the approved ${hostname}`);
  assert.ok(Number.isFinite(Date.parse(record.capturedAt)), 'capturedAt');
  assert.match(record.productSha256, /^[a-f0-9]{64}$/, 'productSha256');
  assert.match(record.dataSha256, /^[a-f0-9]{64}$/, 'dataSha256');
  if (releaseManifest) {
    validateManifest(releaseManifest);
    assert.equal(record.productSha256, releaseManifest.productSha256, 'capture names a different release product');
    assert.equal(record.dataSha256, releaseManifest.dataSha256, 'capture names different data');
  }
  assert.ok(Array.isArray(record.files) && record.files.length > 0 && record.files.length <= 500, 'capture must list 1-500 files');
  const seen = new Set();
  const kinds = {};
  for (const file of record.files) {
    assert.equal(pathProblem(file.path), null, `capture file path ${JSON.stringify(file.path)}`);
    assert.ok(!seen.has(file.path), `capture lists ${file.path} twice`);
    seen.add(file.path);
    assert.ok(['screenshot', 'video'].includes(file.kind), `${file.path}: kind must be screenshot or video`);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_BYTES, `${file.path}: bounded byte count`);
    let parent = root;
    for (const part of file.path.split('/')) { parent = join(parent, part); assert(!(await lstat(parent)).isSymbolicLink(), 'capture ancestor symlink refused'); }
    const path = join(root, file.path);
    const info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${file.path} must be a regular file`);
    assert.equal(info.size, file.bytes, `${file.path}: size differs from the record`);
    const bytes = await readFile(path);
    assert.equal(sha256(bytes), file.sha256, `${file.path}: hash differs from the record`);
    if (file.kind === 'screenshot') {
      assert.ok(bytes.length >= 33 && bytes.subarray(0, 8).equals(PNG), `${file.path} is not a PNG`);
      if (file.viewport) {
        assert.equal(bytes.readUInt32BE(16), file.viewport.width, `${file.path}: PNG width differs from the viewport`);
        assert.equal(bytes.readUInt32BE(20), file.viewport.height, `${file.path}: PNG height differs from the viewport`);
      }
    } else {
      assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp', `${file.path} is not an MP4`);
      verifyVideo(path, file.video);
    }
    kinds[file.kind] = (kinds[file.kind] ?? 0) + 1;
  }
  return { url: record.url, capturedAt: record.capturedAt, productSha256: record.productSha256, files: record.files.length, kinds };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  assert.ok(option('--capture'), 'usage: verify-capture.mjs --capture <capture.json> [--release-manifest <file>]');
  const config = JSON.parse(await readFile(new URL('../../deploy.config.json', import.meta.url), 'utf8'));
  const record = JSON.parse(await readFile(option('--capture'), 'utf8'));
  const releaseManifest = option('--release-manifest') ? JSON.parse(await readFile(option('--release-manifest'), 'utf8')) : null;
  console.log(JSON.stringify(await verifyCapture(record, { root: dirname(resolve(option('--capture'))), hostname: config.hostname, releaseManifest }), null, 2));
}
