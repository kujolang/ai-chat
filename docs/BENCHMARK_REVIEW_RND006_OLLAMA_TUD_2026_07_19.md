# Watchdog / Ollama (TUD) Benchmark Review — RND006

## Run record

- Pane profile: `Ollama (TUD)` (18 models, 10 tests)
- Started: 2026-07-19T01:21:22Z
- Finished: 2026-07-19T04:35:59Z
- Elapsed: 3h 14m 37s
- Requested responses: 180
- Accepted final responses: 176
- Empty final responses: 4
- Upstream attempts: 199
- Retry count: 19
- Accepted-final usage: 60,128 input; 733,438 output; 793,566 total tokens
- Retry-inclusive usage: 70,438 input; 1,009,438 output; 1,079,876 derived total tokens

This is the practical companion to the independent evidence review. It uses
that review's response-level rubric ledger, the runtime artifact, stored chats,
and Watchdog telemetry to make explicit routing decisions. Quality scores are
out of 30 and apply only to returned final answers. Reliability remains a
separate requirement.

## Recommended shortlist

| Need | First choice | Why | Main caveat |
| --- | --- | --- | --- |
| Overall default | `glm-5.1` | Highest fully reliable overall score (28.4), strong planning, no unsupported-copy flag, and one modest retry. | Not the fastest or lowest-token route. |
| Implementation | `mistral-large-3:675b` | Best implementation average (29.3 across Tests 2, 3, and 10), 10/10 delivery, no retries, and unusually low final token use. | Model-specific price was not preserved; do not call it the cheapest. |
| Fast high-quality work | `deepseek-v4-flash` | 27.5 quality, 10/10 delivery, no retries, 14.3s median latency, and the lowest documented estimated cost among reliable high-quality routes. | Keep output/fact review for external copy. |
| Planning and synthesis | `glm-5.1` | Tied highest planning average (29.7 across Tests 5, 6, and 9), plus strong marketing discipline. | Moderate latency and output volume. |
| Security / tenant-sensitive review | `nemotron-3-ultra` | Highest security-group average (28.7 across Tests 1, 4, and 10), complete delivery, no retries. | Advisory only; model-specific cost was unavailable and human security review remains mandatory. |
| External product copy | `glm-5.1` | Only route meeting the review's copy threshold: Test 8 score 29 with no unsupported-claim flag. | Still requires source-backed human brand/legal approval. |
| Lowest-token bounded work | `gemma4:31b` | Best token-efficiency score (15.05 quality points per 1k accepted-final tokens), fastest median (13.6s), and 10/10 delivery. | Its quality ceiling is lower than the top general/implementation routes; price was unavailable. |
| Cost-conscious documented lane | `deepseek-v4-flash` | $0.099442 for 10 accepted finals, no retries, and 27.5 quality. | This ranking covers only models with preserved model-specific prices. |

## Overall scorecard

Scores are Correctness / Instruction Following / Completeness / Clarity /
Practical Usefulness / Reasoning & Judgment. Totals are out of 30.

| Model | Accepted | Quality /30 | Retries | Final tokens | Median latency | Best practical role |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `glm-5.1` | 10/10 | **28.4** | 1 | 43,066 | 35.7s | Default general / planning / copy |
| `mistral-large-3:675b` | 10/10 | **28.3** | 0 | 24,866 | 35.3s | Implementer / reviewer |
| `deepseek-v4-flash` | 10/10 | **27.5** | 0 | 35,272 | 14.3s | Fast implementation / value lane |
| `glm-5.2` | 10/10 | **27.3** | 0 | 37,488 | 29.1s | Structured generalist / planning alternate |
| `deepseek-v4-pro` | 10/10 | **27.2** | 1 | 46,849 | 33.5s | Deliberate technical review |
| `kimi-k2.5` | 10/10 | **27.1** | 0 | 58,194 | 28.3s | Broad comparison lane |
| `nemotron-3-ultra` | 10/10 | **27.0** | 0 | 38,634 | 47.2s | Security/tenant review adviser |
| `gemma4:31b` | 10/10 | **26.8** | 0 | 17,813 | 13.6s | Fast bounded task runner |
| `gpt-oss:20b` | 10/10 | **26.8** | 0 | 35,800 | 22.4s | Bounded implementation / planner alternate |
| `qwen3.5:397b` | 10/10 | **26.7** | 0 | 46,328 | 35.6s | Planning and synthesis alternate |

`minimax-m2.5` scored 28.5 over its eight returned answers, but it failed two
finals and required six retries. It is therefore not ranked above the complete
routes. The same reliability caution applies to `kimi-k2.6` and `minimax-m3`.

## Job-type routing

| Job type | Best model | Strong alternate | Why |
| --- | --- | --- | --- |
| Bounded implementation | `mistral-large-3:675b` | `deepseek-v4-flash` | Mistral led the code-task subset; Flash is much faster and has documented value evidence. |
| Multi-step bug fixing / diagnosis | `deepseek-v4-flash` | `glm-5.1` | Flash combines 10/10 reliability with the fastest high-quality latency; GLM 5.1 brings more planning depth. |
| Architecture / planning | `glm-5.1` | `qwen3.5:397b` | Both led the planning subset; GLM 5.1 also handled copy discipline materially better. |
| Technical review | `deepseek-v4-pro` | `mistral-large-3:675b` | Both returned complete, detailed technical work; Mistral is lower-token and retry-free. |
| Security and tenant boundaries | `nemotron-3-ultra` | `mistral-large-3:675b` | Highest security-task score versus a more token-efficient implementation/review alternate. |
| Product / external communication | `glm-5.1` | Human-written or human-revised draft | The only route that passed the benchmark's externally published-copy threshold. |
| High-volume low-risk tasks | `gemma4:31b` | `deepseek-v4-flash` | Gemma minimized tokens and latency; Flash is the safer quality step-up when documented price matters. |

No model should be allowed to autonomously merge security-sensitive code,
authorize tenant actions, rotate credentials, restore backups, or publish
externally. The benchmark evaluates responses, not operational authority.

## Token efficiency

Formula: quality average divided by mean accepted-final total tokens in
thousands. This measures useful benchmark quality per generated/consumed token,
not actual billing.

| Model | Quality /30 | Mean tokens / accepted final | Points per 1k tokens | Read on it |
| --- | ---: | ---: | ---: | --- |
| `gemma4:31b` | 26.8 | 1,781 | **15.05** | Best tight-token route; ideal when tasks are bounded and reviewable. |
| `mistral-large-3:675b` | 28.3 | 2,487 | **11.38** | Best high-quality token-efficient route. |
| `deepseek-v4-flash` | 27.5 | 3,527 | **7.80** | Strong balance of quality, speed, and token use. |
| `nemotron-3-nano:30b` | 26.8 | 3,536 | **7.58** | Efficient, but copy evidence was weaker. |
| `gpt-oss:20b` | 26.8 | 3,580 | **7.49** | Solid token-constrained alternate. |
| `glm-5.2` | 27.3 | 3,749 | **7.28** | Strong structured-work balance. |
| `glm-5.1` | 28.4 | 4,307 | **6.59** | Better overall quality than raw token efficiency. |

Avoid using token efficiency alone as a routing rule. `minimax-m2.5` had a
high returned-answer score, for example, but its 3.71× retry-token multiplier
made it inefficient at the run level.

## Documented cost efficiency

Only ten routes had model-specific documented configured estimates in the
preserved telemetry. Eight routes used a generic Watchdog fallback rate and are
excluded from cost ranking rather than being assigned false precision.

| Model | Accepted finals | Quality /30 | Final cost | Retry-inclusive cost | Retry-inclusive cost / accepted final | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `deepseek-v4-flash` | 10 | 27.5 | $0.099442 | $0.099442 | **$0.00994** | Best documented quality/cost choice. |
| `glm-5.1` | 10 | 28.4 | $0.122904 | $0.159181 | $0.01592 | Best documented overall-quality route; one retry adds overhead. |
| `glm-5.2` | 10 | 27.3 | $0.155296 | $0.155296 | $0.01553 | Good reliable generalist alternate. |
| `deepseek-v4-pro` | 10 | 27.2 | $0.134173 | $0.170402 | $0.01704 | Choose for deliberate review, not raw value. |
| `kimi-k2.5` | 10 | 27.1 | $0.168228 | $0.168228 | $0.01682 | Reliable, but output-heavy compared with Flash/GLM. |
| `minimax-m2.7` | 10 | 26.2 | $0.189678 | $0.262206 | $0.02622 | Complete but slow and output-heavy. |
| `minimax-m3` | 9 | 24.3 | $0.070259 | $0.143070 | $0.01590 | Low listed cost but not a reliable quality/value default. |
| `minimax-m2.5` | 8 | 28.5* | $0.103297 | $0.393813 | $0.04923 | Retry and failure overhead disqualify it as a default. |
| `kimi-k2.6` | 9 | 26.9* | $0.192964 | $0.376133 | $0.04179 | Strong returned answers, but poor run-level efficiency. |
| `kimi-k2.7-code` | 10 | 25.6 | $0.248734 | $0.297577 | $0.02976 | Complete, but slow and token-heavy for its quality. |

\*Quality average excludes empty final answers.

## Speed and responsiveness

| Model | Quality /30 | Success | Median latency | p95 latency | Best use |
| --- | ---: | ---: | ---: | ---: | --- |
| `gemma4:31b` | 26.8 | 10/10 | **13.6s** | 29.2s | Fast low-risk/bounded tasks |
| `deepseek-v4-flash` | 27.5 | 10/10 | **14.3s** | 36.4s | Best fast high-quality route |
| `gpt-oss:20b` | 26.8 | 10/10 | **22.4s** | 67.2s | Fast generalist alternate |
| `kimi-k2.5` | 27.1 | 10/10 | **28.3s** | 88.9s | Fast broad-comparison lane |
| `glm-5.2` | 27.3 | 10/10 | **29.1s** | 88.2s | Responsive structured-work lane |
| `mistral-large-3:675b` | 28.3 | 10/10 | **35.3s** | 43.6s | High-quality code/review with stable tail latency |
| `glm-5.1` | 28.4 | 10/10 | **35.7s** | 94.8s | Deliberate overall default |

## Models to keep out of the default lane

| Model | Reason |
| --- | --- |
| `minimax-m2.5` | Two empty finals, six retries, 3.71× retry-token multiplier despite high returned-answer quality. |
| `minimax-m3` | One empty final, four retries, lowest quality score in the run, and truncation in code tasks. |
| `kimi-k2.6` | One empty final and four retries; use only when its specific style is desired and output is monitored. |
| `minimax-m2.7` | Complete delivery but slowest median latency (109.3s), high token use, and retry overhead. |
| `kimi-k2.7-code` | Complete delivery but low token efficiency, a retry, and truncation in Test 10. |

## Bottom line

Use a small role-based set instead of one universal model:

1. **Default:** `glm-5.1`
2. **Code implementation:** `mistral-large-3:675b`
3. **Fast/value work:** `deepseek-v4-flash`
4. **Lowest-token bounded tasks:** `gemma4:31b`
5. **Structured planning alternate:** `glm-5.2`
6. **Security-review adviser:** `nemotron-3-ultra`, with mandatory human review

This gives you a reliable quality lane, a code-specialist lane, and two
efficient task-runner lanes without paying the retry and empty-output tax seen
in the MiniMax M2.5/M3 and Kimi K2.6 routes.

## Evidence

- Runtime artifact: `data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18.json`
- Stored response export: `data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json`
- Watchdog telemetry: `data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-watchdog-telemetry.json`
- Independent response-score ledger: `data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-independent-scores.json`
- Independent segment ledger: `data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-independent-segments.json`

Pricing remains a documented configured estimate for only ten model routes;
this report intentionally does not claim a complete dollar ranking for all 18.
