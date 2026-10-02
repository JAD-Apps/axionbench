# Catalogue, benchmark library and methodology

The current cohort is separate from the full 508-model catalogue. [Current policy](CURRENT-POLICY.md) documents 12 verified defaults, selectable recent versions back to OpenAI 5.5 and Anthropic 4.5/4.6, and the 30 explicitly retained identity requests. Names do not inherit another version’s result or tariff. For example, GPT-6 Luna is distinct from GPT-5.6 Luna; Muse Spark 1.1, 1.2 and 1.3 remain separate from an unverified unspecified “Meta Muse”.

The current capture confirms 29 requested identities; unknown release dates, parameters, prices and statistical confidence stay null with reasons. Primary confirmation is not evidence of a benchmark score. BridgeBench retains 27 visible result identities, including eight with no first-party confirmation in this capture, rather than dropping them from its rating views.

Verify with `npm run test:catalogue`. It runs `npm run test:open-weights` first (which chains head-to-head, frontier and the production build).

## Where things live

| Piece | File |
|---|---|
| Pure logic: entry building, filters, search, sorting, pagination, URL state, CSV/JSON export | `src/catalogue/logic.ts` |
| Page components: `Catalogue`, `ModelDetail`, `BenchmarkLibrary`, `Methodology` | `src/catalogue.tsx` |
| Mount points: chapters `#models` (catalogue) and `#methods` (library and methodology) | `src/observatory-experience.tsx` |
| Scoring definition published verbatim as `scoring` in `public/data.json` | `data/scoring.json` via `scripts/build-observatory-data.mjs` |
| Gate | `scripts/test-catalogue.mjs` |

## What is listed

The catalogue has 814 entries: the 508 provider-catalogue and model-card identities plus the 306 models from the original benchmark sources (Epoch AI, DeepSWE, BFCL, LongBench v2, publisher tables). **Identities are not merged across the two families.** No cross-source identity mapping exists, and guessing one would invent facts. The "Source family" filter separates them.

Every entry has a stable ID: the ingestion model ID, or `authority:<model key>`. Entries with no admitted result stay listed and read **Unscored**. Unknown parameters, dates, modalities and regions show as unknown and are never zero-filled.

| Filter (URL key) | Values |
|---|---|
| Lab (`catLab`) | every lab ID in the catalogue |
| Openness (`catOpen`) | public-weights, gated, repository-unchecked, unknown (derived from the recorded weights availability; unknown text is never read as public) |
| Region (`catRegion`) | us, cn, global, other, unknown. Authority models use their Epoch organization record. Provider-catalogue models take a region only when every Epoch-attributed model of that lab ID agrees. |
| Total parameters (`catBand`) | the open-weight bands from `src/open-weights/logic.ts`, plus undisclosed. Activated MoE parameters never set the group. |
| Input modality (`catMod`) | text, image, audio, video, file |
| Source family (`catSource`) | catalogue, authority |
| Evidence (`catEvidence`) | admitted, none |
| Search (`catQ`) | name, lab, stable ID, source ID; trimmed and case-insensitive |
| Sort / direction (`catSort`, `catDir`) | name, lab, release, parameters, evidence, domains, freshness. Unknown values sort last in both directions. Ties break on the stable ID. |
| Page (`catPage`, 1-based) and open model (`catModel`) | 25 rows per page. Invalid values are ignored. |

Only non-default values are written to the URL. **Reset filters** removes just the `cat*` keys, so other chapters' keys are kept.

## Scores

No catalogue entry has a score. Method `axion-domain-v1` scores a cohort only over a compatible common panel with fixed weights, family caps and no per-model renormalization. A catalogue-wide score would need that renormalization, which the method forbids. Each entry's coverage (admitted, reported-not-admitted and excluded counts, suites, capability domains, freshness) is shown instead. The 118 Hugging Face–captured observations are "reported, not admitted" for the reason recorded in `data/scoring.json`.

## Exports

Both exports contain **every** row matching the current filters, in the displayed order, not just the visible page. The CSV has a fixed header (`CSV_COLUMNS`). Cells that begin with `=`, `+`, `@`, tab or carriage return get a leading `'` so a spreadsheet cannot run them. The JSON carries the filters, the data digest, the capture time, the same row records and a licence notice. The notice lists each original source with its recorded licence. It also states that provider-catalogue redistribution terms are not established, so only identifiers and facts already on the page are exported, with no prices and no endpoint payloads.

## Benchmark library and result links

The library lists every registered suite and every authority suite (86 in this snapshot), each with an anchor `#benchmark-<suiteId>`, a capability domain filter (`benDomain`), state, admitted/reported counts, model counts and a collapsible list of result sources. A benchmark name links to the first genuine result source. A suite without any captured result links to the benchmark's own page and says so. In a model's detail, each benchmark name links to **that observation's own original result URL**, with a separate link to the library entry.

## Methodology disclosure

The methodology block is rendered from the published `scoring` object and `authority` block: fixed weights, family cap, cohort rule, eligibility, separate panels, confidence handling (no computed intervals; source-reported run-to-run ranges are labelled as the source's), source exclusions, per-source retrieval dates and licences, and the code references `src/scoring/index.mjs` and `data/scoring.json`.

## History

There is one archived capture date, so **no historical chart is drawn**. `snapshotHistory` allows a chart only when the same sources were archived on at least two dates.

## Gate

`test:catalogue` checks hand-written fixtures and then the real data and the built page:

- **Logic fixtures:** sort order with nulls and ties, each filter and their combination, search, pagination clamping, the URL round trip (including invalid and other-chapter keys), CSV escaping, openness and region derivation, and the history rule.
- **Real-data checks:** the entry count equals models plus authority models, IDs are unique, no row has a score, counts add up to the observations, the library covers every suite with an https link, and each authority result link is in the library.
- **Browser checks:**
  - default, sorted, filtered and searched views equal the logic output; pagination reaches all 814 entries;
  - URL state survives a reload, and reset clears it;
  - CSV and JSON ids and names equal the filtered rows, and the visible page is their prefix;
  - model deep links and result links, library anchors and hash scroll;
  - displayed weights equal `data/scoring.json`;
  - no subscription or quota content, no history chart, no overflow at 360 and 768 px, and no console errors.

Evidence and screenshots go to the ignored `test-results/` directory.

## Known limits

- The two source families are listed separately, so a model can appear twice.
- Regions for provider-catalogue models are known for only a few labs.
- Benchmark and model counts describe this captured snapshot, not every model or test in existence.
