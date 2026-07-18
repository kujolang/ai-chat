# OpenRouter (TUD) Benchmark Review — 2026-07-18

## Run record

- Pane profile: `OpenRouter (TUD)` (20 models, 10 tests)
- Started: 2026-07-18T04:38:25Z
- Finished: 2026-07-18T06:56:01Z
- Elapsed: 2h 17m 36s
- Responses: 101 completed, 99 failed
- Runtime artifact: `data/benchmark-runs/openrouter-tud-benchmarks-2026-07-18.json` (intentionally untracked)

This is an advisory, sample-weighted review. Quality scores use the six-part
rubric in the supplied scoring sheet and apply only to returned answers. They
must not be read as a provider-availability score.

Two run conditions reduced coverage:

1. Tests 2 and 3 had a batch streaming/transport failure, so they do not
   meaningfully distinguish the models.
2. Seven models consistently returned HTTP 404 for this work key. Their model
   quality is therefore unscored rather than treated as poor quality.

## Recommended shortlist

| Model | Successful samples | Quality / 30 | Best role | Recommendation |
| --- | ---: | ---: | --- | --- |
| `openai/gpt-5.4` | 8/10 | 27 | Orchestrator, planner, implementer | Primary high-stakes model; review marketing claims. |
| `openai/gpt-5.3-codex` | 9/10 | 27 | Implementer, reviewer | Best default for code and bounded engineering tasks. |
| `google/gemini-2.5-pro` | 9/10 | 26 | Planner, implementer | Strong technical depth; verify product claims. |
| `anthropic/claude-sonnet-5` | 8/10 | 26 | Planner, product thinker | Strong structured writing and planning. |
| `anthropic/claude-opus-4.8` | 7/10 | 26 | Reviewer, planner | High-quality strategic work when available. |
| `google/gemini-3.5-flash` | 8/10 | 25 | Task runner, implementer | Good faster second lane; still needs claim review. |
| `x-ai/grok-4.5` | 8/10 | 25 | Planner, orchestrator | Strong synthesis, but keep human technical review. |
| `moonshotai/kimi-k2.7-code` | 7/10 | 24 | Implementer | Worth retaining for code comparison. |
| `mistralai/devstral-2512` | 8/10 | 24 | Implementer, task runner | Compact and useful; less deep than the top tier. |

## Scorecard

Scores are Correctness / Instruction Following / Completeness / Clarity /
Practical Usefulness / Reasoning & Judgment. Totals are out of 30.

| Model | C | IF | Co | Cl | PU | R&J | Total | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `openai/gpt-5.4` | 5 | 4 | 5 | 4 | 4 | 5 | **27** | Excellent connector redesign and investigation framing; very verbose. |
| `openai/gpt-5.3-codex` | 5 | 5 | 4 | 4 | 5 | 4 | **27** | Most dependable returned code-oriented sample set. |
| `google/gemini-2.5-pro` | 4 | 4 | 5 | 4 | 4 | 5 | **26** | Thorough and technically capable; occasionally turns intentions into unsupported facts. |
| `anthropic/claude-sonnet-5` | 4 | 5 | 4 | 5 | 4 | 4 | **26** | Clear, structured, and audience-aware; still overstates Kujo capabilities. |
| `anthropic/claude-opus-4.8` | 4 | 5 | 4 | 5 | 4 | 4 | **26** | Strong judgment in planning and review samples; insufficient successful code coverage. |
| `google/gemini-3.5-flash` | 4 | 4 | 4 | 4 | 4 | 5 | **25** | Good technical structure and implementation coverage; avoid unsourced verification claims. |
| `x-ai/grok-4.5` | 4 | 4 | 4 | 4 | 4 | 5 | **25** | Strong cross-functional synthesis; less disciplined about evidence. |
| `moonshotai/kimi-k2.7-code` | 4 | 4 | 4 | 4 | 4 | 4 | **24** | Useful code-oriented alternate; coverage was incomplete. |
| `mistralai/devstral-2512` | 4 | 4 | 4 | 4 | 4 | 4 | **24** | Practical and concise; less comprehensive on system tradeoffs. |
| `deepseek/deepseek-v4-pro` | 4 | 4 | 4 | 4 | 3 | 4 | **23** | Sound returned planning/review work; limited coverage. |
| `minimax/minimax-m3` | 4 | 4 | 4 | 4 | 3 | 4 | **23** | Good planning prose, but one returned empty final answer. |
| `z-ai/glm-5.2` | 4 | 4 | 3 | 4 | 3 | 4 | **22** | Useful structured baseline; one empty final answer and less depth. |
| `nvidia/nemotron-3-ultra-550b-a55b` | 3 | 4 | 4 | 3 | 3 | 3 | **20** | Detailed but invents product facts, customer stories, commands, and guarantees. |

## Unscored: unavailable for this key

These names returned predominantly or exclusively HTTP 404. Do not use the
results to judge the underlying models; remove or correct their OpenRouter IDs
before another run.

- `qwen/qwen3.7-max`
- `moonshotai/kimi-k3`
- `arcee-ai/trinity-large-thinking`
- `qwen/qwen3-coder-next`
- `relace/relace-apply-3`
- `morph/morph-v3-large`
- `nex-agi/nex-n2-pro`

## Cross-model findings

### What held up

- The leading OpenAI, Gemini, and Anthropic responses generally found the
  important action-runner issues: tenant-scoped idempotency, concurrency
  protection, server-side approval, three-attempt retry caps, safe response
  DTOs, and tenant authorization.
- The stronger planners separated evidence, assumptions, risks, and phased
  decisions well in the diagnosis and product-planning tests.
- The marketing responses were usually structurally complete and respected the
  forbidden phrases.

### Important weakness: unsupported product claims

The marketing test exposed a common failure mode. Several models asserted
formal proofs, cryptographic evidence, mathematical certainty, existing
customers, specific CLI commands, or production outcomes that were not in the
prompt. This was most severe in the Nemotron response, but it also appeared in
both Gemini responses and several others. Use an explicit rule for marketing:
"Do not claim a feature, verification method, customer, metric, or integration
unless it appears in the supplied evidence."

### Routing recommendation

- **Default implementation:** `openai/gpt-5.3-codex`
- **Complex architecture / orchestration:** `openai/gpt-5.4`
- **Second strong technical opinion:** `google/gemini-2.5-pro`
- **Planning and product framing:** `anthropic/claude-sonnet-5`; use
  `anthropic/claude-opus-4.8` when its availability is acceptable.
- **Fast comparison lane:** `google/gemini-3.5-flash` or
  `mistralai/devstral-2512`
- **Always require human review:** security-sensitive code, connector actions,
  tenant boundaries, retries, credentials, and externally published product
  claims.

## Next benchmark run

1. Replace the seven unavailable model IDs after obtaining the provider's
   accessible-model list.
2. Run at a conservative concurrency (four or fewer) to avoid the transient
   terminated/fetch-failed batch observed here.
3. Separate quality from availability in the final scorecard and rerun Tests 2
   and 3 for the affected models.
