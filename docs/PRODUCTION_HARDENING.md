# Production hardening review

Status: implementation and final validation complete; limitations documented below. Scope: the full production-readiness request dated September 6, 2026, including all fifteen review phases. This document records evidence and remaining work; it is not a production certification.

## Architecture and request lifecycle

| Boundary | Current implementation |
| --- | --- |
| Startup/configuration | `server.js` loads `.env` without overriding process variables and creates `lib/server-runtime.js`. The runtime owns Express, SQLite WAL, encryption, provider profiles, tools, scheduler and telemetry. |
| User input/context | `public/app.js:sendMessageToPaneStream` saves user/assistant placeholders, selects pane profile/model, assembles conversation plus custom instructions and enabled schemas, and POSTs to `/api/chat/stream`. |
| Fixed instructions | `chatRequestPayload` prepends `SYSTEM_PROMPT.md` and optional preferred name. `boundMessagesForRequest` compacts history. Additional tool rules are prepended in the streaming route. |
| Providers | OpenAI-compatible SSE and Ollama NDJSON use the streaming route. Managed Watchdog routes optionally connect directly and post telemetry separately. Codex runs a local CLI. Nonstreaming requests use `bridge_chat.kujo` and AI SDK. |
| Tools | `normalizeTools` merges enabled saved presets. `effectiveToolAllowlist`/`authorizeToolCall` enforce request authorization. `tool-runtime.js` resolves aliases, validates/repairs arguments, invokes executors and caps returned JSON. |
| Tool loop | Provider records accumulate text, reasoning, usage and tool fragments. Authorized calls execute, results return through provider-specific messages, then another provider round begins. Failed executions normally return structured model context. |
| Web | Search uses SearXNG or Ollama with bounded retries/cache/inflight sharing. Browser tools use Playwright contexts scoped to a pane/chat, a reusable browser process, URL/DNS controls, bounded text and optional screenshot artifacts. |
| Local/extensions | Skills expose bounded files under skill roots. Local tools expose configured workspace IDs, read/write ledgers and allowlisted subprocesses. Manifest-declared loopback action adapters are the extension/MCP bridge; there is no generic MCP discovery client. |
| Response/persistence | SSE token/thinking/tool/done/error events feed incremental UI patches and state saves. The client implements continuation passes. Detached mobile streams intentionally continue and checkpoint to SQLite. |
| Context | Saved transcripts remain intact. Request history uses deterministic excerpt compaction; in-loop tool output has a separate character budget. Provider token usage and caching fields are normalized, not locally tokenized. |
| Failure/observability | Stream idle and post-tool reconnect timers, tool-specific deadlines, request IDs, spans/events, audit log and optional Watchdog telemetry. Client retries/continuations are separate HTTP requests. |
| Security | App token, origin/host checks, request-size/rate limits, CSP/Markdown controls, encrypted provider keys, tool allowlists, filesystem roots, browser URL/DNS policy and adapter manifest boundaries. Defaults assume a trusted local operator, not isolated multi-tenant users. |

Representative lifecycle traced through `sendMessageToPaneStream` → persisted placeholders → `chatRequestPayload` → provider request → `processProviderRecord` → tool authorization/execution → provider continuation → SSE/UI patch → incremental state persistence. Normal, detached, failed-tool and continuation branches have independent regression coverage.

## Baseline and investigation priorities

Baseline revision: `f38043c3115ffaba8daf7e447c8b633b09e59350`.

- Detached stream exception handler references a checkpoint callback declared inside the preceding `try` block. The resulting scope error is swallowed; a transport failure can leave a saved assistant turn waiting indefinitely. The handler also supplies empty output instead of the received partial text.
- The provider idle timer is restarted after each tool, although the next tool in the batch may still be running. A slow later tool can be cancelled by a deadline intended for provider activity.
- Stop currently aborts the browser fetch while the server intentionally treats a disconnected client as a mobile detach. Explicit cancellation needs a distinct server-side signal without breaking mobile continuation.
- Client inactivity is 90 seconds while server stream inactivity defaults to 180 seconds; there is no application heartbeat in the current route.
- Tool authorization is enforced, but capability visibility still relies on complete schemas and duplicated prose. Discovery improvements must preserve request-level authorization and explicit automation tool selection.
- In-loop compaction counts only tool content; assistant tool-call arguments, reasoning and schemas need measurement. Failed/compacted tool receipts must preserve enough identity to avoid repeating consequential work.

These were initial source-traced candidates. Validated outcomes and remaining limits are recorded below.

## Completion scope

Streaming interruption/cancellation and recovery; capability discovery; search/browser fallback and cost; prompt/schema/context before/after measurements; provider consistency; long-chat continuity; external boundary errors; performance profiling; security validation/remediation; observability; adversarial tests; full regression suite and isolated E2E; remaining-risk analysis and ranked next ten improvements. Evidence and practical boundaries for these requirements are recorded below.

## Executive summary

The implementation fixes reproduced failures in detached persistence, cancellation after provider headers, cancellation across reused browser sessions, and local-file write containment. It adds explicit Stop control, bounded stream admission, heartbeats, lazy schema discovery, compact capability guidance, useful execution receipts, and observable prompt budgets. This is materially closer to dependable daily local use. It is not a claim of crash-proof execution, multi-user isolation, or verified live-model behavior.

## Critical problems found and root causes

| Problem | Root cause | Evidence and disposition |
| --- | --- | --- |
| Detached failure leaves a waiting turn | Catch block could not access the checkpoint function declared inside `try`; it also discarded partial output | A failing transport regression was red before the fix; saved partial content and recoverable status now pass |
| Stop did not reliably stop server work | Browser abort was treated as a detach; the default HTTP transport also removed its AbortSignal listener as soon as headers arrived | New control endpoint separates Stop from detach. Real HTTP headers-then-stall regression changed from stalled to `AbortError` |
| Later tool in a batch could time out | Provider idle deadline was restarted after each individual tool | A 50 ms second tool now finishes with a 15 ms provider-idle budget, followed by provider continuation |
| Reused browser session fails after cancellation | Route handler captured the first request's cancelled signal | Controlled Chromium navigation failed with `browser_cancelled`; it now uses the current request signal |
| Partial response mistaken for completion or retried unsafely | Client accepted EOF without a terminal event; error recovery/title/repair requests could add model work | Browser UI tests preserve prose and an unfinished code block through reload, expose interruption, and issue one stream request |
| Writes could escape their intended boundary | `existsSync` missed dangling links; sensitive-path filtering did not cover the resolved alias destination | Both cases reproduced. `lstat`/canonical resolution and a no-follow descriptor reject them |
| Telemetry mode `off` included Codex commands | Summarization unconditionally restored raw command/workdir fields | Off-mode route regression verifies command content absent and command length present |
| Completed tools could appear unsuccessful after compaction | Every replacement receipt set `ok:false` | Receipts now retain supplied success/error outcomes and call identities |

## Changes implemented

| Area | Final implementation |
| --- | --- |
| Reliability | Detached terminal failures retain accumulated text/thinking and typed errors; uncertain client disconnections do not launch automatic replay |
| Streaming | Request registry, duplicate/capacity checks, cancellation endpoint, early-cancel tombstones, 15-second comment heartbeats, proxy buffering hint, body-lifetime abort support, malformed/oversized record errors |
| Tools | Request-scoped `tool_discover` loads only authorized deferred built-ins for the next round; common tools and custom schemas stay visible; authorization is recalculated each round |
| Web/browser | Compact search-first routing and known-URL browser fallback guidance; reused session cancellation fix; explicit WebSocket block; bounded search JSON reading |
| Token efficiency | Smaller initial schema set and less duplicated conditional prose; skip title generation and hard-completion repair after terminal stream errors |
| Context | Historical summaries retain initial constraints alongside recent excerpts and explicitly mark quoted history untrusted; tool receipts preserve success/error and bounded path/session/artifact references |
| Performance | Reduce static request payload; preserve existing search cache/inflight sharing and browser/session reuse; add an offline compaction/payload benchmark rather than claim live-provider speedups |
| Security | Canonical write resolution, no-follow regular-file writes, bounded adapter/search/provider-error bodies, telemetry content-mode enforcement, explicit WebSocket policy |
| Observability | Stable execution IDs in cancellation controls; active-stream health counters; per-round schema names and character/byte budgets in audit/trace events; final `context_budget` |
| Tests | Regression coverage for reproduced failures, OpenAI/Ollama discovery, tool cancellation, malformed and oversized streams, long history, successful receipts, and real browser persistence/reload |

## Before versus after

Measured under Node v22.17.0. Run `node scripts/hardening-benchmark.js` for the repeatable payload fixture; baseline is `f38043c3115ffaba8daf7e447c8b633b09e59350`.

| Measurement | Before | After |
| --- | ---: | ---: |
| Built-in schemas initially sent | 17 | 9 with discovery enabled |
| Serialized schema payload | 8,261 UTF-8 bytes | 4,130 UTF-8 bytes (50.0% smaller) |
| Conditional capability instructions, including new index | 2,788 characters | 1,711 characters (38.6% smaller) |
| Headers-then-stall after explicit abort | Still stalled at 300 ms fixture deadline | Reader rejects `AbortError` |
| Dangling/sensitive alias regressions | Both failed | Both pass |
| Browser navigation after prior request cancellation | `browser_cancelled` | Successful reused-session navigation |
| 123-message synthetic history | 164,377 raw characters | 11,017 characters, 9 messages, initial constraint retained |
| 12 large successful tool results | 120,566 raw characters | 21,866 characters, including 10 successful receipts |

The last two rows compare uncompressed input with current bounded output, not a newly introduced compression algorithm: baseline already compacted history/results. The improvement is continuity and correct outcomes. Compaction took a median **0.518 ms**, p95 **0.705 ms**, across 100 warmed local samples in the recorded run. These timings are fixture-specific.

No live-provider TTFT, model tokens, billing, memory soak, or end-to-end speedup was measured. Discovery can add a model round for a deferred capability; it stays out of small catalogs and leaves `web_search` immediately callable. Full-mode telemetry and provider prompt caching retain their documented behavior; no vendor-specific caching headers were invented.

## Architecture improvements

Three small modules own distinct contracts: `stream-lifecycle.js` handles execution cancellation/admission; `bounded-response.js` enforces upstream byte limits; `tool-discovery.js` handles request-local schema visibility and structural budget measurements. They do not replace provider adapters, SQLite storage, or existing executor policy.

The fixed application prompt stays at the front of model context. A compact capability block follows it. Schema loading changes visibility, never authorization. Tool outputs remain associated with their provider call IDs. Explicit cancellation is separate from detached persistence, and response-body lifetime is separate from the promise that resolves provider headers.

## Validation and review coverage

`npm test`: **304/304 passed**, exit 0, recorded duration 22,978.8 ms (baseline: 280/280, 20,104.9 ms; the suites differ, so this is not a performance comparison). Both isolated offline smoke modes passed, including Chromium availability. `git diff --check` passed. Browser reload assertions wait for the save queue to drain, matching the app’s asynchronous persistence contract. All tests use isolated state; no production database maintenance was run. Real Chromium and loopback HTTP fixtures complement injected provider streams. Existing provider-profile, Ollama/OpenAI-compatible, Codex CLI, Watchdog telemetry, tool repair, browser policy, search failure/cache/concurrent-caller, automation, and state-sync tests remain in the suite.

| Review phase | Evidence / practical boundary |
| --- | --- |
| Architecture and lifecycle | Source map above; normal, tool, detached, failure and continuation routes traced |
| Streaming | Real stalled HTTP cancellation, malformed/oversized records, detached error checkpoint, timer batch, client EOF/reload and Stop regressions |
| Capability discovery | Exact-name/category loading; absent tools cannot load; both native Ollama and OpenAI-compatible streaming invoke a newly loaded tool |
| Web/browser | Real navigation, screenshots, scoped sessions, private/redirect rejection and reused-signal test; search cache/retry/concurrent-caller tests. Fallback is agent-guided; no fabricated alternate-provider integration |
| Token/prompt | Measured schema/prose deltas; fixed prompt retains manual index, capability checks, safety and failure guidance |
| Provider layer | Existing transport/model/usage/alias contracts plus two-provider discovery fixtures. Live vendor entitlements and output quality not tested |
| Long context | 123-message immutable-history fixture, fixed/latest preservation, initial constraints and successful receipts |
| Error recovery | Structured tool failures stay available to the model; deterministic malformed records fail visibly; uncertain client execution is not auto-replayed |
| Performance | Offline payload and local compaction measurements; existing cache/reuse behavior preserved. No all-day load or slow-consumer soak |
| Security | Independent source reviews plus controlled parent reproductions and fixes; conditional capabilities, injection, persistence, URLs, shell and telemetry examined |
| Observability | Per-round value-free budgets, exposed/called names, backend, IDs, usage and existing timing spans. Selection reason is observable routing, not private reasoning |
| Adversarial cases | Interrupted prose/code, cancelled tool, stalled headers, oversized body/record, absent deferred capability, 100+ messages, hostile symlinks and browser URL boundaries |

## Remaining risks

- No durable execution journal or exactly-once side-effect guarantee exists. Refresh saved state after an uncertain disconnect; manual retry can repeat completed actions. Process crashes can lose in-flight work.
- The entrypoint waits for HTTP connections on shutdown, but detached work is no longer represented by a client connection; runtime.close initiates cancellation without draining its checkpoints before closing SQLite. Slow SSE consumers do not yet have a dedicated bounded output queue.
- In-loop compaction targets tool-result content, not the entire provider context. Many short receipts, assistant call arguments, reasoning, or schemas can exceed a model's actual token window. Deterministic excerpts can lose middle-of-history constraints.
- Deferred discovery is validated with provider protocol fixtures, not a broad real-model selection evaluation. Discovery adds a round where a deferred schema is needed.
- Search uses one selected backend with bounded retries. There is no direct-fetch/extraction tool or automatic provider failover. Browser fallback needs a known suitable URL.
- Browser HTTP controls and explicit WebSocket blocking are tested. WebRTC/UDP egress and deployment-level network containment are not certified. No pre-change WebSocket exploit was reproduced.
- Enabled shell/project scripts and the separate Codex CLI have host capabilities. The shared operator token is not a multi-tenant boundary. Downstream adapters, external CLI internals, dependencies and host configuration were not audited.
- Stop propagates to streaming providers/tools and Codex subprocesses; it cannot roll back completed actions. Auxiliary nonstreaming repair requests and benchmark queue admission retain separate lifecycles.

## Next ten highest-value improvements

| Rank | Improvement | Expected impact | Effort |
| --- | --- | --- | --- |
| 1 | Durable execution journal and action receipts tied to turn/call IDs, with explicit resume semantics | Prevent duplicate consequential work and recover after restart | High |
| 2 | Drain active requests/checkpoints on shutdown and recover stale waiting turns on startup | Avoid broken chats across restart/deploy | Medium |
| 3 | Bounded SSE output queue with slow-consumer policy and replay cursor | Bound memory and improve reconnect behavior | Medium–high |
| 4 | Whole-context provider-aware budgeting, including arguments/reasoning/receipts | Prevent long tool-loop context failures | Medium–high |
| 5 | Daily-task evaluations across real model families, including discovery accuracy and total task cost | Validate payload savings against task completion and added rounds | Medium |
| 6 | Persist explicit user constraints/decisions separately from lossy excerpts | Improve continuity in long work sessions | Medium–high |
| 7 | Lightweight page fetch/extraction using the existing URL/DNS policy | Avoid browser startup for static-page evidence | Medium |
| 8 | Configured alternate search backend with bounded failover and clear provenance | Improve research availability without hidden retries | Medium |
| 9 | Browser process/network containment and non-HTTP egress tests | Strengthen protection against hostile sites | High |
| 10 | All-day mixed-provider soak, memory/backpressure metrics and unified auxiliary cancellation | Establish operational limits and catch lifecycle leaks | Medium |

Security artifact: Codex Security scan `b2ee3f90-fce1-40ed-bf90-8a16b85e9b1e` finalized successfully with partial coverage and the non-HTTP browser question deferred. The workbench warns that HEAD changed during the mutable review and retains its original revision label; it is not an immutable audit certificate for the final commit. Remediated root causes and regressions are described above. Reported scan-session usage was 4,923,594 total tokens from the shared rollout, not a separately isolated security-work cost.
