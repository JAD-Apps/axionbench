# Comparing exact model versions

Open `/versions` directly to choose two source-confirmed API identities. The selectors use the current model registry, including previous OpenAI and Anthropic releases. Selecting a related model never transfers a result or a tariff. The identity list retains source links, retirement status, retrieval dates and confirmed release dates.

Choose one source/benchmark panel, test condition and reasoning setting. A single admitted primary measurement supplies each selected identity's value. Multiple remaining configurations are ambiguous: narrow the filters rather than choosing the highest score. Unconfirmed identities cannot enter the selectors, and missing results remain unavailable.

The three views share the same factual rows:

- **Trend** places published native values on confirmed release dates. An unknown release date has no chronological coordinate. Source-generated, catalogue-created, evaluation and retrieval timestamps are never substituted. Isolated points remain labelled claims. Lines connect only identical source, source class, suite version, harness identity and revision, metric, native unit, test condition and reasoning setting. Missing or incompatible dated points break lines.
- **Paired** draws two native values only when that complete comparison key matches. The page explains any unavailable pair. Two unreported reasoning settings or harness revisions do not establish equality.
- **Table** retains measurements, missing reasons, source class, native units, eligibility, dates and exact result/release links. Historical claims can remain visible without becoming eligible for current scoring.

For example, the captured BFCL V4 FC claims for Claude Sonnet 4.5 and Opus 4.5 are 73.24 and 77.47 **percent**, respectively. Their reasoning settings are unreported. This snapshot therefore shows two isolated points and explains why paired comparison is unavailable. It does not turn the 4.23-point numerical difference into a qualified performance claim. Follow the [original BFCL results](https://gorilla.cs.berkeley.edu/leaderboard.html) for the published configurations.

`versionView`, `versionLab`, `version0`, `version1`, `versionPanel`, `versionSuite`, `versionCondition` and `versionSetting` preserve the view and filters through hard reload and browser history. Share copies this URL; export includes both factual rows, the comparison availability and the exact served data hash. Other routes' query state is removed.

Run `npm run test:cost-version-views` locally or in the prepared public source. The gate builds production output, compares real Chart.js coordinates with native source values, checks tables/exports and captures all six pricing/version views at mobile, tablet and desktop sizes. Explicit test fixtures exercise a positive matched pair and a connected trend; their invented reasoning setting is never written to published facts or reported as production evidence. Adversarial cases cover unknown fields, changed source/version/conditions/settings, duplicates, missing middle releases and unknown dates.
