// node scripts/release/verify-capture.mjs --capture <capture.json> [--release-manifest <file>]
// Read-only check of a deployed-site capture record (screenshots, hero video,
// page titles) before it is cited as acceptance evidence. A capture record:
//   { "schemaVersion": "axionbench-capture-v1", "url": "https://<approved host>/...",
//     "capturedAt": ISO time, "productSha256": hosted release product digest,
//     "dataSha256": hosted data digest, "browser": "...",
//     "files": [{ "path": "relative/to/record", "sha256", "bytes", "kind": "screenshot"|"video",
//                 "viewport": { "width", "height" }, "title": "page title" }] }
// Each file must be a regular file of exactly the recorded size and hash, a
// screenshot must be PNG, and a video must be an MP4 (ISO BMFF "ftyp" box) that
// also passes verifyVideo: a video record carries
//   "encoder": { "identity": "libx264" | ... }, "probe": { "tool": "ffprobe", "version": "<first line of ffprobe -version>" },
//   "durationSeconds"
// and ffprobe/ffmpeg (FFPROBE_PATH/FFMPEG_PATH or PATH; never Playwright's cached
// WebM-only ffmpeg) must show an actual H.264 stream of the recorded dimensions
// and duration that decodes completely with changing frames. Without those tools
// the video is not qualified and verification fails.
// With --release-manifest the capture must name that exact release.
// It proves the files are the recorded bytes; it cannot prove what a screen showed.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathProblem, sha256, validateManifest } from './manifest.mjs';

export const CAPTURE_SCHEMA = 'axionbench-capture-v1';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 200 * 1024 * 1024;
export const H264_ENCODERS = Object.freeze(['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox', 'h264_mf']);
const MIN_FRAMES = 3;

const run = (file, args) => new Promise((resolveRun) => {
  execFile(file, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, encoding: 'utf8' }, (error, stdout, stderr) =>
    resolveRun({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, stdout: String(stdout), stderr: String(stderr), missing: error?.code === 'ENOENT' }));
});

// Verifies the video's actual codec, geometry, duration and decodability with
// ffprobe/ffmpeg. `exec(file, args)` is injectable so tests can label fixture output.
export async function verifyVideo(path, file, { exec = run, ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe', ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg' } = {}) {
  assert.ok(H264_ENCODERS.includes(file.encoder?.identity), `${file.path}: encoder identity must be one of ${H264_ENCODERS.join(', ')}`);
  assert.equal(file.probe?.tool, 'ffprobe', `${file.path}: probe identity must be ffprobe`);
  assert.ok(Number.isFinite(file.durationSeconds) && file.durationSeconds >= 2 && file.durationSeconds <= 60, `${file.path}: recorded duration must be 2-60 s`);
  assert.ok(file.viewport?.width >= 640 && file.viewport?.height >= 360, `${file.path}: recorded dimensions`);
  const version = await exec(ffprobe, ['-version']);
  assert.ok(!version.missing && version.code === 0, 'ffprobe is unavailable: an MP4 cannot be qualified as H.264 without it');
  assert.equal(version.stdout.split('\n')[0].trim(), file.probe.version, `${file.path}: ffprobe identity differs from the record`);
  const decoders = await exec(ffmpeg, ['-hide_banner', '-decoders']);
  assert.ok(!decoders.missing && decoders.code === 0, 'ffmpeg is unavailable: an MP4 cannot be decoded and qualified');
  assert.ok(/^\s*V\S*\s+h264\s/m.test(decoders.stdout), 'this ffmpeg has no H.264 decoder (a WebM-only build is not qualified)');
  const probe = await exec(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames:format=duration', '-of', 'json', path]);
  assert.equal(probe.code, 0, `${file.path}: ffprobe could not read the video`);
  const info = JSON.parse(probe.stdout);
  const stream = info.streams?.[0];
  assert.equal(stream?.codec_name, 'h264', `${file.path}: actual codec is ${stream?.codec_name}, not h264`);
  assert.equal(stream.width, file.viewport.width, `${file.path}: video width differs from the record`);
  assert.equal(stream.height, file.viewport.height, `${file.path}: video height differs from the record`);
  const duration = Number(info.format?.duration);
  assert.ok(Number.isFinite(duration) && Math.abs(duration - file.durationSeconds) <= 0.5, `${file.path}: actual duration ${duration}s differs from the recorded ${file.durationSeconds}s`);
  assert.ok(Number(stream.nb_read_frames) >= MIN_FRAMES, `${file.path}: too few frames`);
  const decode = await exec(ffmpeg, ['-v', 'error', '-i', path, '-an', '-f', 'framemd5', '-']);
  assert.equal(decode.code, 0, `${file.path}: ffmpeg failed to decode the whole video`);
  assert.equal(decode.stderr.trim(), '', `${file.path}: decoding reported errors: ${decode.stderr.trim().slice(0, 200)}`);
  const hashes = decode.stdout.split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split(',').pop().trim());
  assert.equal(hashes.length, Number(stream.nb_read_frames), `${file.path}: decoded frame count differs from the stream`);
  const distinct = new Set(hashes).size;
  assert.ok(distinct >= MIN_FRAMES, `${file.path}: frames do not change (${distinct} distinct)`);
  return { codec: 'h264', width: stream.width, height: stream.height, durationSeconds: duration, frames: hashes.length, distinctFrames: distinct, decoded: 'complete' };
}

export async function verifyCapture(record, { root, hostname, releaseManifest = null, videoTools = {} }) {
  assert.equal(record?.schemaVersion, CAPTURE_SCHEMA, 'unknown capture schema');
  const url = new URL(record.url);
  assert.equal(url.protocol, 'https:', 'capture must be of the HTTPS site');
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
  const videos = [];
  for (const file of record.files) {
    assert.equal(pathProblem(file.path), null, `capture file path ${JSON.stringify(file.path)}`);
    assert.ok(!seen.has(file.path), `capture lists ${file.path} twice`);
    seen.add(file.path);
    assert.ok(['screenshot', 'video'].includes(file.kind), `${file.path}: kind must be screenshot or video`);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= MAX_BYTES, `${file.path}: bounded byte count`);
    const path = join(root, file.path);
    const info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${file.path} must be a regular file`);
    assert.equal(info.size, file.bytes, `${file.path}: size differs from the record`);
    const bytes = await readFile(path);
    assert.equal(sha256(bytes), file.sha256, `${file.path}: hash differs from the record`);
    if (file.kind === 'screenshot') {
      assert.ok(bytes.subarray(0, 8).equals(PNG), `${file.path} is not a PNG`);
      if (file.viewport) {
        assert.equal(bytes.readUInt32BE(16), file.viewport.width, `${file.path}: PNG width differs from the viewport`);
        assert.equal(bytes.readUInt32BE(20), file.viewport.height, `${file.path}: PNG height differs from the viewport`);
      }
    } else {
      assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp', `${file.path} is not an MP4`);
      videos.push({ path: file.path, sha256: file.sha256, ...(await verifyVideo(path, file, videoTools)) });
    }
    kinds[file.kind] = (kinds[file.kind] ?? 0) + 1;
  }
  return { url: record.url, capturedAt: record.capturedAt, productSha256: record.productSha256, files: record.files.length, kinds, videos };
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
