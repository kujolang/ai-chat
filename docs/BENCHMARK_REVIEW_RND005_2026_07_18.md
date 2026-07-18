# OpenRouter (TUD) Benchmark Review — RND005

## Run record

- Pane profile: `OpenRouter (TUD)` (20 models, 10 tests)
- First request: 2026-07-18T10:38:51Z
- Final retry completed: 2026-07-18T14:28:05Z
- Wall-clock span: 3h 49m 14s (includes a recovered SQLite persistence lock and targeted retries)
- Responses: 198 successful / 200 requested (99.0%)
- Reported usage: 70,424 input tokens; 799,728 output tokens; 870,152 total tokens
- Runtime artifact: `data/benchmark-runs/rnd005tst-openrouter-tud-2026-07-18.json` (intentionally untracked)

This is an advisory quality review using the supplied six-part 30-point rubric.
It is based on the returned corpus, with close comparison of the code, security,
diagnosis, product, marketing, and connector-action responses. It is not an
independent execution/security audit, and token counts are provider-reported.

The final retry artifact intentionally reuses prior successful responses, so it
does not retain a valid per-response latency distribution. Do not infer model
speed from this run; it supports reliability and token-volume comparisons only.

## Executive scorecard

| Model | Success | Quality / 30 | Best role | Recommendation |
| --- | ---: | ---: | --- | --- |
| `openai/gpt-5.3-codex` | 10/10 | **27** | Implementer, reviewer | Default engineering lane; disciplined and comparatively compact. |
| `openai/gpt-5.4` | 10/10 | **27** | Orchestrator, planner | Best for complex synthesis; constrain output length. |
| `openai/gpt-5.5` | 10/10 | **27** | Reviewer, implementer | Strong high-stakes technical second opinion. |
| `openai/gpt-5.6-terra` | 10/10 | **27** | Orchestrator, reviewer | Strong judgement and broad coverage; expensive/verbose. |
| `google/gemini-2.5-pro` | 10/10 | **26** | Planner, implementer | Thorough technical depth; check unsupported product claims. |
| `anthropic/claude-sonnet-5` | 10/10 | **26** | Planner, product thinker | Excellent structure and audience adaptation. |
| `anthropic/claude-opus-4.8` | 10/10 | **26** | Reviewer, planner | Strong strategic review and tradeoffs. |
| `x-ai/grok-4.5` | 10/10 | **25** | Planner, orchestrator | Good cross-functional synthesis; needs evidence discipline. |
| `google/gemini-3.5-flash` | 10/10 | **25** | Task runner, implementer | Capable fast comparison lane; marketing claims need review. |
| `openai/gpt-5.4-mini` | 10/10 | **25** | Task runner, bounded implementer | Good lower-complexity OpenAI lane. |
| `moonshotai/kimi-k2.7-code` | 9/10 | **24** | Implementer | Worth retaining as a code alternate; exclude its Test 10 non-response. |
| `minimax/minimax-m3` | 10/10 | **24** | Planner, product thinker | Thorough and capable, but materially verbose. |
| `deepseek/deepseek-v4-pro` | 10/10 | **24** | Reviewer, planner | Sound technical baseline; less consistently polished. |
| `~anthropic/claude-haiku-latest` | 10/10 | **24** | Task runner, communication | Clear and reliable for bounded work. |
| `mistralai/devstral-2512` | 10/10 | **24** | Implementer, task runner | Compact useful code-oriented alternate. |
| `z-ai/glm-5.2` | 10/10 | **23** | Structured task runner | Useful baseline; less depth on system tradeoffs. |
| `moonshotai/kimi-k2.6` | 9/10 | **23** | Planner, communication | Strong returned answers, but Test 10 reliability needs follow-up. |
| `mistralai/mistral-medium-3-5` | 10/10 | **23** | Communication, task runner | Clear and economical, but less rigorous on hard edges. |
| `google/gemini-3.1-flash-lite` | 10/10 | **22** | Lightweight task runner | Use for constrained drafts, not final technical ownership. |
| `nvidia/nemotron-3-ultra-550b-a55b` | 10/10 | **20** | Brainstorming only | Detailed prose, but repeated unsupported specifics make it unsafe for factual work. |

Scores are Correctness / Instruction Following / Completeness / Clarity /
Practical Usefulness / Reasoning & Judgment.

## Rubric scorecard

| Model | C | IF | Co | Cl | PU | R&J | Total | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `openai/gpt-5.3-codex` | 5 | 5 | 4 | 4 | 5 | 4 | **27** | Most dependable code-oriented corpus. |
| `openai/gpt-5.4` | 5 | 4 | 5 | 4 | 4 | 5 | **27** | Excellent systems reasoning; verbose. |
| `openai/gpt-5.5` | 5 | 5 | 4 | 4 | 4 | 5 | **27** | Strong security/action-runner judgement. |
| `openai/gpt-5.6-terra` | 5 | 4 | 5 | 4 | 4 | 5 | **27** | Broad and careful; high token use. |
| `google/gemini-2.5-pro` | 4 | 4 | 5 | 4 | 4 | 5 | **26** | Thorough technical planning and redesigns. |
| `anthropic/claude-sonnet-5` | 4 | 5 | 4 | 5 | 4 | 4 | **26** | Clear, structured, and product-aware. |
| `anthropic/claude-opus-4.8` | 4 | 5 | 4 | 5 | 4 | 4 | **26** | Strong review framing and tradeoffs. |
| `x-ai/grok-4.5` | 4 | 4 | 4 | 4 | 4 | 5 | **25** | Strong synthesis; less evidence-disciplined. |
| `google/gemini-3.5-flash` | 4 | 4 | 4 | 4 | 4 | 5 | **25** | Technically capable; overclaims in marketing. |
| `openai/gpt-5.4-mini` | 4 | 5 | 4 | 4 | 4 | 4 | **25** | Good concise bounded-work response set. |
| `moonshotai/kimi-k2.7-code` | 4 | 4 | 4 | 4 | 4 | 4 | **24** | Good code alternate; 9 valid samples. |
| `minimax/minimax-m3` | 4 | 4 | 4 | 4 | 4 | 4 | **24** | Solid work, frequently overlong. |
| `deepseek/deepseek-v4-pro` | 4 | 4 | 4 | 4 | 4 | 4 | **24** | Sound technical baseline. |
| `~anthropic/claude-haiku-latest` | 4 | 4 | 4 | 5 | 3 | 4 | **24** | Clear and complete enough for bounded tasks. |
| `mistralai/devstral-2512` | 4 | 4 | 4 | 4 | 4 | 4 | **24** | Practical, concise engineering alternate. |
| `z-ai/glm-5.2` | 4 | 4 | 3 | 4 | 4 | 4 | **23** | Useful structured baseline, less deep. |
| `moonshotai/kimi-k2.6` | 4 | 4 | 4 | 4 | 3 | 4 | **23** | Returned work is useful; reliability caveat. |
| `mistralai/mistral-medium-3-5` | 4 | 4 | 3 | 4 | 4 | 4 | **23** | Clear but less rigorous on edge cases. |
| `google/gemini-3.1-flash-lite` | 3 | 4 | 3 | 4 | 4 | 4 | **22** | Best kept to lower-risk drafts. |
| `nvidia/nemotron-3-ultra-550b-a55b` | 3 | 4 | 4 | 3 | 3 | 3 | **20** | Polished detail does not equal trustworthy detail. |

## Reliability and efficiency

| Model group | Reliability | Output-token signal | Interpretation |
| --- | --- | --- | --- |
| OpenAI (`gpt-5.3-codex`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-terra`) | 50/50 | 183,598 | Best overall quality/reliability cluster; use model choice to control verbosity. |
| Anthropic (Sonnet, Opus, Haiku) | 30/30 | 134,794 | Strong planning/review/communication coverage. |
| Google (Gemini Pro, Flash, Flash Lite) | 30/30 | 116,202 | Useful three-tier lane; Pro for depth, Flash for comparison, Lite for bounded drafts. |
| Moonshot (two Kimi variants) | 18/20 | 106,614 | Strong returned work, but both variants failed the same long action-runner test. |
| Mistral (Devstral, Medium) | 20/20 | 38,934 | Useful compact alternate lane. |

Output volume is not a quality score. The strongest high-volume outputs were
often thorough, but MiniMax, Sonnet, Gemini Pro, and the Kimi variants should
receive an explicit length cap when concise deliverables are desired.

## What held up

- The leading OpenAI, Anthropic, and Gemini Pro answers consistently identified
  the important connector-action defects: tenant-scoped idempotency, a
  concurrency guard, server-controlled approval, three-attempt limits,
  exponential backoff, safe response DTOs, and tenant authorization.
- The best models distinguished a review of the existing implementation from a
  replacement proposal, then included focused tests rather than only prose.
- The product-planning and diagnosis prompts separated the top orchestration
  tier from lightweight task runners: GPT-5.4/5.5/5.6, Gemini 2.5 Pro, and the
  Claude models made the clearest assumptions, phases, and decision points.

## Important weakness: unsupported product claims

The marketing prompt still exposes the same cross-model failure mode as the
earlier run. Models often convert desirable positioning into asserted product
facts. The clearest examples were Gemini 3.5 Flash claiming a statically typed
language and automated verification/"absolute control", and Nemotron inventing
a runtime version, platform support, and specific product capabilities.

Use an explicit marketing constraint in future prompts:

> Do not claim a feature, verification method, customer, metric, release,
> platform, integration, or guarantee unless it appears in supplied evidence.

## The two non-responses

`moonshotai/kimi-k2.7-code` and `moonshotai/kimi-k2.6` both returned empty
output for Test 10 after three retries. The runner was hardened to preserve
streamed tokens and rerun empty outputs; a subsequent 6,000-token retry still
produced no final text. Treat this as a provider/output reliability result for
that prompt, not as a quality score of the two models.

## Routing recommendation

- **Default engineering:** `openai/gpt-5.3-codex`
- **Complex architecture and orchestration:** `openai/gpt-5.4` or
  `openai/gpt-5.6-terra`
- **High-stakes review / second opinion:** `openai/gpt-5.5`,
  `google/gemini-2.5-pro`, or `anthropic/claude-opus-4.8`
- **Planning and product framing:** `anthropic/claude-sonnet-5`
- **Fast / bounded work:** `openai/gpt-5.4-mini`,
  `~anthropic/claude-haiku-latest`, or `mistralai/devstral-2512`
- **Retain as comparison lanes:** `x-ai/grok-4.5`, `deepseek/deepseek-v4-pro`,
  `minimax/minimax-m3`, and the Kimi variants (with the Test-10 caveat)
- **Avoid as factual owner:** `nvidia/nemotron-3-ultra-550b-a55b`

Always require human review for security-sensitive code, tenant boundaries,
connector actions, credentials, retry systems, and externally published claims.
