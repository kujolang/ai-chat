# Real-family daily-task evaluation — September 6, 2026

Actual GLM 5.3 Flash through the configured direct Ollama HTTPS route and Grok 4.20 non-reasoning through the local xAI OAuth proxy completed a 12-attempt matrix in 79.503 seconds. Each family ran local CSV revenue analysis, static shipment-reference extraction, and rendered evidence with a screenshot and browser close, in eager and deferred modes. This is one sample per cell, not a statistical model ranking.

| Family | Schemas | Correct tasks | Completed requests | Dispatched rounds | Reported input tokens | Reported output tokens | Median task ms | Loaded-tool precision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GLM 5.3 Flash | eager | 3/3 | 3/3 | 11 | 31409 | 1242 | 4768 | Not observed |
| Grok 4.20 non-reasoning | eager | 2/3 | 3/3 | 11 | 32571 | 259 | 4716 | Not observed |
| GLM 5.3 Flash | deferred | 2/3 | 2/3 | 9 | 22554 | 1360 | 5461 | 1 |
| Grok 4.20 non-reasoning | deferred | 1/3 | 1/3 | 20 | 57730 | 391 | 7793 | Not observed |

Both providers reported usage for every dispatched round, including failed continuations (12/12 attempts have complete usage coverage). Neither reported monetary cost; billed dollars are unknown. The table includes failed-task consumption and added discovery rounds. It does not treat token counts as dollars or a model response as a correct result without fixture/receipt checks.

GLM passed all eager tasks and the deferred local/static tasks. Its deferred browser task failed with `tool_execution_unavailable`. Grok passed eager static/browser and deferred static evidence. Its eager CSV answer omitted the expected numeric value despite reading the file. Its deferred local/browser tasks reached the tool-round limit without using discovery. GLM loaded the needed local file-list schema once; no other discovery calls were observed. A precision of 1 therefore reflects one selection, and does not establish reliable discovery recall.

The observed deferred payload tradeoff did not establish a general task-cost saving: GLM failed one deferred task, while Grok used more rounds and reported input tokens with fewer correct tasks. Keep discovery opt-in; evaluate each selected family against actual tasks before treating schema reduction as a net benefit. These results are bounded to the tested configuration, not a claim about all models in either family.

Evidence: `data/reliability-eval-20260906-d/manifest.json`, `requests.jsonl`, `summary.json`, and `metrics.jsonl` (ignored local runtime artifacts). The manifest records parent commit d168497 and the then-uncommitted harness/evidence changes. Runtime storage and browser artifacts were isolated; no production chats were imported. Earlier runs A–C preserve unavailable-route evidence separately. This short evaluation is not all-day soak evidence.

- Requests SHA-256: `6eed71dec8dc3964276ea1218d023ea43f3ecadb151eac2c3f58207f2e0de87e`.
- Summary SHA-256: `7a1eefc463ab38a0a6624920223d9580b42d79a1c8f8fda1370f03a64b7064f3`.

Verification: the updated harness and usage/error regressions passed the full local suite, 368 checks with one Linux-only skip (`/tmp/ai-chat-live-evidence-full.log`).
