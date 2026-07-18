# RND005 OpenRouter (TUD) Cost Overview

## Executive summary

The RND005 benchmark requested 200 model/test responses across 20 models and
10 tests. It produced 198 final accepted responses. This document separates two
valid but different cost views:

| View | What it includes | Attempts / responses | Input tokens | Output tokens | Estimated cost |
| --- | --- | ---: | ---: | ---: | ---: |
| **Retry-inclusive upstream spend** | Every upstream attempt, including retries, partial outputs, and requests whose final answer was empty | 232 attempts | 93,511 | 1,120,424 | **$8.197423** |
| **Accepted-response cost** | Only the 198 final responses used in the benchmark review | 198 responses | 70,424 | 799,728 | **$7.205218** |
| **Retry / partial-attempt overhead** | The difference between the two views | 34 additional attempts | 23,087 | 320,696 | **$0.992205** |

The retry-inclusive total is the closest estimate of what the benchmark caused
upstream. The accepted-response total is the useful per-model comparison for
the answers the team actually reviewed.

## Pricing method and limits

- Token counts come from the RND005 benchmark artifact and Watchdog telemetry.
- Prices apply the OpenRouter public model catalog snapshot retrieved after the
  run: [OpenRouter model catalog](https://openrouter.ai/api/v1/models).
- Each cost is `input tokens × input rate + output tokens × output rate`.
- This is a planning estimate, not an invoice. It can differ from historical
  price changes, routing, discounts, credits, caching, or final provider billing.
- The two empty final outputs were `moonshotai/kimi-k2.7-code` and
  `moonshotai/kimi-k2.6` on Test 10. Their upstream attempts remain included in
  the retry-inclusive spend, but not in accepted-response cost.

## Full upstream spend: all attempts and retries

This view explains the approximately **$8.20** spent during the benchmark.

| Model | Attempts | Input tokens | Output tokens | Estimated cost |
| --- | ---: | ---: | ---: | ---: |
| `openai/gpt-5.5` | 10 | 3,148 | 54,778 | $1.659080 |
| `anthropic/claude-opus-4.8` | 10 | 4,952 | 35,379 | $0.909235 |
| `openai/gpt-5.6-terra` | 10 | 3,148 | 46,463 | $0.704815 |
| `anthropic/claude-sonnet-5` | 11 | 5,322 | 63,007 | $0.640714 |
| `moonshotai/kimi-k2.6` | 18 | 10,273 | 152,765 | $0.620819 |
| `google/gemini-2.5-pro` | 14 | 4,561 | 58,787 | $0.593571 |
| `moonshotai/kimi-k2.7-code` | 20 | 11,438 | 157,849 | $0.559357 |
| `google/gemini-3.5-flash` | 10 | 3,492 | 52,593 | $0.478575 |
| `openai/gpt-5.4` | 10 | 3,148 | 28,992 | $0.442750 |
| `openai/gpt-5.3-codex` | 10 | 3,148 | 29,267 | $0.415247 |
| `minimax/minimax-m3` | 19 | 8,881 | 172,120 | $0.209208 |
| `~anthropic/claude-haiku-latest` | 10 | 3,730 | 39,855 | $0.203005 |
| `x-ai/grok-4.5` | 10 | 5,281 | 31,398 | $0.198950 |
| `mistralai/mistral-medium-3-5` | 10 | 3,350 | 22,828 | $0.176235 |
| `nvidia/nemotron-3-ultra-550b-a55b` | 10 | 3,360 | 41,878 | $0.152777 |
| `openai/gpt-5.4-mini` | 10 | 3,148 | 24,098 | $0.110802 |
| `deepseek/deepseek-v4-pro` | 10 | 3,187 | 44,120 | $0.039771 |
| `mistralai/devstral-2512` | 10 | 3,230 | 16,106 | $0.033504 |
| `z-ai/glm-5.2` | 10 | 3,217 | 38,070 | $0.033026 |
| `google/gemini-3.1-flash-lite` | 10 | 3,497 | 10,071 | $0.015981 |
| **Total** | **232** | **93,511** | **1,120,424** | **$8.197423** |

## Final accepted responses: reviewable benchmark outputs only

This view is the fairer per-model comparison for the response set used in the
RND005 analysis. The Kimi models have nine accepted responses each because
their Test-10 final answers were empty.

| Model | Accepted responses | Input tokens | Output tokens | Estimated cost |
| --- | ---: | ---: | ---: | ---: |
| `openai/gpt-5.5` | 10/10 | 3,148 | 54,778 | $1.659080 |
| `anthropic/claude-opus-4.8` | 10/10 | 4,952 | 35,379 | $0.909235 |
| `openai/gpt-5.6-terra` | 10/10 | 3,148 | 46,463 | $0.704815 |
| `anthropic/claude-sonnet-5` | 10/10 | 4,952 | 59,560 | $0.605504 |
| `google/gemini-2.5-pro` | 10/10 | 3,492 | 53,538 | $0.539745 |
| `google/gemini-3.5-flash` | 10/10 | 3,492 | 52,593 | $0.478575 |
| `openai/gpt-5.4` | 10/10 | 3,148 | 28,992 | $0.442750 |
| `openai/gpt-5.3-codex` | 10/10 | 3,148 | 29,267 | $0.415247 |
| `moonshotai/kimi-k2.6` | 9/10 | 2,290 | 62,765 | $0.253236 |
| `~anthropic/claude-haiku-latest` | 10/10 | 3,730 | 39,855 | $0.203005 |
| `x-ai/grok-4.5` | 10/10 | 5,281 | 31,398 | $0.198950 |
| `mistralai/mistral-medium-3-5` | 10/10 | 3,350 | 22,828 | $0.176235 |
| `moonshotai/kimi-k2.7-code` | 9/10 | 2,290 | 43,849 | $0.154728 |
| `nvidia/nemotron-3-ultra-550b-a55b` | 10/10 | 3,360 | 41,878 | $0.152777 |
| `openai/gpt-5.4-mini` | 10/10 | 3,148 | 24,098 | $0.110802 |
| `minimax/minimax-m3` | 10/10 | 4,364 | 64,120 | $0.078253 |
| `deepseek/deepseek-v4-pro` | 10/10 | 3,187 | 44,120 | $0.039771 |
| `mistralai/devstral-2512` | 10/10 | 3,230 | 16,106 | $0.033504 |
| `z-ai/glm-5.2` | 10/10 | 3,217 | 38,070 | $0.033026 |
| `google/gemini-3.1-flash-lite` | 10/10 | 3,497 | 10,071 | $0.015981 |
| **Total** | **198/200** | **70,424** | **799,728** | **$7.205218** |

## What caused the overhead

Most models required exactly 10 attempts. The additional cost came from a
small set of retried responses:

| Model | Additional attempts beyond 10 | Retry-inclusive cost | Accepted-response cost | Additional estimated cost |
| --- | ---: | ---: | ---: | ---: |
| `moonshotai/kimi-k2.7-code` | 10 | $0.559357 | $0.154728 | $0.404629 |
| `moonshotai/kimi-k2.6` | 8 | $0.620819 | $0.253236 | $0.367583 |
| `minimax/minimax-m3` | 9 | $0.209208 | $0.078253 | $0.130955 |
| `google/gemini-2.5-pro` | 4 | $0.593571 | $0.539745 | $0.053826 |
| `anthropic/claude-sonnet-5` | 1 | $0.640714 | $0.605504 | $0.035210 |
| **Total retry / partial overhead** | **32** | — | — | **$0.992205** |

## Team takeaway

For a shareable headline: **the full benchmark cost about $8.20 upstream; the
198 final answers that were actually reviewed represent about $7.21 of that
amount.** The remaining approximately **$0.99** was retry and partial-attempt
overhead.
