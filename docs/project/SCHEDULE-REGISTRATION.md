# Native JadBot schedule registration

The daily update is the JadBot workflow schedule `wfs_361f98ad3bac` (project `prj_0e8ffc13d328`, name `axionbench-daily-update`). It runs `30 6 * * *` in `UTC` with `overlap=skip`. Its template pins planner, worker, reviewer and `modelPin` to `codex/gpt-6.1-sol/high`, with `workerLimit=1`, `collaborate=false` and one step that runs `npm run publish:daily`.

It is **disabled**. Enable it only after the first deployment is verified and the owner agrees. This repository never enables, runs or edits the schedule.

## Commands

- `node scripts/automation/jadbot-daily.mjs observe` — one authenticated GET to `/v1/workflow-schedules/wfs_361f98ad3bac` on the local daemon (token from `~/.jadbot/token`, never stored). Saves the exact response body, its SHA-256, the time and the client source hash to `evidence/local/schedule/readback.json` (git-ignored).
- `node scripts/automation/jadbot-daily.mjs verify-registration --require-disabled` — checks the saved readback offline, including a 72-hour freshness bound. Add `--live` to compare against a fresh GET and reject duplicate project schedules.

## What is rejected

A wrong id, project, cron, timezone or overlap policy; an enabled schedule when `--require-disabled` is given; any model choice other than `codex/gpt-6.1-sol/high`; collaboration on; `workerLimit` other than 1; more or fewer than one step; any other step command; fallback or fast keys; a body that does not match its recorded hash (forged); a readback older than the schedule's own check time (stale); a readback made by a different client source; a non-GET or non-200 record. With `--live`, a schedule changed since the observation.

## Observed

Observed on the daemon reporting version 0.1.128 (the brief named 0.1.126). `createdAt`, `updatedAt` and `checkedAt` were equal, `history` empty, `lastRunId` null, `nextRunAt` null (disabled).

Any edit to `scripts/automation/jadbot-daily.mjs` changes its hash, so re-run `observe` afterwards. This does not prove a scheduled run, an enabled schedule or a deployment; those belong to later steps.
