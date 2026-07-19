# Independent Segment Analysis — rnd006tst-ollama-tud-2026-07-18

This analysis was derived from the completed Watchdog / Ollama (TUD) run, stored RND006TST responses, raw Watchdog telemetry, prompt, and supplied rubric. No prior OpenRouter segment grouping, table, score, wording, rank, or conclusion was used. Existing review documents were not treated as authority.

Run scope: 18 exact routing IDs × 10 tests = 180 requested responses; 176 accepted finals, four empty finals, 199 upstream attempts, and 19 retries. Benchmark time was 2026-07-19T01:21:22.301Z through 2026-07-19T04:35:59.237Z.

## 1. Model grouping method

Groups were defined before comparison using only fields established by the preserved evidence:

- **Complete-delivery cohort:** 10/10 accepted final responses.
- **Retry-free cohort:** 10 upstream attempts and zero retries.
- **Observed lower-resource cohort:** 10/10 accepted, ≤40,000 accepted-final tokens, and accepted-final Watchdog median latency ≤40 seconds.
- **Documented-estimate lower-cost cohort:** a model-specific configured catalog estimate exists and retry-inclusive estimated cost per requested response is ≤$0.016. This is an estimate segment, not verified billing.
- **Observed lower-quality quartile-like cohort:** accepted-final quality average ≤26.4/30, which selects the lowest five observed averages. This describes this run only and is not a claim about intrinsic model capability.
- **Pricing cohorts:** ten IDs with documented configured catalog estimates versus eight IDs whose only stored rate is the generic Watchdog fallback; the latter are cost-unavailable for comparison.

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: membership is the literal threshold text above; quality is mean six-part score over accepted finals; sample: 18; excluded: four empty finals are excluded from quality but retained in reliability; aliases: none established—exact routing IDs only; pricing: ten documented configured estimates; eight unavailable generic fallbacks; limitations: no hardware, quantization, license, weights, provider billing, or verified marketing aliases.

| Group | Inclusion threshold | Members |
|---|---|---|
| Complete delivery | accepted=10/10 | `nemotron-3-nano:30b`, `gemma4:31b`, `qwen3.5:397b`, `glm-5.1`, `nemotron-3-super`, `deepseek-v4-pro`, `mistral-large-3:675b`, `kimi-k2.5`, `minimax-m2.7`, `nemotron-3-ultra`, `glm-5.2`, `deepseek-v4-flash`, `kimi-k2.7-code`, `gpt-oss:120b`, `gpt-oss:20b` |
| Retry-free | attempts=10 and retries=0 | `nemotron-3-nano:30b`, `gemma4:31b`, `qwen3.5:397b`, `nemotron-3-super`, `mistral-large-3:675b`, `kimi-k2.5`, `nemotron-3-ultra`, `glm-5.2`, `deepseek-v4-flash`, `gpt-oss:120b`, `gpt-oss:20b` |
| Observed lower resource | accepted=10, final tokens≤40,000, median≤40s | `nemotron-3-nano:30b`, `gemma4:31b`, `mistral-large-3:675b`, `glm-5.2`, `deepseek-v4-flash`, `gpt-oss:120b`, `gpt-oss:20b` |
| Documented-estimate lower cost | documented rate and retry estimate/request≤$0.016 | `minimax-m3`, `glm-5.1`, `glm-5.2`, `deepseek-v4-flash` |
| Observed lower-quality | quality average≤26.4 | `minimax-m3`, `nemotron-3-super`, `minimax-m2.7`, `kimi-k2.7-code`, `gpt-oss:120b` |

## 2. Non-frontier / open-weight-like / local-capable comparison

No such comparison is supportable from the supplied evidence. The route names `Ollama (TUD)` and `ollama-tud-work` establish routing labels, not license, source availability, weight availability, deployment location, or self-hosting capability. Colon suffixes such as `:20b` or `:675b` are preserved as parts of routing IDs but are not independently verified parameter counts. Therefore no model is labeled frontier, non-frontier, open source, open weight, local, or self-hosted here. The measurable lower-resource cohort in Section 3 is used instead.

## 3. Lower-cost or lower-capability comparison

### 3.1 Observed lower-resource cohort

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: accepted=10 AND final tokens≤40,000 AND accepted-final Watchdog median≤40s; sample: 7; excluded: all failures and models outside thresholds; quality still uses accepted finals only; aliases: none established—exact routing IDs only; pricing: cost shown only as documented estimate status; fallback dollar values excluded; limitations: threshold describes observed resource use, not architecture or inherent capability.

| Model | Accepted | Quality /30 | Final tokens | Retry tokens | Median | p95 | Cost status |
|---|---:|---:|---:|---:|---:|---:|---|
| `gemma4:31b` | 10/10 | 26.8 | 17,813 | 17,813 | 13.6 s | 29.2 s | cost unavailable; generic fallback excluded |
| `mistral-large-3:675b` | 10/10 | 28.3 | 24,866 | 24,866 | 35.3 s | 43.6 s | cost unavailable; generic fallback excluded |
| `deepseek-v4-flash` | 10/10 | 27.5 | 35,272 | 35,272 | 14.3 s | 36.3 s | documented configured estimate |
| `nemotron-3-nano:30b` | 10/10 | 26.8 | 35,355 | 35,355 | 29.5 s | 73.4 s | cost unavailable; generic fallback excluded |
| `gpt-oss:20b` | 10/10 | 26.8 | 35,800 | 35,800 | 22.4 s | 67.2 s | cost unavailable; generic fallback excluded |
| `glm-5.2` | 10/10 | 27.3 | 37,488 | 37,488 | 29.1 s | 88.2 s | documented configured estimate |
| `gpt-oss:120b` | 10/10 | 26 | 38,022 | 38,022 | 39.1 s | 61.1 s | cost unavailable; generic fallback excluded |

Within this cohort, `gemma4:31b` had the fewest accepted-final tokens and lowest median; `mistral-large-3:675b` had the highest quality average and second-lowest token total. `deepseek-v4-flash` was the only member combining a documented model-specific estimate, median below 15 seconds, no retries, and quality ≥27.5.

### 3.2 Documented-estimate lower-cost cohort

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: retry-inclusive configured estimate / 10 requested responses≤$0.016; sample: 4; excluded: eight fallback-priced IDs; documented-rate IDs above threshold; aliases: none established—exact routing IDs only; pricing: model-specific configured estimates only; not provider bills; limitations: rate snapshot may not match final billing, cache rules, or future provider prices.

| Model | Success | Quality /30 | Retry tokens | Estimate/request | Retries | Cost source |
|---|---:|---:|---:|---:|---:|---|
| `deepseek-v4-flash` | 100.0% | 27.5 | 35,272 | $0.009944 | 0 | `deepseek-pricing:2026-07-18` |
| `minimax-m3` | 90.0% | 24.33 | 124,594 | $0.014307 | 4 | `minimax-pricing:2026-07-18:standard-le-512k` |
| `glm-5.2` | 100.0% | 27.3 | 37,488 | $0.01553 | 0 | `z-ai-pricing:2026-07-18` |
| `glm-5.1` | 100.0% | 28.4 | 55,343 | $0.015918 | 1 | `z-ai-pricing:2026-07-18` |

`minimax-m3` meets the estimate threshold but not complete delivery; its one empty final and four retries must remain visible. Among complete-delivery members, `deepseek-v4-flash` had the lowest documented retry-inclusive estimate per request.

### 3.3 Observed lower-quality cohort (not “lower capability”)

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: accepted-final quality average≤26.4/30; sample: 5; excluded: models above threshold; empty finals excluded from quality but shown in reliability columns; aliases: none established—exact routing IDs only; pricing: cost status only; no cost claim defines this cohort; limitations: one ten-test run cannot establish intrinsic capability.

| Model | Accepted | Quality /30 | Final tokens | Retry tokens | Median | p95 | Cost status |
|---|---:|---:|---:|---:|---:|---:|---|
| `minimax-m3` | 9/10 | 24.33 | 61,890 | 124,594 | 60.1 s | 92.1 s | documented configured estimate |
| `kimi-k2.7-code` | 10/10 | 25.6 | 64,606 | 77,493 | 54.9 s | 179.5 s | documented configured estimate |
| `gpt-oss:120b` | 10/10 | 26 | 38,022 | 38,022 | 39.1 s | 61.1 s | cost unavailable; generic fallback excluded |
| `minimax-m2.7` | 10/10 | 26.2 | 65,562 | 90,090 | 109.3 s | 173.2 s | documented configured estimate |
| `nemotron-3-super` | 10/10 | 26.4 | 41,666 | 41,666 | 36.6 s | 83.8 s | cost unavailable; generic fallback excluded |

## 4. Token-efficiency analysis

Default formula: **accepted-final token efficiency = mean 30-point quality score ÷ mean accepted-final total tokens in thousands**. Higher values mean more rubric points per 1,000 tokens among returned finals. It is not a price metric and can favor concise answers; reliability is not folded into the formula.

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: quality_average / ((final_tokens / accepted_count) / 1000); sample: 18; excluded: four empty finals and all retry attempts; n is accepted finals per model; aliases: none established—exact routing IDs only; pricing: pricing does not enter formula; status shown separately; limitations: rubric judgments and response length jointly affect result; input and output tokens are combined.

| Efficiency order | Model | n | Quality /30 | Final tokens | Mean tokens/final | Points per 1k tokens | Pricing status |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | `gemma4:31b` | 10 | 26.8 | 17,813 | 1781 | 15.05 | cost unavailable; generic fallback excluded |
| 2 | `mistral-large-3:675b` | 10 | 28.3 | 24,866 | 2487 | 11.38 | cost unavailable; generic fallback excluded |
| 3 | `deepseek-v4-flash` | 10 | 27.5 | 35,272 | 3527 | 7.8 | documented configured estimate |
| 4 | `nemotron-3-nano:30b` | 10 | 26.8 | 35,355 | 3536 | 7.58 | cost unavailable; generic fallback excluded |
| 5 | `gpt-oss:20b` | 10 | 26.8 | 35,800 | 3580 | 7.49 | cost unavailable; generic fallback excluded |
| 6 | `glm-5.2` | 10 | 27.3 | 37,488 | 3749 | 7.28 | documented configured estimate |
| 7 | `nemotron-3-ultra` | 10 | 27 | 38,634 | 3863 | 6.99 | cost unavailable; generic fallback excluded |
| 8 | `gpt-oss:120b` | 10 | 26 | 38,022 | 3802 | 6.84 | cost unavailable; generic fallback excluded |
| 9 | `glm-5.1` | 10 | 28.4 | 43,066 | 4307 | 6.59 | documented configured estimate |
| 10 | `nemotron-3-super` | 10 | 26.4 | 41,666 | 4167 | 6.34 | cost unavailable; generic fallback excluded |
| 11 | `minimax-m2.5` | 8 | 28.5 | 36,307 | 4538 | 6.28 | documented configured estimate |
| 12 | `deepseek-v4-pro` | 10 | 27.2 | 46,849 | 4685 | 5.81 | documented configured estimate |
| 13 | `qwen3.5:397b` | 10 | 26.7 | 46,328 | 4633 | 5.76 | cost unavailable; generic fallback excluded |
| 14 | `kimi-k2.5` | 10 | 27.1 | 58,194 | 5819 | 4.66 | documented configured estimate |
| 15 | `minimax-m2.7` | 10 | 26.2 | 65,562 | 6556 | 4 | documented configured estimate |
| 16 | `kimi-k2.7-code` | 10 | 25.6 | 64,606 | 6461 | 3.96 | documented configured estimate |
| 17 | `kimi-k2.6` | 9 | 26.89 | 65,848 | 7316 | 3.68 | documented configured estimate |
| 18 | `minimax-m3` | 9 | 24.33 | 61,890 | 6877 | 3.54 | documented configured estimate |

`gemma4:31b` and `mistral-large-3:675b` lead this formula because both combined complete delivery with comparatively short accepted answers. This does not establish lower compute cost; both lack a model-specific documented rate in the preserved snapshot.

### Retry overhead (separate from default efficiency)

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: retry delta=retry-inclusive tokens−accepted-final tokens; multiplier=retry-inclusive/final; sample: 7; excluded: 11 zero-retry models; failed-final attempts are included in retry totals; aliases: none established—exact routing IDs only; pricing: documented estimates shown only where model-specific; fallback values excluded; limitations: telemetry records upstream success but does not preserve a provider error category for empty-answer retries.

| Model | Attempts | Retries | Recovered panes | Empty finals | Final tokens | Retry-inclusive | Delta | Multiplier |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `minimax-m2.5` | 16 | 6 | 1 | 2 | 36,307 | 134,823 | 98,516 | 3.71× |
| `minimax-m3` | 14 | 4 | 2 | 1 | 61,890 | 124,594 | 62,704 | 2.01× |
| `kimi-k2.6` | 14 | 4 | 2 | 1 | 65,848 | 129,017 | 63,169 | 1.96× |
| `minimax-m2.7` | 12 | 2 | 1 | 0 | 65,562 | 90,090 | 24,528 | 1.37× |
| `glm-5.1` | 11 | 1 | 1 | 0 | 43,066 | 55,343 | 12,277 | 1.29× |
| `deepseek-v4-pro` | 11 | 1 | 1 | 0 | 46,849 | 59,078 | 12,229 | 1.26× |
| `kimi-k2.7-code` | 11 | 1 | 1 | 0 | 64,606 | 77,493 | 12,887 | 1.2× |

## 5. Speed analysis

Latency is the accepted-final Watchdog upstream `latency_ms` matched to each pane. Median is the ordinary sample median; p95 is nearest-rank `ceil(0.95×n)`. These are per-response model-route latencies, not the sequential run wall clock. The full benchmark wall clock was 3.24 hours because tests and panes ran at concurrency 1.

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: median accepted-final latency; p95=sorted[ceil(.95*n)]; n=accepted finals; sample: 18; excluded: four empty finals and retry attempts; retry latency appears in reliability/overhead evidence; aliases: none established—exact routing IDs only; pricing: cost does not enter speed order; status included; limitations: n is only 8–10, so p95 is effectively the maximum for n≤10 and is unstable.

| Median order | Model | n | Median | p95 | Quality /30 | Success | Pricing status |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | `gemma4:31b` | 10 | 13.62 s | 29.23 s | 26.8 | 100.0% | cost unavailable; generic fallback excluded |
| 2 | `deepseek-v4-flash` | 10 | 14.33 s | 36.35 s | 27.5 | 100.0% | documented configured estimate |
| 3 | `gpt-oss:20b` | 10 | 22.41 s | 67.18 s | 26.8 | 100.0% | cost unavailable; generic fallback excluded |
| 4 | `kimi-k2.5` | 10 | 28.34 s | 88.9 s | 27.1 | 100.0% | documented configured estimate |
| 5 | `glm-5.2` | 10 | 29.08 s | 88.17 s | 27.3 | 100.0% | documented configured estimate |
| 6 | `nemotron-3-nano:30b` | 10 | 29.47 s | 73.43 s | 26.8 | 100.0% | cost unavailable; generic fallback excluded |
| 7 | `deepseek-v4-pro` | 10 | 33.48 s | 72.59 s | 27.2 | 100.0% | documented configured estimate |
| 8 | `mistral-large-3:675b` | 10 | 35.28 s | 43.64 s | 28.3 | 100.0% | cost unavailable; generic fallback excluded |
| 9 | `qwen3.5:397b` | 10 | 35.57 s | 64.09 s | 26.7 | 100.0% | cost unavailable; generic fallback excluded |
| 10 | `glm-5.1` | 10 | 35.67 s | 94.8 s | 28.4 | 100.0% | documented configured estimate |
| 11 | `nemotron-3-super` | 10 | 36.62 s | 83.81 s | 26.4 | 100.0% | cost unavailable; generic fallback excluded |
| 12 | `gpt-oss:120b` | 10 | 39.06 s | 61.13 s | 26 | 100.0% | cost unavailable; generic fallback excluded |
| 13 | `minimax-m2.5` | 8 | 42.43 s | 236.26 s | 28.5 | 80.0% | documented configured estimate |
| 14 | `nemotron-3-ultra` | 10 | 47.15 s | 75.23 s | 27 | 100.0% | cost unavailable; generic fallback excluded |
| 15 | `kimi-k2.7-code` | 10 | 54.92 s | 179.51 s | 25.6 | 100.0% | documented configured estimate |
| 16 | `kimi-k2.6` | 9 | 56.35 s | 123.23 s | 26.89 | 90.0% | documented configured estimate |
| 17 | `minimax-m3` | 9 | 60.1 s | 92.09 s | 24.33 | 90.0% | documented configured estimate |
| 18 | `minimax-m2.7` | 10 | 109.32 s | 173.16 s | 26.2 | 100.0% | documented configured estimate |

The fastest medians were `gemma4:31b` (13.62s) and `deepseek-v4-flash` (14.33s). `minimax-m2.7` had the slowest median (109.32s). Small n makes p95 directional, not a stable service-level estimate.

## 6. Reliability and retry-overhead analysis

Confirmed availability failures: **zero**—all 18 IDs passed preflight and no benchmark Watchdog row records an HTTP/provider availability error. Confirmed transient provider failures: **zero**—all 199 telemetry rows record status `success` with empty `error_code`. Recovered retry episodes: **nine accepted panes consuming 11 retry attempts**; the attempt-level provider failure category is unavailable. Final empty responses: **four** after three attempts each. These categories are intentionally separate.

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: success=accepted/10; attempts and retries from run; recovered panes=accepted panes with attempts>1; sample: 18; excluded: no responses excluded from reliability; quality column still excludes four empty finals; aliases: none established—exact routing IDs only; pricing: pricing status included but does not affect reliability; limitations: upstream success cannot distinguish empty-body generation from other runner retry triggers.

| Model | Success | Attempts | Retries | Recovered retry panes | Empty finals | Confirmed transient provider failures | Confirmed availability failures | Retry multiplier |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `minimax-m3` | 90.0% | 14 | 4 | 2 | 1 | 0 | 0 | 2.01× |
| `nemotron-3-nano:30b` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `minimax-m2.5` | 80.0% | 16 | 6 | 1 | 2 | 0 | 0 | 3.71× |
| `gemma4:31b` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `qwen3.5:397b` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `glm-5.1` | 100.0% | 11 | 1 | 1 | 0 | 0 | 0 | 1.29× |
| `nemotron-3-super` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `deepseek-v4-pro` | 100.0% | 11 | 1 | 1 | 0 | 0 | 0 | 1.26× |
| `mistral-large-3:675b` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `kimi-k2.5` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `minimax-m2.7` | 100.0% | 12 | 2 | 1 | 0 | 0 | 0 | 1.37× |
| `nemotron-3-ultra` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `glm-5.2` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `kimi-k2.6` | 90.0% | 14 | 4 | 2 | 1 | 0 | 0 | 1.96× |
| `deepseek-v4-flash` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `kimi-k2.7-code` | 100.0% | 11 | 1 | 1 | 0 | 0 | 0 | 1.2× |
| `gpt-oss:120b` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |
| `gpt-oss:20b` | 100.0% | 10 | 0 | 0 | 0 | 0 | 0 | 1× |

The largest overhead was `minimax-m2.5`: 80% accepted, six retries, two empty finals, and a 3.71× retry-token multiplier. `minimax-m3` and `kimi-k2.6` each delivered 90%, used four retries, and ended with one empty final. Eleven routes completed with no retries.

## 7. Routing matrix

Each lane is a thresholded shortlist, not a claim of autonomous fitness. Metrics remain separate; no composite safety score is used.

Table metadata — Sources: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`, `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`, `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`; formula: literal per-column inclusion thresholds; candidates must satisfy every stated threshold; sample: 18 models evaluated across 7 lanes; excluded: models failing any lane threshold; empty finals affect reliability rather than prose quality; aliases: none established—exact routing IDs only; pricing: cost is a threshold only in the documented-estimate lane; limitations: single-run evidence; security, credentials, tenant actions, and publication always require human control.

| Lane | Quality threshold | Reliability threshold | Token threshold | Latency threshold | Cost threshold | Included routing IDs | Required human control |
|---|---|---|---|---|---|---|---|
| Balanced general lane | overall accepted-final quality ≥27.5/30 | 10/10 accepted; retry token multiplier ≤1.30; no truncated final | ≤50,000 final tokens | accepted-final p95 ≤95 s | not required | `glm-5.1`, `mistral-large-3:675b`, `deepseek-v4-flash` | Human review for consequential changes |
| Low-token bounded lane | overall quality ≥26.5/30 | 10/10 accepted; zero retries | ≤40,000 final tokens | median ≤30 s | reported separately | `nemotron-3-nano:30b`, `gemma4:31b`, `glm-5.2`, `deepseek-v4-flash`, `gpt-oss:20b` | Review outputs before merge; no autonomous credential/tenant actions |
| Planning/synthesis lane | mean of Tests 5,6,9 ≥29/30 | 10/10 accepted; no truncation on Tests 5,6,9 | no inclusion threshold | accepted-final p95 ≤100 s | reported separately | `qwen3.5:397b`, `glm-5.1`, `glm-5.2`, `gpt-oss:20b` | Human owns scope, decisions, and acceptance criteria |
| Implementation lane | mean of Tests 2,3,10 ≥28/30 | 10/10 accepted; no truncation on Tests 2,3,10 | no inclusion threshold | accepted-final p95 ≤100 s | reported separately | `qwen3.5:397b`, `glm-5.1`, `deepseek-v4-pro`, `mistral-large-3:675b`, `kimi-k2.5` | Tests and human code review required before merge |
| Security/tenant-sensitive review lane | mean of Tests 1,4,10 ≥27.5/30 | 10/10 accepted; no truncation on Tests 1,4,10 | no inclusion threshold | accepted-final p95 ≤100 s | reported separately | `mistral-large-3:675b`, `kimi-k2.5`, `nemotron-3-ultra`, `deepseek-v4-flash` | Advisory only; mandatory security and tenant-authorization review; never autonomous |
| Externally published copy lane | Test 8 ≥25/30 and zero unsupported-claim flags | 10/10 accepted | no inclusion threshold | accepted-final p95 ≤100 s | reported separately | `glm-5.1` | Mandatory fact sheet, legal/brand review, and human publication approval |
| Documented-estimate cost-constrained lane | overall quality ≥27/30 | 10/10 accepted | no inclusion threshold | accepted-final p95 ≤100 s | retry-inclusive documented estimate/request ≤$0.016 | `glm-5.1`, `glm-5.2`, `deepseek-v4-flash` | Costs are estimates, not bills; human review follows task risk |

### Routing conclusions derived from this evidence

- The balanced lane admits `glm-5.1`, `mistral-large-3:675b`, and `deepseek-v4-flash`; their token, latency, retry, and pricing differences remain visible rather than collapsed into one winner score.
- The low-token bounded lane admits `nemotron-3-nano:30b`, `gemma4:31b`, `glm-5.2`, `deepseek-v4-flash`, `gpt-oss:20b`. This is a resource-observation segment, not proof of a smaller model or local deployment.
- The externally published copy lane admits only `glm-5.1` under the stated threshold, and still requires a fact sheet plus human brand/legal approval.
- Security and tenant-sensitive candidates are advisory reviewers only. No result in this benchmark authorizes autonomous credential rotation, tenant authorization, backup restoration, security sign-off, code merge, or external publication.

## Evidence and limitations summary

Primary evidence paths: `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`; `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-preflight.json`; `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`; `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`; `/Users/robertdevore/Downloads/Benchmark Tests (1-10 basics).md`; `/Users/robertdevore/Downloads/Benchmark Tests (1-10) - SIMPLE SCORING SHEET.md`. The independent response-score ledger at `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-independent-scores.json` was recomputed from those response/rubric sources and is not an existing review document.

No separate downloaded raw-response export was identified beyond the authenticated stored-chat export. No trace rows, hardware, quantization, license, weight availability, deployment topology, provider invoice, or stable alias mapping were available. Ten cost rows are documented configured estimates and eight are unavailable for comparison because only a generic fallback rate was stored. All conclusions are scoped to this run.
