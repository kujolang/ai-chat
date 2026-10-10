# Hermes free models: Kujo script benchmark · 2026-10-10

This is a single-draft, no-tools code-generation sample, not a model ranking or an agentic coding evaluation. Each model received the same Kujo guide and ten task contracts. Returned scripts were executed against frozen independent checks. Provider failures are not evidence of coding inability.

Run: `hermes-kujo-scripts-20261010`. Runtime SHA-256: `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
Transport: 25/80 completed; 55 failed. Duration: 2377 seconds. Settings: concurrency 1, one attempt, 6000 response tokens, 240-second deadline per response.

| Model in Hermes profile | Delivered / attempted | Full tasks passed | Checks passed on delivered responses |
|---|---:|---:|---:|
| `upstage/solar-pro4:free` | Not dispatched: absent from live catalog | — | — |
| `meituan/longcat-2.5-preview:free` | 2/10 | 1/10 | 48/62 |
| `inclusionai/ling-3.0-flash-sante:free` | 0/10 | 0/10 | — |
| `inclusionai/ling-3.0-flash-fin:free` | 0/10 | 0/10 | — |
| `stealth/space-bunny-alpha` | Not dispatched: absent from live catalog | — | — |
| `poolside/laguna-xs-2.1:free` | 6/10 | 0/10 | 36/187 |
| `poolside/laguna-s-2.1:free` | 8/10 | 0/10 | 0/249 |
| `stepfun/step-3.7-flash:free` | 1/10 | 0/10 | 0/31 |
| `meituan/longcat-2.0:free` | 0/10 | 0/10 | — |
| `stealth/missingno` | 8/10 | 6/10 | 222/249 |

A full task pass requires every positive, boundary, invalid-input and CLI-contract check. Partial check counts use only delivered responses; missing responses do not receive invented coding scores. A broken script can pass rejection cases by rejecting everything, so full task passes are the primary measure. The task-pass column uses the requested ten-task workload and must be read alongside delivery.

| Task | `meituan/longcat-2.5-preview:free` | `inclusionai/ling-3.0-flash-sante:free` | `inclusionai/ling-3.0-flash-fin:free` | `poolside/laguna-xs-2.1:free` | `poolside/laguna-s-2.1:free` | `stepfun/step-3.7-flash:free` | `meituan/longcat-2.0:free` | `stealth/missingno` |
|---|---|---|---|---|---|---|---|---|
| Integer statistics | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | 0/31 | 0/31 | 0/31 | Provider returned HTTP 404 | 20/31 |
| Stable deduplication | PASS | Provider returned HTTP 404 | Provider returned HTTP 404 | 17/31 | 0/31 | Provider returned HTTP 429 | Provider returned HTTP 404 | Provider returned an empty response. |
| Sorted frequency table | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | Output limit reached before completion. | 0/31 | Provider returned HTTP 429 | Provider returned HTTP 404 | PASS |
| Prefix sums | 17/31 | Provider returned HTTP 404 | Provider returned HTTP 404 | 17/31 | 0/31 | Output limit reached before completion. | Provider returned HTTP 404 | PASS |
| Signed array rotation | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | Output limit reached before completion. | 0/31 | Provider returned HTTP 429 | Provider returned HTTP 404 | PASS |
| Run length encoding | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | 2/31 | 0/31 | Provider returned HTTP 429 | Provider returned HTTP 404 | PASS |
| Merge closed intervals | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | Output limit reached before completion. | Output limit reached before completion. | Provider returned HTTP 429 | Provider returned HTTP 404 | PASS |
| Vector dot product | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | 0/31 | Output limit reached before completion. | Output limit reached before completion. | Provider returned HTTP 404 | 15/31 |
| Balanced parentheses | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | 0/32 | 0/32 | Provider returned HTTP 429 | Provider returned HTTP 404 | PASS |
| Bounded sequential ledger | Output limit reached before completion. | Provider returned HTTP 404 | Provider returned HTTP 404 | Output limit reached before completion. | 0/31 | Provider returned HTTP 429 | Provider returned HTTP 404 | Output limit reached before completion. |

## Reproduction and evidence

- Suite and rules: [tasks](../../benchmarks/kujo-scripts.md), [protocol](../../benchmarks/kujo-scripts-protocol.md).
- Benchmark implementation: commit `d660cee`; full repository verification: 765 passed, 2 skipped, 0 failed.
- Calibration: all 311 checks passed on ten known-good controls; all ten constant-null controls were rejected.
- Runtime: qualified Kujo 1.7.0, pinned binary; the older app bridge binary was not used for grading.
- Raw local evidence (ignored): `data/hermes-kujo-scripts-20261010/` contains selection, immutable acceptance hashes, command arguments, run.json, grade.json, source files and chat snapshots.
- Ten comparison chats are saved in AI Chat with title prefix `Hermes Kujo 20261010`.
- No retry, repair, model substitution or post-generation acceptance change was performed.
- Prices were checked before dispatch: eight exact configured IDs were advertised with zero prompt/completion price. Catalog presence did not guarantee a working endpoint.
- The fixed token budget and free-service rate limits constrain this sample. Do not infer general model capability from unavailable, rate-limited, empty or truncated responses.

## Saved chat IDs

- 1. Integer statistics: `5354fec1-f407-4a02-8686-6bfe1c76eb24`
- 2. Stable deduplication: `c6e46353-8739-408a-a06e-02ab2fe6534b`
- 3. Sorted frequency table: `a1c6c1a1-b2e6-43ff-ab66-b9817116fb43`
- 4. Prefix sums: `92540388-32c9-4c34-86db-6978a4054a3e`
- 5. Signed array rotation: `d6b45dbd-c810-4229-a9eb-d4952bb40c2e`
- 6. Run length encoding: `feaae646-e505-40ee-88a1-298d52da1ced`
- 7. Merge closed intervals: `2486bc83-7a48-4f85-a9a6-f7a0cca02bd5`
- 8. Vector dot product: `52951dac-6c26-4b58-a1a9-cd271e466493`
- 9. Balanced parentheses: `6f558744-3387-4884-a378-8fab4a86de9b`
- 10. Bounded sequential ledger: `e8992ada-292e-4b40-9a23-9be1c2353ac9`
