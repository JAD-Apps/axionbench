# Strict qualification and production acceptance

This step implements contracts for the later candidate, independent-review and production stages. It does not publish, enable a schedule, run an AI reviewer, capture the owner's browser or claim hosted CI. Keep the native schedule disabled until the separate approval and first-deployment gates pass.

## Verification and source identity

The daemon owns the final command:

```sh
node --test tests/project/native-schedule.test.mjs tests/project/public-boundary.test.mjs tests/project/update-transaction.test.mjs tests/project/qualification.test.mjs && npm run jadbot:verify
```

The existing `jadbot:verify` entry point and all 24 current release checks remain intact, including the qualified mathematical/source foundation and portable public boundary. The public runner still executes all 20 checks in order. Regression tests compare both lists against the actual runners. Package manager, dependencies and lockfile are unchanged.

`verify:release` now records a private source digest before and after execution, exact ordered commands, exits, durations and log sizes/hashes. A changed non-ignored source makes the receipt fail. The private digest hashes current tracked and non-ignored untracked source bytes, including this implementation, without exporting Git history. Build/browser output remains ignored. Historical receipts lacking these fields remain historical; obtain new receipts rather than editing them.

## Candidate inputs

The read-only functions in `scripts/project/qualification.mjs` consume externally trusted, sealed artifact descriptors. A descriptor is `{path, bytes, sha256}`; paths are relative to the supplied evidence root, bounded, regular and free of symlinks. The caller supplies `{sourceSha256, productSha256, dataSha256, controlSha256}` independently of the receipts. Hash equality proves bytes and bindings, not who generated a receipt.

- `qualifyCandidate({kind, sourceRoot, distDir, evidenceRoot, receipt, browsers, expected, now})`: `kind` is `private` or `public`. Private source is fingerprinted; public archive source must pass the complete public source manifest. The actual release tree, route files and data projection binding must match the trusted identities. Receipt commands, exits and every log hash must match the entire appropriate gate list. Receipts and browser reports must be at most 72 hours old. The source is checked again at the end. A dirty private candidate can be assessed; it remains unsuitable for publication.
- `browsers` must contain `routes`, `core-views`, `cost-version-views`, `cohort-views`. Each value is a report descriptor plus `screenshots: [{path, bytes, sha256}]`. Source lists must equal the actual runner's complete declaration. Every source byte, data-manifest hash and screenshot hash is checked. When using timestamped portable copies, set `originalPath` on each screenshot descriptor to the path written in its report, and `path` to the preserved artifact. Do not rewrite reports to change their paths.
- `verifyArchiveQualification({root, descriptor, expected})`: checks the fresh archive receipt, bounded tar artifact, exact install/verification commands and logs, extracted source and release manifests, nested portable receipt, all portable commands and the complete copied evidence tree. Local archive success continues to report `hostedCI: false` and `independentReview: false`.

The candidate result explicitly leaves `independentReview`, `publicationApproved` and `productionVerified` false. Later stages must consume the exact identities rather than treating integrity checks as approval.

## Separate review

`verifyIndependentReview({root, descriptor, privateCandidate, publicCandidate, authorIdentity, reviewerIdentity, now})` requires a separately trusted reviewer identity and both complete sealed candidate identity objects. Receipt schema is `axionbench-independent-review-v1`, with `verdict: approved`, author/reviewer identities, both candidates, actual `requestedChoice` and `effectiveChoice` equal to codex/gpt-6.1-sol/high, `providerReportedModel: gpt-6.1-sol`, `providerReportedEffort: high`, `fast: false`, `fallback: false`, a fresh `at`, and `findings` whose entries all have `resolved: true`. Missing runtime observations cannot be filled with assumptions. The daemon must supply genuine stage observations; this module does not attest runtime routing.

## Production target and capture

`acceptProduction({releaseManifest, publishedAt, url, hostname, headersText, captureRoot, captureDescriptor, ownerDescriptor, productionDescriptor, now})` is for the later deployed release. Use the exact approved origin `https://axionbench.jadapps.app`, the publishable committed manifest with a published revision binding and exact `_headers` bytes. Supply the genuine deployment record’s `publishedAt`; capture, owner opening and interaction evidence must all postdate that publication. It checks every route, a real 404, every hosted asset's status/size/hash, the whole manifest, publication source/data identity and deployed header effects. Injectable fetch/media functions exist for negative fixtures; production callers must use the defaults.

Capture schema remains `axionbench-capture-v1` with release product/data hashes, `capturedAt`, browser identity and exact file descriptors. `pages` must list each route's `{path,title}`. Screenshots add `page`, `title`, `device` (`mobile`, `tablet`, `desktop`) and `viewport`; widths must fit those device ranges. Every page needs all three. The video adds `page: /` and `role: animated-hero`. The capture URL is the production homepage with a trailing slash. MP4 signature alone does not pass: default media inspection uses `ffprobe` and `ffmpeg`, requiring a playable multi-frame stream, at least two seconds and distinct decoded frames in the first eight seconds.

Owner schema is `axionbench-owner-browser-v1`. It retains the existing owner-browser gate's native observation receipt, opening method/time and screenshot requirements. Fields include the exact origin `url`, homepage `title`, `platform: Windows`, `opened: true`, product/data hashes, `openedAt`, `openingMethod`, `observation` (`source`, observed `url`/`title`, `receiptPath`, `receiptSha256`, `receiptBytes`), and `screenshot` descriptor. Allowed observation sources are `windows-targeted-observation` and `jadbot-browser-bridge`. Opening must postdate production publication. The hashed native receipt exceeds 50 bytes; the PNG screenshot exceeds 20,000 bytes. A process launch alone is insufficient.

`productionDescriptor` retains the separate production interaction contract: exact origin/product/data hashes, fresh `at`, at least 12 distinct named assertions with `passed: true` and actual `observed` values, plus `consoleErrors: []`. Continue running the existing `node scripts/verify-workflow.mjs browser` against genuine deployment/browser/production-test evidence as well. The new acceptance contract adds route captures and playable hero evidence without replacing that gate.

## Snapshot and schedule changes

Publication always checks the retained snapshot before upload, even with an added qualification callback. Snapshot directory, saved descriptor, supplied manifest, key, revision, product/control/data/source/overlay identity must match the retained content-addressed tree. Idempotent retries recheck integrity. Interrupted transactions use their journal's original retained identities. Credential scans now cover control files as well as served text. Failed checks make no remote writes; existing rollback and last-good behavior stays required.

The merged schedule client preserves both `observe` and `readback` commands, source-bound response bytes, a 72-hour freshness limit, disabled/no-next-run checks, exact model pins, no fast/fallback overrides, one worker and no collaboration. `--live` verifies schedule drift and duplicate registrations using GET only. It never creates, enables, edits or triggers a schedule. The stored client source hash has changed: the later registration stage must make a new `observe` receipt before citing it.

## Remaining evidence and dependencies

Actual fresh release/archive qualification, separate reviews, hosted public CI, first API deployment, native trigger/readback, last-good negative case, owner Windows opening and current hero MP4 remain assigned to later stages. The focused fixtures are synthetic and are never release evidence. The supplied dependency index and relevant step 18/12/7 artifact SHA-256 values were checked; their historic commands were not claimed as current checks.

This container has neither `ffprobe` nor `ffmpeg` on PATH. The actual capture stage needs both; media acceptance fails if they are absent. No installation or fallback media claim was made here. Owner browser access, API credentials and production domain attachment were not inspected or changed in this step. No commit or push was made.
