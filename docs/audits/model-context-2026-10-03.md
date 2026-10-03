# Model context configuration repair — 2026-10-03

Starting main: `4f53b1541d0258ecbf3edbf7d34107be6ecec524`.
Implementation commit: `3a492d8f4d68da0c047328ad12ab0b9e09c76d46`.
Scope: AI Chat only. No sibling repository changes or benchmark answer repairs.

## Verified problems and changes

| Problem | Evidence | Change |
|---|---|---|
| Most routes had no model-specific metadata | GLM baseline reported `conservative_default` 65,536 despite Ollama `/api/show` advertising 1,048,576 | Opt-in capacity discovery before requests, plus bulk refresh/coverage API and CLI |
| Metadata loaded once could remain stale for a long-running server | Startup-only `loadContextMetadata` | Recheck static/Codex files at most once per minute; dynamic daily refresh, maximum 30-day fallback |
| A fixed tool-result cap could discard useful evidence in a large window | `compactProviderToolContext(..., 262144)` before whole-request budgeting | Default retention grows with selected model input allowance; explicit operator cap preserved |
| Native Codex inherited guessed fallback windows | Unconditional `model_context_window` CLI override | Pass native limits only for known metadata or explicit overrides; unknown native model keeps its own harness defaults |
| Local ingress settings predated current large-context support | Local environment limited messages/total characters to 200/200,000 | Updated to current 2,000 messages, 1M characters/message, 4M total and 8 MiB JSON body |
| Passing tests could precede broken final edits | GLM round 4 CLI regression | Concise system instruction to rerun affected checks after final edit; existing prompt-size ratchet retained |

The discovery module reads exact model identities, not model-name guesses. Public
Ollama cloud uses the architecture-specific `model_info` context field;
OpenRouter-compatible catalogs expose numeric context/output fields. Hermes and
xAI use configured local authenticated catalogs, ChatGPT uses the existing lease,
and Codex retains its effective-window cache. Explicit source mappings are needed
for Watchdog/custom routes: a proxy's name does not establish its upstream.

Cached capacity is keyed by profile, provider, base route, connection and metadata
source. Numeric-only snapshots are atomically written with mode 0600. They do not
contain prompts, descriptions, keys or access tokens. Reads are bounded, redirects
are rejected, failed lookups back off, shared catalog requests are deduplicated,
and shutdown cancels outstanding discovery. Exact/provider operator overrides
remain authoritative. Unknowns keep a visibly unverified fallback. Output capacity
is separate and enforced on JSON/streaming requests when the catalog supplies it.

## Live coverage and limitations

**79/121 saved model selections have verified or explicitly configured limits.**
This counts selections across profiles, not unique model names.

| Provider route | Known | Unverified | Cause of unverified selections |
|---|---:|---:|---|
| Watchdog / Ollama Cloud | 24 | 6 | Official show endpoint returns 404/410 |
| Custom Ollama | 18 | 21 | Official show endpoint returns 404/410 |
| Watchdog / Ollama TUD | 17 | 4 | Official show endpoint returns 404/410 |
| Hermes | 9 | 0 | Current catalog or still-valid existing snapshot |
| ChatGPT plan | 6 | 0 | Authenticated exact-model catalog |
| Codex | 5 | 4 | Absent from local dated model cache |
| xAI OAuth | 0 | 7 | Configured loopback proxy on port 8646 refuses connection |

The 31 unknown Ollama selections reduce to 21 distinct IDs. Independent exact-ID
requests confirmed 404 for `gemma4:e2b/e4b/12b/26b`, `nemotron-3-nano:4b`,
`nemotron-3-super:120b`, and `qwen3.5:0.8b/2b/4b/9b/27b/35b/122b`;
410 for `deepseek-v4-flash` (including `:cloud`), `gemini-3-flash-preview`,
`glm-5.1`, `kimi-k2.5`, `minimax-m2.5`, `qwen3.5`, and `qwen3.5:397b`.
No substitute model or capacity was invented, and model selections were not deleted.

The local Codex cache is dated October 1 and lacks `gpt-5.3-codex-spark`,
`gpt-5.4`, `gpt-5.4-mini`, and `gpt-6-astra`. Their AI Chat initial-transcript
check remains conservative; the unknown-model CLI override has been removed.
A current authoritative Codex catalog and a running authenticated Grok proxy are
needed to resolve those entries. Discovery does not claim model availability,
subscription entitlement or unlimited usage merely because capacity is known.

**GLM-5.3 Flash now resolves to 1,048,576** on both exact alias forms in the
configured cloud routes. A real short GLM streaming request completed with
`context_limit_known:true`, source `discovered:ollama`, and 1,047,552 input
allowance after reserving 1,024 output tokens. The receipt is in the sanitized
[coverage artifact](model-context-2026-10-03.json). All six ChatGPT-plan models
currently report 272,000 through their own catalog; they are not given GLM's limit.

The estimator remains a conservative UTF-8 byte upper bound, not a model tokenizer.
Larger capacity avoids the incorrect 65k restriction, but does not prove every
benchmark will pass or eliminate reasoning mistakes. No new six-task suite was
run here; the four-round baseline remains 19/24. Next benchmarks must be labeled
post-configuration, with compiler versions pinned and actual context receipts
checked. A separate Kujo documentation experiment should not be mixed into that
comparison.

## Deployment and verification

- Private `.env` backup saved under ignored `data/backups/`; updated only context
  discovery/source mappings and the four ingress limits. Existing exact DeepSeek
  override and Hermes metadata snapshot retained.
- Verified no active durable executions/benchmark jobs before restarting the
  local launchagent. Context cache survives restart. Profiles and model choices
  checked against a pre-change fingerprint.
- Baseline before this work: 540 pass, one skip. The first integration check also
  passed 540/one skip. A prompt expansion briefly exceeded the existing 6,000-char
  prompt test; it was shortened without weakening the assertion.
- Focused tests cover exact model identity, effective windows, separate output
  caps, invalid metadata, oversized responses, stale cache, route invalidation,
  unknown models, retry backoff, concurrent catalog deduplication, private atomic
  persistence, shutdown, large receipt history and JSON/SSE policy propagation.
- Native known-window tests remain; an additional regression confirms unknown
  Codex models do not get a guessed harness override.
- Live authenticated `npm run context:refresh -- data/context-coverage-2026-10-03.json`
  against port 4174 completed. A first attempt during startup failed to connect;
  retry after `/healthz` returned 200 succeeded.
- Live short GLM stream and `npm run smoke` passed. Full-suite final receipt is
  recorded below after the final code change.

## Sources and contracts

- [Ollama official API implementation documentation](https://github.com/ollama/ollama/blob/main/docs/api.md): `/api/show` and architecture context metadata.
- [Ollama context documentation](https://github.com/ollama/ollama/blob/main/docs/context-length.mdx): local runtime configuration can limit usable context; cloud capacity must not be substituted for local `num_ctx`.
- [OpenRouter model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties): distinct context and completion fields.
- Live exact-model responses from `https://ollama.com/api/show`, the configured
  Hermes catalog, existing ChatGPT connection catalog and local Codex cache.
- [API contract](../API_CONTRACT.md#whole-request-context-allowance) and
  [setup guide](../../SETUP_AND_INSTALL.md#model-context-capacity-and-refresh).

Final verification: `npm test` — **552 passed, zero failed, one skipped** (553
reported tests, 75,709.147719ms). Log: `/tmp/context-ship-tests.log`. Final
post-restart authenticated smoke passed; log: `/tmp/context-final-smoke.log`.
`GET /api/model-context` confirmed GLM's 1,048,576 window persisted across restart.
The profile/model-selection fingerprint is unchanged. `git diff --check` passed.

Remaining catalog drift duplicates SignalBox capture
`cap_3b1b866e-ba75-4cf3-a64c-50a878cbe119`; no duplicate Capture or Signal is needed.
The resolved GLM context-gap work belongs in Strata, not a new SignalBox finding.
