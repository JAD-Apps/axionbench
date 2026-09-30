# Benchmark registry

`data/benchmark-registry.json` is the canonical registry input; `src/benchmark-registry.ts` defines the TypeScript contract for benchmark identity, capability domain, metric scale/direction, original source, rights posture, and availability state. It currently covers 15 capability domains and 52 distinct suite/version identities. `scripts/test-registry.mjs` validates registry structure and adverse fixtures, verifies the SHA-256 of the captured source metadata snapshot, and rechecks only the five primary pages preserved in that snapshot.

## Availability and publication

`pending` means an identity and discovery source are recorded, but no permitted, configuration-matched observation snapshot is present. `unsupported` means the cited location does not currently establish a sufficiently exact historical result/version identity for safe comparison. `available` is reserved for a later source-backed observation adapter; this registry contains no available result rows. The snapshot is discovery metadata, not model scores. No scores are fabricated or inferred from the registry.

All suites are link-only pending per-dataset and per-result reuse review. A source code licence does not automatically grant rights to republish benchmark data. Registry links must point to the genuine result/source location; versions with no verified independent result endpoint point only to the documented official suite page and remain pending/unsupported. Only URLs in `data/source-snapshots/2026-09-30-official-pages.json` are live rechecked by this command; other links receive HTTPS/URL syntax validation and are explicitly not represented as live verified.

## Version identity notes

HLE original, dynamic HLE-Rolling and HLE-Diamond are independent suites; the official HLE page announced Diamond on 2026-09-22 and says original HLE was finalized at 2,500 questions. SWE-bench original, Verified, Lite, Multilingual, Multimodal and Pro remain separate. SWE-bench's live official page describes separate rows and defines resolved rate. Terminal-Bench 4.0 has an official live page, while its retrieved result table was empty; older 2.x is unsupported pending an exact historical result source. Berkeley Function Calling Leaderboard currently identifies BFCL V4 and checkpoint `f7cf735`; V3 remains unsupported as a result identity. Original τ-bench and τ²-bench are distinct and require separate protocol/domain metadata.

The current official Terminal-Bench page specifies resolution rate and 95% confidence intervals, but the registry does not copy any score or interval. The BFCL page reports V4 and its checkpoint/update metadata. No launch observation coverage is claimed by this registry step.

## Focused regression check

Run `npm run test:registry`. This performs no writes or benchmark evaluations. It validates unique IDs, domain breadth, proper bounds and directions, HTTPS source syntax, source and rights metadata, explicit unknown states/reasons, named version distinctions, and adversarial mutations. Live network checks are limited to the four URLs listed in the captured snapshot; a transport error is a failure requiring investigation, not a reason to skip the check.
