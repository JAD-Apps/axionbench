# Recovery and qualification

This is source recovery for `run_443e691f4ec6`, step `step_b6fcad72f456`. Publication, independent review, native triggering and owner capture belong to later steps. No commit, push, deployment or schedule mutation is performed here.

The source index was inspected entry by entry. Steps 0–7 form the chain `e7470a2`, `302f499`, `a034ffc`, `cd2c9cc`, `d3cb829`, `d0e8698`, `8590810`, `8c8dc46`. The base is `c3a915b717c999321e43148d522d160f4de805de`. Recovery retains this complete product, including the dark split hero, eleven routes, Chart.js views, BridgeBench publisher ratings, source policy, calculator and mathematical gates. No new scores, identities or prices are asserted by recovery.

Step 8 (`9a8de4f`) and step 12 (`28be14e`) independently added the same schedule files. Both sets of meaningful checks are retained in one client. It requires exact routing, dependency-free execution, one worker, collaboration off, consistent daemon timestamps, no next firing while disabled, a current client-source digest, a byte-exact response, a 72-hour freshness bound and live duplicate detection. Both `observe` and `readback` collect the canonical format. Earlier receipts are historical; their bytes are not rewritten to the new schema. Step 18 (`7c54a51`) restores the complete portable command list, including core and cohort views. The conflicted tree was read without resolving or editing its index.

Logical increments for the conductor to seal:

1. Recover accepted product/source chain and portable correction.
2. Reconcile disabled native schedule and preserve both regression sets.
3. Add strict qualification/approval, canonical readback and decoded-video gates.
4. Add production-target browser support, retire the superseded direct GitHub deployment workflow and update documentation. Restore readable homepage source/version table columns discovered by the unchanged responsive acceptance gate.

The package manager remains `npm@11.19.0`. The recovered lockfile is exactly the accepted Chart.js lockfile; no install updates it. Node 24 and Python 3 are required. `npm ci --include=dev --no-audit --no-fund` precedes checks. No new release profile, release configuration or verification command is added. The existing 21 private gates remain, together with the accepted additional portable/view gates.

## Read-only qualification interfaces

```
node scripts/project/qualify-public.mjs --verify-only [--packet <private file>]
node scripts/project/verify-receipts.mjs <mode> [--packet <private file>]
```

The default packet is `evidence/local/qualification/packet.json`. Modes are `candidate-qualification`, `candidate-review`, `publication`, `native-update`, `deployed-acceptance`, `owner-browser`, `hero-mp4`, `release-handoff`. Unknown modes/options fail. The original `--state-dir` and `--artifact file:sha256:bytes` interfaces remain available. Verification reads files and authenticated GET responses; it never creates a packet, seals a candidate, runs a worker, signs a review or takes a lease.

Packet schema: `axionbench-qualification-v1`, `at` (Unix milliseconds), `projectId`, `builderSessionIds`, `publicBaseCommit`, `candidatesSha256`, `candidates.private`, `candidates.public`, `receipts`. Each candidate has `root`, `distDir`, `sourceCommit`, `sourceSha256` and `identity` with source commit/source digest/product/data/control digests. Paths resolve against the packet directory. Both source checkouts must be clean sealed commits; source bytes and release files are recalculated. Public source uses the existing allowlisted manifest and must retain public ancestry while excluding private ancestry. Private source uses the same canonical file-record digest format over its full tracked tree, including retained private foundation inputs. Pair identity is SHA-256 of `JSON.stringify({private: identity, public: identity})`.

Each named entry has `artifact: {path,bytes,sha256}` and `authority: {runId,pointer,sha256,producerSessionId}`. Artifacts are regular bounded files, with no traversal or ancestor symlinks. Their JSON is `axionbench-evidence-v1`, with `mode`, `passed:true`, `fixture:false`, `at`, `sessionId` and `candidatesSha256`. The verifier follows a daemon step/evaluation evidence JSON pointer (never a brief or arbitrary field) in a fresh authenticated `GET /v1/runs/<runId>` and requires a structured `axionbench-authority-v1` statement issued by JadBot, with the same mode/candidate pair, the evidence artifact digest, producer, pass, nonfixture status and issue time. It also reads the producer session and verifies requested/effective/provider-reported Sol6.1/high, Fast OFF, default tier, pin and observations. A local hash or an unsigned text verdict cannot supply authority. All receipts expire after 72 hours; a changed candidate invalidates the chain.

Mode-specific fields are enforced in `scripts/project/qualification.mjs`:

- Qualification includes both complete command/log sets, isolated frozen install and its log, unchanged lock hash, disabled schedule/client readback, draft preservation and private/public commit mapping. Commands use the exact declared gate lists. Each row records actual exit, duration, log size and hash; product/data digests bind the executed release. It requires genuine evidence of installation, not a command string alone.
- Review requires an approved verdict, a distinct nonbuilder session, successful daemon step, exact step routing and a hashed review report.
- Publication/native update check retained snapshots, journal receipts, the canonical provider deployment and every HTTPS byte. Native update also requires the enabled live schedule, exact native run/history, last-good negative case and verified rollback artifacts.
- Deployed acceptance requires all five production harness reports, exact hosted identities and screenshot bytes, with GUI lease records. Owner browser adds a connected paired Windows site-browser grant, URL/title and screenshot.
- Hero MP4 requires actual probe/full decoding and changing frames plus a matching authenticated attachment. Handoff requires the complete chain and daemon submission readiness, with final evaluation truthfully pending the daemon.

## Publication barrier

`publishSnapshot` performs integrity and authenticated independent approval before requesting an upload token or any remote publication action. Its default approval file comes from `AXIONBENCH_PUBLICATION_APPROVAL` and trusted `AXIONBENCH_JADBOT_PROJECT_ID`. Schema `axionbench-publication-approval-v1` holds an authority reference to an approved independent `candidate-review` statement bound to exact snapshot/revision/source/product/data/control/overlay identities and builder identities. A new daily revision needs its own exact approval; previous review cannot authorize different refreshed bytes. Tests inject a synthetic authorizer only into the fake API transaction, and separately prove that the default barrier refuses every upload without approval.

`npm run publish:site -- --state-dir <external state> --snapshot <reviewed digest>` consumes the retained approved candidate without rebuilding/restaging. Its key and code commit must match; all integrity/approval gates run before upload.

`npm run publish:daily` accepts local server bindings `AXIONBENCH_PUBLICATION_STATE`, `AXIONBENCH_AUDIT_DIR` and `AXIONBENCH_PUBLICATION_APPROVAL` and trusted `AXIONBENCH_JADBOT_PROJECT_ID`; explicit state/audit CLI arguments take precedence. Directories remain outside the source repository. Cloudflare credentials stay in local secret storage/environment, never browser or packet. The disabled registration is real; secret injection, review/sealing authority, first deployment, trigger and enablement remain later-stage prerequisites.

## Production and video verification

The existing route, core, cost/version, cohort and acceptance harnesses accept `--url https://axionbench.jadapps.app --expect-product <digest>`. They select that exact origin, fetch the hosted manifest/data/artifacts, bind their reports to source/product/data/control/overlay/revision, skip local builds and refuse response interception. Local adversarial fixtures remain in local verification; their reports do not count as production capture. Previous browser evidence is copied to ignored history before replacement. Screenshots include byte sizes and digests.

`readback.mjs --latest --state-dir <external state>` (or `AXIONBENCH_PUBLICATION_STATE`) verifies the ledger's retained canonical snapshot and the provider's canonical deployment. It never substitutes a fresh private build or a newer failed deployment. `production:check` verifies all served files and detects a manifest changing during readback.

Video verification needs real `ffprobe` and `ffmpeg`, or provisioned executables named by `AXIONBENCH_FFPROBE`/`AXIONBENCH_FFMPEG`. It requires MP4, H.264, yuv420p, 100–4096-pixel dimensions, a matching 2–180-second duration, every declared frame decoded without error and at least two distinct frame hashes. Each capture video declares `video: {codec:"h264",width,height,duration}`. A header stub or renamed WebM fails. Fixture probe/decoder outputs are regression tests only.

## Genuine observations and remaining proof

Ignored `evidence/local/recovery/routing-observation.json` records authenticated current-session/run observations and raw-response digests. The API reported requested/effective/provider model Sol6.1/high, Fast OFF, default tier, no violation, collaboration false and this step's worker limit 1. `evidence/local/schedule/readback.json` is a fresh authenticated byte/source-bound schedule response; disabled live registration and absence of duplicates were checked.

The inspected run GET exposes model receipts and evaluation fields, but no sealed-candidate, public-promotion or lease receipt fields. `GET /v1/quality/capabilities` exposes isolation capabilities only. Those observations do not establish that other APIs are unavailable; the later operator must obtain a supported authenticated structured candidate/review/sealing contract. This implementation does not fabricate it. Missing structured authority blocks qualification/publication. System ffmpeg/ffprobe are unavailable here; actual codec/provisioning/recording/attachment and Windows leases/pairing are later proof gaps. No owner browser or video receipt is claimed.

The daemon owns the exact saved combined verification and final verdict. Focused local results are evidence of implementation checks, not that verdict. Historical routing, source and failed receipts are preserved. No unrelated run is resumed.

The worktree linter now excludes Git-cached paths deleted from the current source tree. This supports the accepted removal of obsolete `src/chart-data.ts` before the conductor seals the recovery, while still parsing every present tracked/untracked source file. The original pricing/scoring/source gates and readability/contrast assertions are retained. The pricing/version history check waits for both the selected control and its URL state before asserting the same back/forward/reload contract.

## Local validation handoff

Actual local commands exited 0: locked installation; `npm run build`; `npm run typecheck`; `npm run lint`; `npm run test:pricing`; `npm run verify:automation`; the four named contract test files; all five browser harnesses; browser-runtime cleanup regressions; and disabled live schedule verification. Logs are under ignored `test-results/recovery-*.log`. The earlier combined contract run had 63 passes; the subsequently tightened boundary/qualification run had 20 passes. Responsive acceptance of the final homepage native-unit/version column fix passed 15 checks and produced 35 screenshots at 320/390/768/1440/1920 pixels. Original tariff replay covered 11 records and 33 cells. Failed scoping/report/history/layout attempts and their screenshots remain preserved.

The route/core/cost/cohort reports preceding the final localized table CSS fix are historical local evidence, with their own source hashes. The daemon's complete saved command must regenerate and qualify the complete final tree and portable archive; those earlier captures cannot substitute for it. No daemon pass, independent candidate approval, hosted CI, native trigger, deployment, Windows opening or attached playable MP4 is claimed by this handoff. The schedule is still disabled. The source index, conflict tree, older branches and receipts were not edited. No commit or push was made.
