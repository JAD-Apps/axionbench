# Current models and benchmark versions

The October 2, 2026 capture contains 30 requested identities, 29 confirmed by exact first-party page text. The unspecified name “Meta Muse” remains unverified: Meta publishes several Muse Spark versions, so the brand does not identify one model. Unverified names have no current score or transferred price.

The 12 defaults are GPT-6 Astra, GPT-6.1 Sol, GPT-6 Luna, Claude Opus 5.5, Claude Sonnet 5.5, Claude Haiku 4.5, Gemini 3.8 Flash, Muse Spark 1.3, Grok 4.7, DeepSeek V4.1 Flash, Kimi K3 and Qwen3.8 Max. `data/current-source-specs.json` keeps their exact API identities and source URLs. Recent versions, including OpenAI 5.5/5.6/6 Sol and Anthropic 4.5/4.6, remain separate choices. The full catalogue is separate from this cohort.

“Current” means eligible for the default model list. “Version” means a confirmed selectable recent identity. “Retired” means archived from current defaults; its reason distinguishes publisher deprecation from a product archive decision. “Unverified” means the exact identity was not established. No historical identity or result is deleted.

For example, Anthropic confirms `claude-haiku-4-5-20251001` and the API alias `claude-haiku-4-5`. They are not two models. `claude-opus-4-5-20251101` and `claude-opus-4-6` are different identities. Sonnet 4.5 is deprecated but remains functional until its announced retirement. DeepSeek’s V4 Pro API now routes to V4.1 Flash; a V4 Pro benchmark run must not be renamed or priced as a new V4.1 run.

A current benchmark default needs a confirmed exact version, a maintained source within 180 days, a pinned tested harness, supported units and comparable conditions. Primary sources must have been verified within seven days. Saturated versions cannot enter current scoring. A high isolated score does not establish saturation. Versions of one family still share the existing family cap.

The BFCL V4 primary page names evaluation commit `f7cf735`, package `bfcl-eval==2025.12.17`, and April 12, 2026 as its last update. Four configuration rows across Haiku 4.5 and Opus 4.5 meet the current rules. Two rows belong to the default cohort. No full common panel exists for the 12 defaults, so their capability composite is unavailable. Current qualified reasoning, coding, agents, knowledge-work, science and multimodal coverage is zero under these stricter rules. This does not assert that the models cannot perform those tasks.

The qualified historical authority dataset still has 1,433 observations, 23 capability suites and eight capability domains. Publisher claims and independent measurements stay separate. DeepSWE v1.1 reports harness names and effort, but no tested code revision; its results stay visible without current scoring eligibility. Terminal-Bench 2.x is archived separately from the currently presented 4.0. GPQA Diamond and LongBench v2 are archived from current defaults because captured repository maintenance falls outside the policy window, not because their publishers announced retirement.

BridgeBench is a separate selectable dataset: 27 models, overall plus nine axes, 270 published ratings. Nineteen result identities also have first-party confirmation in this capture. All 27 remain visible; the other eight show an identity reason. The [leaderboard](https://www.bridgebench.ai/leaderboard) and [publisher guide](https://www.bridgebench.ai/blog/how-the-leaderboard-works) describe comparative ratings and an unpublished protocol. These are native BridgeBench rating units, not accuracy percentages, Arena Elo, independent capability measurements or design-gallery qualification. Overall incorporates cost and speed, so these ratings do not enter the capability index.

[GPT-6.1 Sol’s published result](https://www.bridgebench.ai/leaderboard/gpt-6-1-sol) reports an overall rating of 646; [GPT-6 Luna’s result](https://www.bridgebench.ai/leaderboard/gpt-6-luna) reports 513. The difference is not a success-rate difference or calibrated probability. Axis views select published values from the same captured snapshot. Every row keeps its exact result URL, configuration unknowns, original response hash, factual projection hash, original retrieval date and later verification date. Unknown evaluation dates and confidence remain null with reasons.

`public/data.json` exposes `currentModels`, `currentCoverage`, `bridgeBench` and each authority row’s `currentPolicy`. Current comparisons use `currentAuthorityPanel` / `currentWeightSensitivity` from `src/current/logic.ts`; historical math stays in the lower-level scoring module. `bridgeRatingRows` supplies native values and missing reasons. `src/bridgebench.tsx` is the reusable axis/table selector; `bridgeAxis` shares its selection in the URL. Subsequent route/chart work must reuse these distinctions.

Run portable mutation checks with `npm run test:current-policy`. Capture primary facts with:

```sh
python3 scripts/authority/current-capture.py --audit-dir /private/source-audit
```

Raw bytes stay in that audit directory and are excluded from public source. The adapter parses bounded responses without executing source scripts and replaces factual output only after complete validation. It refuses inconsistent leaderboard/result pages or changed licensed tariffs. Normal public validation and promotion require fresh evidence. Refresh can read a stale last-good snapshot solely to prepare its replacement; that replacement must pass the strict freshness gate.

`retrievedAt` preserves first retrieval of unchanged bytes, `lastRetrievedAt` records the actual latest network response, and `verifiedAt` records byte/projection verification. Offline byte replay cannot extend source freshness: the seven-day check uses `lastRetrievedAt`.

Remaining limits: BFCL’s recorded maintenance date ages out in October without a new qualified update or archive decision. The fresh Epoch export differs from the retained September capture; earlier measurements are not labelled as byte-identical October verification. A date refresh cannot qualify a missing tested harness. Separate route/Chart.js acceptance, independent review and remote publication remain later stages.
