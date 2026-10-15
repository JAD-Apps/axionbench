# Admission and boundary recovery

This is private project tooling. Do not export `scripts/project`,
`tests/project`, this document or `evidence/local` to the public repository.
The public boundary modules are portable code; their recovery receipts are not.
The recovered exporter copies the whole `tests` tree. Step 1 must explicitly
exclude the new private `tests/project` directory when integrating that exporter.
Use the recovered private source as implementation input, never publish the
archived product's old UI as the new approved design.

The owner applied the repaired daemon's supported run-scoped `modelPin` API
before this worker was admitted. Capture and verify its persisted audit instead
of changing global routing. The gate requires explicit planner, worker, reviewer
and all 12 step choices of `codex/gpt-6.1-sol/high`, collaboration disabled,
one worker per step, and provider initialization plus execution observations
showing High, Fast OFF and the default service tier. Missing observations fail.
Fleet default models may differ; actual requested/effective/provider choices
must follow the scoped pin. The pin prohibits automatic fallback.

The old run must remain paused, with its failed first step and stopped session.
No active, starting, verifying, background or authorized steps may remain.
The old release failed with exit 1: 21 private gates passed, and the added
`verify:public` gate failed. Historical Fast and service-tier observations are
unavailable. A later runtime cannot supply those missing historical facts.

## Commands

The inspected package uses `npm@11.19.0`, Node 24, a frozen npm lockfile,
TypeScript, Vite and Chromium browser checks. `npm run build` first generates
the validated data projection; `npm run build:release` produces
`dist/release-manifest.json`. `jadbot.quality.json` already supplies a concrete
artifact, health check, missing-index failure and build recovery. Keep those
and all 21 private release gates. This step does not run the broad release suite.

From the private worktree:

```sh
python3 scripts/project/recover-boundary.py --recover
node scripts/project/test-recovered-boundary.mjs
node scripts/project/capture-preflight.mjs <admitted-session-id>
node --test tests/project/preflight.test.mjs
node scripts/project/preflight.mjs --verify
```

Recovery verifies the coordinator's fixed SHA-256 archive before reading any
member and verifies all 526 member hashes. It never reads the stopped worker's
live worktree. No delivered commit was reported; the immutable archived content
hashes are the recovery identity. Raw source, original negative logs and the
tracked patch stay under ignored `evidence/local/project-preflight/recovery`.
Existing recovery is checked, never overwritten.

The preservation receipt binds private baseline
`c3a915b717c999321e43148d522d160f4de805de` and public baseline
`b6fa8b0376aef8efec44e2399f17120b560f2d0c`. It includes a Git baseline archive,
all current tracked and untracked draft files, binary/staged patches and exact
status. Git reads use `GIT_OPTIONAL_LOCKS=0`; recovery does not reset, commit,
checkout, push or change shared Git metadata. Recheck preservation before
later public edits. Public implementation must use existing public ancestry.

The native failure was `EROFS` when the boundary tests hard-coded `/tmp`.
The repaired tests honour writable `TMPDIR`, with a worktree `test-results`
fallback for explicit read-only/permission failures. Each fixture retains its
own empty `.git` boundary marker. All 16 original negative/transaction checks
remain, including symlink audit refusal, frozen identities, nested raw payloads,
licensed tariffs, freshness, partial rollback and last-good retention. A real
run against a separate recovered product copy supplies `boundary-repair.json`
and its exact log hash. The preserved original is never resealed or changed.

## Observations and later gaps

The deployed runtime reports version `0.1.107`, container isolation available,
no mounted source and no inherited credentials. Supported API captures include
project/session permissions, secret names only, browser grants and scheduler
capabilities. The gate binds these captures to the current scripts, tests,
documentation and unchanged lockfile. Captures expire after 24 hours; refresh
them before a delayed daemon verification.

During this step existing JadBot workflows unexpectedly resumed in successive groups. The
gate rejected that state. The observed runs were paused through
their supported run pause APIs; private before/pause/after receipts are under
`evidence/local/project-preflight/paused-other-runs`. No run was restarted or
its history rewritten. A fresh active-run API capture must show only this run.
Additional admissions continued after 12 successful pause calls. Qualification
remains blocked on stable project isolation; see the ignored
`admission-blocker.json` and `latest-conflicting-run.json`. If other workflows
resume again, admission fails; do not reuse an earlier pass. The coordinator
must stop those admissions or obtain an owner-approved saved-constraint revision.

`POST /v1/automations` returns 404. List/run/enable work, but those operations
cannot register a new daily authenticated update callback. The vault routine
endpoint registers a routine reminder, not this publication transaction.
Step 8 needs a supported registration capability; this step neither changes
JadBot nor substitutes GitHub cron for a native workflow.

The secret-name API reports no Cloudflare-named binding. That observation does
not establish that previously authorized Wrangler/GitHub credentials are absent.
Later publication must qualify the actual secret store/bindings without logging
values. A connected owner desktop grant covers `app://jadbot`; production
navigation and screenshots remain for step 11. The deployed schema accepts the
recording action, but no recording or playable MP4 is claimed. System
ffmpeg/ffprobe are absent; cached Playwright ffmpeg lacks an H.264 encoder.

Independent review is required in step 9 with a separate reviewer identity and
an actual verdict on exact candidate hashes. No review has happened here.
Provider receipts for later executed stages must be checked again; this admission
receipt does not certify future stages, production, daily updates or browser proof.

The daemon owns acceptance of the exact saved command:

```sh
node --test tests/project/preflight.test.mjs && node scripts/project/preflight.mjs --verify
```

A worker's local result is preparatory evidence, not the daemon's acceptance.
Fixtures are visibly synthetic regression inputs and are never admission receipts.
