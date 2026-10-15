# Step 19 handoff: qualification and native schedule contracts

Private note; `docs/project/` never enters the public tree.

Two pure validators, with no network access and no side effects. They do not register a job, publish or review anything.

- `scripts/project/native-schedule.mjs`: the daily JadBot job definition. It is registered disabled, runs at 05:17 UTC (`17 5 * * *`) and calls `npm run publish:daily` with persistent absolute state and audit directories. Every AI stage is `codex/gpt-6.1-sol/high` with Fast off and no fallback. Secrets appear by name only. The target is the `axionbench` Pages project, branch `main`, host `axionbench.jadapps.app`. `validateEnablement` allows enabling only with a passed qualification and a first deployment that was published and read back over HTTPS.
- `scripts/project/qualification.mjs`: a private or public candidate qualifies only if it is a clean full commit descending from its recorded baseline (private `c3a915b7…`, public `b6fa8b03…`), no force push, and every gate in `scripts/public/verify.mjs` exited 0. The gate list is read from that runner, not copied. A public candidate also needs no private files and no credential-shaped text. It needs an approved review of the same commit, by a different session, on `codex/gpt-6.1-sol/high`. `acceptProduction` requires the exact approved host, matching product and data digests, every route answering, unknown paths returning 404 and a retained last-good snapshot.

Tests: `tests/project/native-schedule.test.mjs` and `tests/project/qualification.test.mjs`. Each loosened field has its own negative case.

Gap: the scheduler API observed in step 1 lists, runs and enables jobs but has no registration route. Peter (step 20) still has to find a supported way to register this definition; the contract only says what must be registered.
