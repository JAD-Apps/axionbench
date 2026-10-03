# US–China comparison

Open `/us-china` for **Paired**, **Grouped**, **Coverage** and **Table** views. Choose one model from each regional selector, then optionally filter by domain, evaluator or identical reasoning setting. No overall or country winner is declared.

## Where region comes from

Region is the developer organization's country as recorded by Epoch AI, or a captured organization-column attribution resolved through `data/authority/mapping.json`. It is never inferred from language, endpoint or licence. Global/multinational, other-country and unknown models remain listed outside the selectors and in the catalogue. Country/lab qualification and uncertainty remain visible.

## What can be compared

The unchanged `matched-intersection-v1` engine in `src/authority/logic.ts` requires the same source, suite version, metric and known test condition. Publisher comparison claims do not match. One configuration per model is selected by the declared setting rule, never by its score: highest listed setting by default, identical setting when required. Duplicates at the chosen setting are excluded. Missing, incompatible and non-admitted results have explicit reasons; none becomes a zero-valued benchmark result.

Paired points and grouped bars plot exactly those shared rows on a fixed normalized 0–1 scale, labelled 0–100%. Native reported values, units, configuration, evaluation dates, source hashes and exact result links remain in source details and exports. Separate domain charts average matched suites within each benchmark family before averaging families. Domain means are not raw benchmark accuracy or an overall score. China-minus-US differences are percentage points on the documented normalized source scale.

The source admission gate still checks row digests, declared units, exact model version/variant, registered suites/domains, original result URLs and known conditions. Raw percentages are normalized once; invalid bounds, duplicate panels and unknown conditions remain excluded. Nothing in these views changes those mathematical/source checks.

## Coverage is observed evidence

Coverage shows **Shared** and **Unmatched** compatible result counts for each selected model under the active filters. A shared row contributes one observed result to each model. Unmatched rows count only the observed side. For example, three shared results plus two US-only results give US `Shared 3 / Unmatched 2`, China `Shared 3 / Unmatched 0`; that zero is an observed count, never a missing benchmark score.

The counts come from `matched`, `onlyA` and `onlyB`, after the engine's admission, setting, duplicate and condition rules. Catalogue membership, pending identities and incompatible/non-admitted observations do not count. The unequal-coverage disclosure stays expanded in every view and links to each actual result. Excluded observations remain separate. When no shared result exists, comparison charts draw no score marks; coverage can still show observed unmatched counts.

## Sharing and export

Own URL keys are `h2hView`, `us`, `cn`, `h2hDomain`, `h2hSetting`, `h2hSource` and `h2hMethod`. Reload restores the entire selection; view changes support browser back/forward. Other-route keys are removed from the rendered URL.

JSON exports retain the model/country records, filters, matching method, data digest, exact matched and unmatched observations, exclusions, source records and deltas. They also identify the chosen view, plotted rows, matched domain projection and observed coverage rows. Keyboard value controls and pointer inspection share those factual rows. Charts animate data changes for 380ms and stop for reduced motion, including a live preference change.

## Checks and qualification limits

In the full source workspace, `npm run test:head-to-head` runs the preserved hand-calculated/adversarial matching and family-mean fixtures, real-source selectors, differences, source drilldown, export and browser checks. It still runs the frontier/build gate first. The portable product source declares `npm run test:cohort-views`, which checks all four views at 390, 768 and 1440px, actual Chart.js geometry against the engine, coverage/table/export parity, keyboard controls, view/filter URLs, empty intersections and reduced motion. Reports, source hashes and fresh screenshots go under ignored `test-results/cohort-views/`.

Historical authority measurements remain inspectable here. They do not become current scoring evidence merely by appearing in this comparison. Source freshness and model coverage vary; uncertainty is reported only when supplied by the source. Unpublished methodology is not reconstructed. Current scoring eligibility remains governed by the separate current policy.
