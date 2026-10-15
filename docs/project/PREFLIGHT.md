# Admission and recovery

This private project check qualifies the new AxionBench workflow before its dependent workers run. It does not qualify a deployment or approve public publication.

Use Node 24 and the unchanged `npm@11.19.0` package manager and lockfile. The build runs `scripts/build-observatory-data.mjs` before Vite. The existing release runner retains all 21 mathematical, source, pricing, interaction and release gates. Recovered portable modules are available for the next integration step; that step must connect and qualify them without replacing the private gates. No dependencies are needed for the admission tests.

Run from the admitted project worktree:

```sh
node --test tests/project/preflight.test.mjs
node scripts/project/preflight.mjs --observe
node scripts/project/recovery.mjs --recover
node scripts/project/test-recovered-boundary.mjs
node scripts/project/preflight.mjs --verify
```

The daemon's exact step check is:

```sh
node --test tests/project/preflight.test.mjs && node scripts/project/preflight.mjs --verify
```

`--observe` sends only GET requests to the local daemon. It reads the local owner bearer without printing it or writing it to evidence. It never calls pause, start, stop, retry, PATCH or another control endpoint. The owner has already applied the scoped pin; a missing pin or receipt is a reported failure, not permission to change routing. Re-observe after any change to the admission implementation, fixtures or this document. The source hashes and observations expire after 24 hours. A failed observation is retained privately with its exact diagnostic.

Project isolation means the discovered container contract, available container runtime, isolated rehearsal mounts/secrets, and no other workflow working on AxionBench. Concurrent workflows on other projects are intended. Only the AxionBench project list is inspected for conflicting execution; unrelated workflows are never controlled.

The check requires explicit planner, worker, reviewer and every step choice of `codex/gpt-6.1-sol/high`, collaboration disabled, and the scoped pin audit at `1790907065508`. It verifies requested, effective and genuine provider-reported choices, Fast off, default provider tier, later configuration/model observations and absence of violations for every post-pin session. Background completion receipts are also checked if present. A separate review identity is checked when an evaluation exists; the actual independent review belongs to its later stage.

The owner named two historical exceptions: planner `01a0f8de-6322-7924-a378-426eb82327dd` and first worker `01a0fa50-8a1d-79a0-9f21-0229a3ba87bc`. Both must be stopped and predate the audit. Their actual API requested/effective choices are retained; provider model, Fast and tier remain `unavailable (pre-pin)`. No receipt is invented and no other session inherits this exception.

Private evidence lives under ignored `evidence/local/`. Admission includes daemon/version observations, project contract, requested/effective/provider receipts, session posture and permission decisions, scheduler list, secret names/presence only, browser grants and recording list. Session API posture does not attest filesystem writable roots; the worker environment supplies that policy. The verifier checks captured evidence without a bearer or network, so read-only review can inspect the capture rather than run a mutating collector. It does not claim that historical tier observations exist.

The snapshot copier excludes `tests/project/`. The portable source scanner rejects `scripts/project/`, `tests/project/` and `docs/project/`, keeping this private admission logic and its fixtures out of the public product.

Recovery uses the coordinator's immutable archive, never the stopped worker's live worktree. Its SHA256 is `d83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b`; all 526 source/audit/receipt member hashes and the tracked patch hash are verified. The daemon records a failed uncommitted worker, so there is no delivered worker commit to invent. The exact archived content hashes are the recovery identity. The private baseline is `c3a915b717c999321e43148d522d160f4de805de`; its immutable Git archive preserves raw inputs privately. The public draft baseline is `b6fa8b0376aef8efec44e2399f17120b560f2d0c`. Its tracked/untracked files, deletions, binary/index patches and immutable baseline are saved in a private hashed tar/manifest. Git optional locks are disabled; before/after metadata and draft bytes must match. Ignored credentials and dependency directories are excluded. Recovery refuses an existing public capture directory, avoiding accidental replacement of a prior receipt.

The old run remains paused/drained, with its worker stopped and first stage failed. Its native `npm run verify:release` exited 1: 21 private gates passed, added `verify:public` failed. The exact final portable log reports `EROFS` from `mkdtemp('/tmp/axionbench-public-tests-…')`. The recovered test now uses the runtime's writable `TMPDIR`; every fixture still has its own `.git` boundary. Regression checks prove that an external sibling audit is accepted and an internal or symlink-disguised audit is rejected, including scratch inside an enclosing repository. An unwritable scratch still fails openly. The original archive, manifest and negative receipts remain unchanged. The old UI is not adopted; redesign and portable release integration remain separate steps.

Capabilities observed on 2 October 2026: deployed daemon 0.1.107 exposes the pin/audit/receipts through its run GET API. Scheduler GET lists built-in jobs; the matching inspected route implementation supports list/run/enable, without arbitrary registration. No AxionBench daily job is registered. A native daily workflow needs a supported registration mechanism in its assigned stage; a GitHub cron is insufficient. The computer API shows a connected Windows desktop grant for the JadBot application, but no paired site-browser grant. Recording GET is available, with no current recording runs. Node, npm, Python, Git, gh and curl are available. System ffmpeg/ffprobe are absent; cached Playwright video tooling does not establish H.264 capability. Browser pairing/recording and MP4 encoding are concrete later-stage gaps, not completed proofs. No scheduler/runtime source or global routing is changed here.
