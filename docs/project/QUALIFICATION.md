# Qualification contracts and production-target acceptance

Private note; `docs/project/` never enters the public tree. This step adds the checks. It does not collect evidence, register a job, build, publish, roll back, attach artifacts or launch reviewers, and every check below is read-only.

## What counts as evidence

A SHA-256 proves bytes, not who observed them. A receipt is accepted only as a signed envelope `{ payload, authority, keyId, signature }` (Ed25519 over the canonical payload JSON, `scripts/project/authority.mjs`). The verifier is given a trust file (`--trust`, kept outside the repository) listing the public keys of each authority: `daemon`, `reviewer`, `github`, `cloudflare`, `jadbot`, `windows`, `capture`. A key of the wrong authority cannot attest a stage, an unknown key is refused, and anchors marked `fixture: true` are refused by the command line tools. The tests use throwaway fixture keys and say so.

Assumption to confirm in the next stage: the collectors (daemon, GitHub and Cloudflare readers, the Windows browser capture, the JadBot attachment API) must sign what they observed with a key whose public half is in the trust file. This repository defines the contract; it does not hold those keys, so nothing here proves any stage has run.

## Stages and modes

`node scripts/project/verify-receipts.mjs --mode <mode> --bundle <file> --trust <file> --expect <file> [--now <ISO>] [--max-age-hours <n, default 24>]`

| Mode | Signer | Checks beyond the common rules |
| --- | --- | --- |
| `candidate-qualification` | daemon | both gate exits 0; public commits extend the existing public main (`b6fa8b0…`) in a linear parent chain; an embedded signed JadBot readback of the **disabled** job; AI stages honest about execution. `--public-source <dir>` also re-seals that directory and compares it to the expected public seal |
| `candidate-review` | reviewer | reviewer identity and session present, not a worker and not the qualification session; verdict `approved`; no unresolved findings; reviewed seals equal the sealed candidates |
| `publication` | cloudflare | embedded GitHub CI run on the exact public commit, `success`; the provider's canonical production deployment of `axionbench.jadapps.app`; digests equal the receipt manifests |
| `native-update` | jadbot | embedded readback of the **same** job, now enabled, citing the qualification and first-deployment receipts; a native trigger execution; remote version, hash and idempotency key; a rejected update that left last-good retained |
| `deployed-acceptance` | cloudflare | the accepted deployment is the one the native update produced, read back from the retained snapshot and canonical deployment; routes, assets, data and headers passed; a changed data digest must be bound to a daily overlay |
| `owner-browser` | windows | Windows platform, exact host, non-empty title, screenshot hashes, the same deployment |
| `hero-mp4` | capture | H.264 video facts, an attachment signed by `jadbot` for exactly that file, and (CLI) `--capture <record>` verified against the real file |
| `release-handoff` | daemon | cites the digest of every earlier receipt; submission readiness only. A receipt carrying an `evaluatorVerdict` is refused, so the automatic evaluator's later verdict is never claimed |

Common rules for every receipt: schema and mode match; run id equals the expected run; session equals the expected session when one is given; `issuedAt` is not in the future (5 minute skew) and is strictly after the previous stage; the final receipt is not older than `--max-age-hours`; the nonce is unique in the chain; `previousReceiptSha256` equals the previous payload digest; private and public source seals equal the expected, distinct seals; the public commit equals the expected commit; source, control and product manifest digests never change after qualification and the data digest changes only with a bound `dailyOverlay`; no credential-shaped text. A bundle must contain exactly the stages up to the requested mode, so missing final evidence fails.

Expected identities (`--expect`) come from the caller, never from the bundle: `runId`, `privateSourceSealSha256`, `publicSourceSealSha256`, `publicBaseCommit`, `publicCommit`, `workerSessionIds`, optional `sessions`.

**Disabled then enabled.** The qualification receipt embeds the job as observed disabled at that time. After the same job is enabled, `candidate-qualification` through `release-handoff` still verify, because the native-update receipt must show the same job and trigger id and cite the qualification receipt.

**No invented sessions.** A stage that did not execute an AI session must carry no provider observation; one that did must carry a Sol 6.1/high, Fast off observation. `jadbot-daily.mjs verify-registration --require-disabled|--require-enabled` applies the same rule to the registration (see [AUTOMATION](../AUTOMATION.md)).

`node scripts/project/qualify-public.mjs --verify-only ...` is the private entry for the first mode. `--verify-only` is mandatory; any other option is refused.

Preserved interfaces: `--state-dir` (publication ledger and receipts) and `--artifact <file>:<sha256>:<bytes>` work as before and combine with `--mode`. Unknown options, options without values, duplicates, and options that do not belong to the chosen mode (`--capture` outside `hero-mp4`, `--public-source` outside `candidate-qualification`, or any mode option without `--mode`) are refused.

## Video qualification

`scripts/release/verify-capture.mjs` requires, for a video, a regular file within bounds with a hash and size matching the record, an MP4 `ftyp` box, a recorded encoder identity from the H.264 list, probe identity `ffprobe` with its version line, dimensions and duration. It then runs `ffprobe` and `ffmpeg` (`FFPROBE_PATH`/`FFMPEG_PATH` or `PATH`): the actual codec must be `h264` at the recorded size and duration (±0.5 s), the whole file must decode with no errors, the decoded frame count must match, and at least three distinct frames must appear. If the tools are absent, or the ffmpeg has no H.264 decoder (Playwright's cached WebM-only build), verification fails; there is no fallback. This environment has no ffmpeg, so the real-tool path is covered only by labelled fixture output until a machine with ffmpeg runs it.

## Production readback

`npm run deploy:readback -- --latest --state-dir <dir>` (needs the Cloudflare variables) verifies the production target the publication ledger recorded: the retained snapshot (including its daily data overlay) must equal the provider's canonical production deployment and every hosted byte must match. It never uses the newest deployment listing or a rebuilt private `dist`. `--deployment-id <id>` keeps its earlier behaviour.

## Browser suites against production

`npm run test:routes|test:core-views|test:cost-version-views|test:cohort-views|test:acceptance -- --url https://axionbench.jadapps.app` (also `--product-sha256`, `--data-sha256` to pin the expected release). Only that exact origin is accepted. Production mode does not build and does not intercept hosted product or data responses. Before any browser assertion it fetches the hosted manifest, checks `data.json` against it and every listed file against its digest, then loads the data from the host. Local adverse fixtures (tampered data, stale price, injected failure pages) run only against the local build and are labelled in the reports; on production they are skipped and reported as skipped. Historical recommendation counts are asserted only on the local committed snapshot; production asserts invariants.

Not yet proven: these suites were not run against the deployed site in this step (nothing is deployed from this tree), and the viewport, contrast, motion and per-view coverage is whatever the existing suites already cover. Checking that on the real host is the next stage's job.

## Known gaps handed to the next stage

- No trust file, collector keys, registration, enablement, deployment, Windows capture, attachment or reviewer receipt exists. Each remains an explicit failure until produced.
- JadBot 0.1.125 was previously read as having no project-scoped scheduled workflow registration endpoint. If that still holds, registration is an integration gap, not something to simulate.
