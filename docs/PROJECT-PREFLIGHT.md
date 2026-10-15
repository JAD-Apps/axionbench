# Admission and private recovery

This document is for the private project checkout. Do not include it, project
preflight scripts, private recovery archives or admission receipts in the public
source export. Public users need product and data validation, not owner records.

Run the focused checks with:

```sh
node --test tests/project/preflight.test.mjs
node scripts/project/preflight.mjs --verify
```

For the recovered portable regression, run
`node scripts/project/check-recovered-boundary.mjs evidence/local/recovery/drained-boundary-v1`.
This validates the original public source manifest, copies its exact files into
an ignored disposable candidate, applies only the three repaired boundary files,
seals that candidate and runs all 16 original adversarial boundary fixtures.
Its receipt states `nativeAcceptance:false` and records the actual exit and
log hash. The immutable original is retained. The focused local run passed on
2 October; it is not the full portable/release suite or daemon acceptance.

The second command requires genuine supported-API receipts in ignored
`evidence/local/admission/`. It fails when receipts are absent, stale, changed,
bound to different source, or missing mandatory model observations. Unit fixtures
only test the validator; they never count as admission evidence. The daemon owns
the final execution of the saved verification command.

To capture receipts, set `JADBOT_API_URL` to the local daemon URL,
`JADBOT_TOKEN_FILE` to the existing local bearer-token file, `JADBOT_RUN_ID` and
`JADBOT_SESSION_ID` to the admitted run and worker, and `AXIONBENCH_RECOVERY` to
the relative private recovery directory. Run:

```sh
node scripts/project/preflight.mjs --capture
```

Capture reads the old run/session, new run/worker/planner, project, secret names
and presence, browser status and registered automations through the deployed API.
It never retrieves secret values. The registration probe submits an empty body
to `POST /v1/automations`: a 404 records that registration is unavailable there;
other responses require inspection rather than an assumed registration grant.
Browser status is capability evidence, not proof of opening or recording a site.

The inspected old checkout lacked modelPin, but deployed daemon **0.1.107**
returns `modelPin`, `modelPinAudit`, `modelReceipts` and completion receipts.
Its supported run PATCH accepts a scoped modelPin. After the coordinator pauses
and fully drains the run, `--capture --pin` applies the requested
`codex/gpt-6.1-sol/high` pin and reads it back. This does not alter global routing,
stop workers, resume the old workflow or start any model calls. All 12 step
choices and worker choices must match; each step must use one worker and
collaboration must be disabled. Provider initialization must report the model,
high effort and Fast OFF, with a standard/default service tier and a matching
execution observation. Missing observations fail rather than echoing requests.
The scoped runtime pin forbids fallback; historical unpinned work cannot be
retroactively certified by adding a pin later.

## Recovery

`scripts/project/recover.py` accepts `--archive`, `--manifest`, `--draft` and
`--output`. Use an ignored `evidence/local/recovery/` output directory that does
not exist. It accepts only the coordinator's immutable archive with SHA-256
`d83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b`.
It validates all 526 regular members against manifest sizes and hashes and
rejects traversal, duplicate members and symlinks. It never reads the stopped
worker's live worktree.
The captured coordinator manifest hash is
`dae38b64be7c06a054b566eb2a5b63fa4c281c45c32ff32e49d75caf6553b2bc`;
preflight also pins that receipt identity, so a changed file inventory cannot
replace the coordinator's recorded inventory.

The recovery binds private baseline
`c3a915b717c999321e43148d522d160f4de805de` and public baseline
`b6fa8b0376aef8efec44e2399f17120b560f2d0c`. It stores the public baseline from
immutable Git objects, current tracked/nonignored untracked file bytes, deleted
paths, staged and worktree binary patches in private hashed artifacts. It reads
Git with optional locks disabled and compares HEAD, index, status and file
hashes after capture. No reset, commit, branch, fetch or shared Git metadata
change is involved. Ignored dependency/build caches are outside the draft
capture; the manifest records this policy explicitly.

The old native release **failed** with exit 1. Its 21 original private gates
passed; the additional `verify:public` failed. Earlier worker-local passing
receipts remain local results, not native acceptance. The exact final boundary
log records `EROFS` from `mkdtemp('/tmp/axionbench-public-tests-…')` in the
native container. Recovered fixture code now uses the environment's writable
temporary directory. Fixtures retain their own repository marker, so sibling
audit paths remain outside each fixture even when an enclosing sandbox has Git
metadata. Negative tests retain rejection of in-repository audit paths.

Nineteen boundary implementation/template files were recovered by manifest
hash, without adopting the old UI or changing packageManager, lockfiles or any
of the 21 existing release gates. Their immutable originals, exact raw
source/audit inputs, failed receipts and mapping stay under private recovery.
The next portable validation stage must integrate the recovered scripts into
package/release commands, rebuild the reviewed public snapshot and run the
full portable gate. Recovery alone does not qualify that snapshot.

## Observed gaps, 2 October 2026

The new run was admitted with all requested Sol6.1/high choices and
collaboration disabled, but `modelPin:null` and no exposed provider receipts.
It was paused to revoke new admissions while the current worker finishes
recovery. The coordinator must drain this attempt and set the scoped pin before
a fresh worker stage. This attempt cannot certify its own historical Fast/tier
or planner provider observations. Those values remain unknown.
An actual scoped PATCH with the requested pin returned HTTP 409:
`Pause the run and let it drain before changing its model pin`. The untouched
API response is retained privately as
`evidence/local/admission/api/scoped-pin-attempt.json`. The real preflight
exited 1 for the missing modelPin; the current implementation has 20 passing
focused regression checks. This step is not admitted or daemon-qualified.

The automation API supports list, run and enable for registered jobs; arbitrary
registration is not exposed at `POST /v1/automations`. A native custom daily
workflow is a later integration gap until a supported registration contract is
proved. The connected Windows desktop is reported available, but browser
opening, fresh screenshots and recording have not been exercised in this step.
Cloudflare credential availability must be qualified from local storage/server
bindings in the publication stage; the secret-name list alone supplies no
Cloudflare entry or API permission proof. System ffmpeg/ffprobe were absent in
the supplied discovery; cached Playwright ffmpeg's H.264 limitation remains a
recording-stage dependency. No deployment, schedule enablement, independent
review, public CI or owner-browser acceptance is claimed here.
