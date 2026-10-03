# Open weights

Open `/open-weights` directly or use the main navigation. The page offers **Buckets**, **Scatter**, **Heatmap** and **Table**. Available weights and an open-source licence are separate facts; neither a public repository nor a licence field alone establishes that the whole model is open source. Parameter size is not a capability score.

The `openWeights` projection comes from `scripts/open-weights/derive.mjs`, called by the existing data build. Captured repository metadata and model cards are checked against their recorded SHA-256. The page, build and tests share `src/open-weights/logic.ts`.

## Counts and unknowns

Only a safetensors total with plain floating-point weight dtypes qualifies as a total parameter count. I64/BOOL index buffers are allowed. Packed or integer weight tensors do not establish a parameter count. Missing, zero, invalid or quantized-only totals remain **Undisclosed**, outside every numerical bucket.

Buckets use total parameters: `<10B`, `10–35B`, `35–100B`, `100–300B` and `300B+`. The lower bound is inclusive; the upper bound is exclusive. For example, a 309B total with 15B activated belongs in `300B+`, never `10–35B`.

Activated parameters per token come from this checkpoint's own model card. Conflicting statements remain ambiguous; a count at or above an established total is inconsistent. Family-card tables naming sibling sizes cannot supply another checkpoint's count. Activated counts never set the bucket. Architecture-class evidence of MoE is kept separately from a card-stated activated count; an unknown architecture is not asserted to be dense.

Weights access uses captured hub gating metadata. Licence classes reflect the recorded licence ID: OSI-approved, custom/non-OSI, not stated or not verified. Base/instruct and quantization labels retain their recorded basis. Source details show metadata/card links, retrieval dates, hashes and the captured activated-count quotation.

## Views and sharing

Buckets show at most eight representatives per bucket, one per lab, using the existing value-independent lab priority and evidence-count rule. Selecting a bucket shows that panel alone. The Undisclosed panel lists reasons and draws no numerical positions.

Scatter shows two distinguishable series on the selected table page: total parameters (cyan circles) and activated parameters (violet squares). Heatmap shows the same page with Total and Activated columns; native counts label each cell. All parameter charts use one logarithmic range computed from the complete captured parameter dataset. Heatmap intensity uses that range too. Unknown cells are hatched and labelled `—`; unknown scatter counts have no mark. An independently stated activated count may still be shown when the total is unknown.

The table keeps every filtered entry reachable, 20 per page. Keyboard value controls expose chart values and exact sources. Pointer inspection uses the same factual projection. Data changes animate for 380ms; reduced motion stops Chart.js animation, including when the preference changes while the page is open.

Own URL keys are `owView`, `owBand`, `owMoe`, `owLicence`, `owAccess`, `owVariant`, `owQuant`, `owLab`, `owQ` and `owPage`. Reload restores views, filters, buckets and page. Other-route keys are removed from the rendered page URL. Pure encoding functions leave unrelated keys alone.

JSON exports contain every filtered row, the projection digest, method, filters, chosen view, page, shared parameter range and plotted factual rows. Exported sources preserve source identity, hash and retrieval time. An export therefore distinguishes a bounded graphical page from the full filtered dataset.

Hosted API pricing and self-host cost remain separate. A weight download does not supply either price. Source-restricted routed rates remain withheld; self-host cost stays unestimated without captured hardware-cost evidence.

## Checks and limits

In the full source workspace, `npm run test:open-weights` runs the existing extraction, classification, source-hash, quoted-card, band-boundary, pagination and browser checks. It retains its head-to-head/frontier dependencies. The portable product source declares `npm run test:cohort-views` for all four views at 390, 768 and 1440px, real logarithmic geometry, table/export parity, keyboard controls, URL history/reload, unknown cells and live reduced motion. Fresh screenshots, current source hashes and the report are written under ignored `test-results/cohort-views/`.

Counts describe the captured snapshot. Unknown totals, ambiguous activated statements, unchecked licences and unstated checkpoint variants stay visible. No model's total or licence is inferred from its family name.
