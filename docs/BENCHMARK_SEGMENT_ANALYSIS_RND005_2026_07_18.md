# RND005 Model Segment Analysis — OpenRouter (TUD)

This is a companion to [the scored RND005 review](./BENCHMARK_REVIEW_RND005_2026_07_18.md).
It reorganizes the same 198 successful responses around practical routing
questions: open-weight-like alternatives, lower-end models, token efficiency,
and speed.

## Method and limits

- Quality is the existing advisory score out of 30.
- Reliability is successful final responses / 10 tests.
- Speed is the median upstream latency observed by Watchdog for this run.
- Cost is Watchdog's estimated USD total across all upstream attempts, including
  retries. It is useful for *relative* comparison, not billing reconciliation.
- "Open-weight-like" is an operational grouping, not a license audit. These
  models were used through OpenRouter; this benchmark cannot establish their
  source availability, license, weights, or self-hosting rights.

The runner made 200 requested comparisons. Watchdog observed 232 upstream
attempts because of transient retries and the two final empty-output Kimi
failures. That distinction matters: a model can look acceptable on final-answer
quality while still consuming extra time and tokens during retries.

## 1. Frontier models removed: open-weight-like alternatives

For this decision, the useful comparison lane is GLM, DeepSeek, Devstral,
Nemotron, and the two Kimi variants. MiniMax is shown separately because this
benchmark does not establish it as an open-weight option.

| Model | Quality | Reliability | Median latency | Reported output tokens | Estimated attempt cost | Read on it |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `mistralai/devstral-2512` | 24 | 10/10 | 28.2s | 16,106 | $0.0515 | Best practical non-frontier engineering lane: compact, reliable, and quick. |
| `deepseek/deepseek-v4-pro` | 24 | 10/10 | 70.1s | 44,120 | $0.1355 | Best depth-oriented alternative; use for review/planning, not fast loops. |
| `z-ai/glm-5.2` | 23 | 10/10 | 46.0s | 38,070 | $0.1174 | Dependable structured baseline; weaker on the hardest system tradeoffs. |
| `moonshotai/kimi-k2.7-code` | 24* | 9/10 | 78.0s | 43,849 | $0.4850 | Good returned coding work, but the Test-10 empty output and retries make it poor for unattended runs. |
| `moonshotai/kimi-k2.6` | 23* | 9/10 | 53.7s | 62,765 | $0.4686 | Useful returned planning/communication; same reliability warning. |
| `nvidia/nemotron-3-ultra-550b-a55b` | 20 | 10/10 | 21.4s | 41,878 | $0.1290 | Fast and verbose, but unsafe as a factual or product-claim owner. |
| `minimax/minimax-m3` | 24 | 10/10 | 78.4s | 64,120 | $0.5252 | Thorough alternative lane, but highest observed cost and very slow/verbose. |

\*Quality is computed only from returned answers; the missing Test-10 answer is
not counted as a low-quality response.

### Open-weight-like recommendation

1. **Default:** `mistralai/devstral-2512` for bounded engineering tasks and
   task runners.
2. **Depth lane:** `deepseek/deepseek-v4-pro` for planning, review, and an
   independent technical perspective.
3. **Reliable baseline:** `z-ai/glm-5.2` when you want a more deliberate,
   structured alternative without Kimi's retry risk.
4. **Keep but do not automate unattended:** the two Kimi variants. Their
   successful answers are useful, but 18/20 final reliability plus large retry
   cost is not a production-task-runner profile.
5. **Do not promote:** Nemotron for factual, security, or externally published
   work. Its speed does not offset invented specifics.

## 2. Best lower-end / lower-cost models

"Lower-end" here means models that can credibly take routine work without
using the most capable frontier lane. It does not mean the models are weak.

| Model | Quality | Reliability | Median latency | Est. cost / completed answer | Best use |
| --- | ---: | ---: | ---: | ---: | --- |
| `openai/gpt-5.4-mini` | 25 | 10/10 | 18.9s | $0.0075 | Best general lower-cost choice: bounded implementation, cleanup, and structured tasks. |
| `mistralai/devstral-2512` | 24 | 10/10 | 28.2s | $0.0052 | Best lower-cost implementation alternate. |
| `google/gemini-3.5-flash` | 25 | 10/10 | 30.0s | $0.0161 | Fast technical comparison lane; enforce evidence-only marketing. |
| `~anthropic/claude-haiku-latest` | 24 | 10/10 | 24.6s | $0.0123 | Clear task/communication lane; map telemetry alias `anthropic/claude-haiku-4.5`. |
| `google/gemini-3.1-flash-lite` | 22 | 10/10 | 4.8s | $0.0034 | Cheapest/fastest draft lane; not a final security or architecture owner. |
| `mistralai/mistral-medium-3-5` | 23 | 10/10 | 51.8s | $0.0072 | Economic generalist, but not as technically rigorous as Devstral. |

### Lower-end routing

- **One default with a quality floor:** `openai/gpt-5.4-mini`.
- **Lowest-cost code task runner:** `mistralai/devstral-2512`.
- **Fastest safe-ish draft lane:** `google/gemini-3.1-flash-lite`, only with
  tightly scoped prompts and mandatory review.
- **Fast comparison / second implementation:** `google/gemini-3.5-flash`.

## 3. Best quality for token efficiency

This table uses the final-answer corpus: quality points divided by average
reported output tokens per successful response. Higher is better. It does not
claim that shorter is inherently better; it identifies models that delivered
the most judged usefulness without spending output budget unnecessarily.

| Model | Quality | Avg. output tokens / success | Quality points per 1k output tokens | Conclusion |
| --- | ---: | ---: | ---: | --- |
| `google/gemini-3.1-flash-lite` | 22 | 1,007 | **21.8** | Extremely efficient, but only when the task can tolerate its lower quality ceiling. |
| `mistralai/devstral-2512` | 24 | 1,611 | **14.9** | Best viable engineering efficiency winner. |
| `openai/gpt-5.4-mini` | 25 | 2,410 | **10.4** | Best balanced quality-per-token option. |
| `mistralai/mistral-medium-3-5` | 23 | 2,283 | **10.1** | Efficient generalist; lower correctness ceiling. |
| `openai/gpt-5.4` | 27 | 2,899 | **9.3** | High-quality frontier option that is unusually restrained in this corpus. |
| `openai/gpt-5.3-codex` | 27 | 2,927 | **9.2** | Strong engineering quality without an excessive output budget. |
| `google/gemini-3.5-flash` | 25 | 5,259 | **4.8** | Good quality, but output-heavy for a "Flash" routing decision. |
| `minimax/minimax-m3` | 24 | 6,412 | **3.7** | Good output, but too verbose for cost-sensitive routine work. |

### Token-efficiency decision

If saving money is the primary goal, choose a quality floor first:

1. **Quality floor 25/30:** `openai/gpt-5.4-mini`.
2. **Quality floor 24/30:** `mistralai/devstral-2512`.
3. **Draft-only / quality floor 22/30:** `google/gemini-3.1-flash-lite`.
4. **High-quality frontier without output bloat:** `openai/gpt-5.3-codex` or
   `openai/gpt-5.4`.

Avoid choosing Kimi or MiniMax on token cost alone: their final answers may be
useful, but their long outputs and retry behavior made the observed cost much
less favorable.

## 4. Best quality for speed

This is the practical latency ranking. Median upstream latency excludes local
queueing and the runner's sequential scheduling; use it to compare model
responsiveness, not end-to-end user wait time in a multi-pane chat.

| Model | Quality | Reliability | Median latency | Best interpretation |
| --- | ---: | ---: | ---: | --- |
| `google/gemini-3.1-flash-lite` | 22 | 10/10 | **4.8s** | Absolute speed winner, for low-risk drafts only. |
| `openai/gpt-5.4-mini` | 25 | 10/10 | **18.9s** | Best speed/quality balance for routine work. |
| `openai/gpt-5.3-codex` | 27 | 10/10 | **23.6s** | Fastest top-quality engineering model in this run. |
| `~anthropic/claude-haiku-latest` | 24 | 10/10 | **24.6s** | Clear, reliable response lane for bounded tasks. |
| `mistralai/devstral-2512` | 24 | 10/10 | **28.2s** | Best non-frontier speed/quality tradeoff. |
| `google/gemini-3.5-flash` | 25 | 10/10 | **30.0s** | Good speed, but ask it to be concise. |
| `openai/gpt-5.4` | 27 | 10/10 | **30.4s** | A strong high-quality choice when Codex is not the preferred mode. |

### Speed decision

- **Best top-quality speed:** `openai/gpt-5.3-codex`.
- **Best cheap speed:** `openai/gpt-5.4-mini`.
- **Best non-frontier speed:** `mistralai/devstral-2512`.
- **Fastest possible draft:** `google/gemini-3.1-flash-lite`.

## Practical routing matrix

| Need | First choice | Lower-cost fallback | Do not optimize away |
| --- | --- | --- | --- |
| Bounded code change | GPT-5.3 Codex | GPT-5.4 Mini or Devstral | Tests and review for security/tenant changes. |
| Complex architecture | GPT-5.4 / GPT-5.6 Terra | DeepSeek V4 Pro | Explicit assumptions and decision points. |
| Security/connector review | GPT-5.5 | Gemini 2.5 Pro or Claude Opus | Human review; no benchmark result makes this autonomous. |
| High-volume task runner | GPT-5.4 Mini | Devstral | Tight output cap and acceptance checks. |
| Fast low-risk drafting | Gemini 3.1 Flash Lite | Claude Haiku | Fact checking and explicit source constraints. |
| Open-weight-like comparison | Devstral | GLM 5.2 | Avoid Kimi for unattended long tasks until empty-output behavior is resolved. |

## Bottom line

The data gives you three especially clean operating modes:

1. **Best absolute engineering default:** GPT-5.3 Codex.
2. **Best cost-conscious reliable worker:** GPT-5.4 Mini, with Devstral as the
   best non-frontier alternative.
3. **Best speed-first draft worker:** Gemini 3.1 Flash Lite, but only for
   constrained, reviewable work.

For cost control, prefer a routing policy with an explicit output cap and a
quality floor instead of selecting only by model name. The benchmark shows why:
some models are fast yet unsafe for factual work, while others are high-quality
but turn a single long task into an expensive retry-heavy interaction.
