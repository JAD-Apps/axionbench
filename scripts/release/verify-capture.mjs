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
import { lstat, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathProblem, sha256, validateManifest } from './manifest.mjs';
import { routes } from '../../src/routes.ts';

export const CAPTURE_SCHEMA = 'axionbench-capture-v1';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 200 * 1024 * 1024;
const execute = promisify(execFile);

// Acceptance requires a decodable, moving video, not merely an MP4 header.
// Missing decoders are a specific blocker; no header-only fallback is used.
export async function probeHero(path) {
  const { stdout } = await execute('ffprobe', ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,nb_read_frames:format=duration','-of','json',path], { timeout: 60000, maxBuffer: 1024 * 1024 });
  const metadata = JSON.parse(stdout), stream = metadata.streams?.[0];
  assert(stream && Number(metadata.format?.duration) >= 3 && Number(metadata.format.duration) <= 120, 'hero video must have 3–120 seconds of playable video');
  assert(Number(stream.nb_read_frames) >= 30 && stream.width >= 320 && stream.height >= 200, 'hero video has insufficient decoded frames or dimensions');
  const frames = await execute('ffmpeg', ['-v','error','-i',path,'-map','0:v:0','-an','-f','framemd5','-'], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const hashes = frames.stdout.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  assert(new Set(hashes).size > 1, 'hero video has no decoded frame movement');
  return { codec: stream.codec_name, duration: Number(metadata.format.duration), frames: hashes.length, width: stream.width, height: stream.height };
}

export async function verifyCapture(record, { root, hostname, releaseManifest = null, requireAcceptance = false, now = Date.now(), probeVideo = probeHero }) {
  assert.equal(record?.schemaVersion, CAPTURE_SCHEMA, 'unknown capture schema');
  const url = new URL(record.url);
  assert.equal(url.protocol, 'https:', 'capture must be of the HTTPS site');
  assert.equal(url.hostname, hostname, `capture is of ${url.hostname}, not the approved ${hostname}`);
  assert.equal(url.origin, `https://${hostname}`, 'capture origin/port is not approved');
  assert(!url.username && !url.password, 'capture URL credentials refused');
  assert.ok(Number.isFinite(Date.parse(record.capturedAt)), 'capturedAt');
  if (requireAcceptance) {
    assert(releaseManifest, 'acceptance capture requires the exact release manifest');
    assert(Date.parse(record.capturedAt) >= Date.parse(releaseManifest.builtAt) && Date.parse(record.capturedAt) <= now + 60_000 && now - Date.parse(record.capturedAt) <= 72 * 3600_000, 'capture predates release, is stale or future');
    assert(typeof record.browser === 'string' && record.browser.length, 'capture browser identity missing');
  }
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
  const videos = [];
  for (const file of record.files) {
    assert.equal(pathProblem(file.path), null, `capture file path ${JSON.stringify(file.path)}`);
    assert.ok(!seen.has(file.path), `capture lists ${file.path} twice`);
    seen.add(file.path);
    assert.ok(['screenshot', 'video'].includes(file.kind), `${file.path}: kind must be screenshot or video`);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_BYTES, `${file.path}: bounded byte count`);
    const path = join(root, file.path);
    let component = root;
    for (const part of file.path.split('/')) { component = join(component, part); assert(!(await lstat(component)).isSymbolicLink(), `${file.path}: enclosing symlink refused`); }
    const info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${file.path} must be a regular file`);
    assert.equal(info.size, file.bytes, `${file.path}: size differs from the record`);
    const bytes = await readFile(path);
    assert.equal(sha256(bytes), file.sha256, `${file.path}: hash differs from the record`);
    if (file.kind === 'screenshot') {
      assert(bytes.length >= 24, `${file.path}: truncated PNG`);
      assert.ok(bytes.subarray(0, 8).equals(PNG), `${file.path} is not a PNG`);
      if (file.viewport) {
        assert.equal(bytes.readUInt32BE(16), file.viewport.width, `${file.path}: PNG width differs from the viewport`);
        assert.equal(bytes.readUInt32BE(20), file.viewport.height, `${file.path}: PNG height differs from the viewport`);
      }
    } else {
      assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp', `${file.path} is not an MP4`);
      if (requireAcceptance) {
        assert.equal(file.page, '/', 'hero video must show the homepage');
        assert.equal(file.scene, 'above-fold-animated-hero', 'hero video scene missing');
        videos.push({ path: file.path, ...await probeVideo(path) });
      }
    }
    kinds[file.kind] = (kinds[file.kind] ?? 0) + 1;
  }
  if (requireAcceptance) {
    assert(videos.length > 0, 'playable hero MP4 missing');
    const homes = record.files.filter(file => file.kind === 'screenshot' && file.page === '/' && typeof file.title === 'string' && file.title.includes('AxionBench'));
    assert(homes.some(file => file.viewport?.width <= 430) && homes.some(file => file.viewport?.width >= 1280), 'fresh mobile/desktop homepage screenshots missing');
    for (const route of routes) {
      const shots = record.files.filter(file => file.kind === 'screenshot' && file.page === route.path && file.title?.includes('AxionBench'));
      assert(shots.some(file => file.viewport?.width <= 430) && shots.some(file => file.viewport?.width >= 700 && file.viewport.width <= 1024) && shots.some(file => file.viewport?.width >= 1280), `${route.path}: deployed mobile/tablet/desktop screenshots missing`);
    }
  }
  return { url: record.url, capturedAt: record.capturedAt, productSha256: record.productSha256, files: record.files.length, kinds, ...(requireAcceptance ? { videos } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  assert.ok(option('--capture'), 'usage: verify-capture.mjs --capture <capture.json> [--release-manifest <file>]');
  const config = JSON.parse(await readFile(new URL('../../deploy.config.json', import.meta.url), 'utf8'));
  const record = JSON.parse(await readFile(option('--capture'), 'utf8'));
  const releaseManifest = option('--release-manifest') ? JSON.parse(await readFile(option('--release-manifest'), 'utf8')) : null;
  console.log(JSON.stringify(await verifyCapture(record, { root: dirname(resolve(option('--capture'))), hostname: config.hostname, releaseManifest, requireAcceptance: args.includes('--acceptance') }), null, 2));
}
