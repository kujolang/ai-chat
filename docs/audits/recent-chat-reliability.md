# Recent chat reliability investigation — 2026-09-30

Evidence: read-only local message metadata, execution journal inspection through the authenticated API, and timestamp-correlated audit events. No prompts were replayed and no provider credentials or transcript content are recorded here.

## Findings

Latest 24 non-title executions inspected: 14 completed, 9 interrupted, 1 cancelled. Completion indicates transport completion, not answer quality.

| Finding | Evidence | Action |
| --- | --- | --- |
| Blocked shell command falsely requires reconciliation | `kuxe3dmjkrog0:pass:0`: 217.8 seconds overall; final call rejected in about 5ms with `local_shell_command_blocked`, then `execution_reconciliation_required` | Fixed: executor marks pre-spawn validation failures; server records confirmed failure and lets model continue. |
| Real shell timeout | `iwpluc6ah7065:pass:0`: 171.1 seconds overall; final shell ran about 15 seconds then `local_shell_timeout` | Keep reconciliation: commands may have partial effects. Error now identifies actual tool and failure reason. |
| Provider timed out | `szhd341m9wq6h:pass:0`: HTTP 408 after 11 provider rounds, 338.3 seconds overall | Better timeout explanation; saved execution retains results. Upstream cause remains unknown. |
| Unavailable model | Four DeepSeek v4 Flash cloud attempts returned HTTP 410, three within 234ms, one in 1.8 seconds | Explicit unavailable-model message; permanent HTTP errors no longer advertised as retryable. No silent provider switch. |
| Subscription limit | `7b21dyclkqar6:pass:0`: ChatGPT sharing usage limit after 5.3 seconds | External entitlement; select another authorized provider or wait for allowance. |
| Context rejection | `3go1aeznkupfx:pass:0`: fixed/protected input exceeds allowance, rejected in 74ms | Preserve fail-closed budget enforcement; needs model context metadata and prompt/output-budget review. |
| Evidence starvation during long research | `qet3ab6raip7b:pass:0`: 83 rounds, 184 calls, 1493.8 seconds; final context reports zero tool-result characters and four compacted calls. `076lp207itdhp:pass:0`: 48,000 output reservation / 65,536 fallback window, 17,536 input allowance; final round again zero tool-result characters | Open architectural issue: retain/retrieve source evidence during compaction, use verified provider context metadata, and test research-loop convergence. Do not solve by disabling bounds or inventing model capacities. |
| Repeated invalid workspace identifiers | Correlated `local_workspace_not_found` failures in recent runs | Return configured workspace IDs and explicit recovery hint; no path permission relaxation. |
| Test evidence polluted live audit log | Route/helper fixtures set isolated DB paths but left audit path at repository default; synthetic failures appear in live audit.log | Isolate audit path in both fixtures. Existing log retained, not erased. |

## Changes and safety boundaries

`lib/local-runtime.js` marks shell errors only inside the validation block before `executeCommand`. It does not mark spawn errors, timeouts, aborts, or post-execution failures safe. `lib/server-runtime.js` admits that marker only for local shell validation failures. Genuine uncertain actions still stop pending operator reconciliation. No blanket retries, timeout increases, permission expansion, or automatic reconciliation of historical receipts.

The new marker is internal executor metadata, not a model-controlled argument. Regression coverage checks both confirmed non-execution and genuinely uncertain shell failures. Invalid workspace hints reveal only already-authorized workspace IDs.

Provider HTTP status remains in the error contract. 408/429/5xx may be transient; other 4xx are not labeled retryable. Saved output and completed tools remain available through execution review.

## Remaining work

- Evidence-preserving context compaction and verified context-window metadata are the largest remaining research reliability issue; preserve source references and bounded retrievable results rather than only call receipts.
- Investigate upstream Hermes/Nous 408s separately; an HTTP response alone does not identify which hop imposed its deadline.
- Historical shell-timeout receipts require inspection of their partial effects before resuming. The blocked-command receipt is distinguishable by audit evidence, but was not silently rewritten.
- Watchdog telemetry intake also has failures; these alone do not establish inference failure. Keep Watchdog routing and separate telemetry health from inference health.

## Verification

Targeted shell/workspace route and local-runtime checks: 12 passed. Full-suite result is recorded in the session handoff. Production data inspection was read-only; synthetic fixtures did not replay real prompts.

Targeted follow-up verification passed: 34 local-runtime/journal tests; 7 route safety/recovery checks; 4 HTTP-status and shell-state regression checks. Full serial suite was attempted; its unrelated Chromium containment fixture exceeded the unchanged 20-second deadline while the host was running concurrent compiler/browser workloads. No timeout was increased and no safety assertion disabled. Final result is recorded in the session handoff.

Deployment: verified zero active streams and zero running journal entries, gracefully restarted the local launch agent, and confirmed `/healthz` returned healthy. Historical receipts remain unchanged.

Open evidence-retention follow-up: SignalBox capture `cap_699467f2-c4fc-4962-8293-3ffec0d7d3fa`, signal `sig_206adaa1-75ba-4509-88a8-8f1d212bd998`; exact and concept retrieval verified. No duplicate found. This report and the session handoff hold completed-work details; the signal holds only the unresolved issue.

## Follow-up root-cause work — 2026-09-30

The evidence-starvation issue is now addressed in AI Chat. Provider-bound compaction previously retained only receipts, with no model-callable path back to the original journal result. Added execution-scoped, paginated `tool_result_read`, durable result references in both native Ollama and OpenAI messages, and protection against immediately compacting a recovered page again. Input evidence now takes priority over unused output reservation. The journal remains authoritative; no consequential tool is rerun to recover evidence.

A deterministic three-round test for each wire format compacts a roughly 105 KB result, retrieves the answer from its tail, and completes with the original tool executed exactly once. This proves transport/evidence recovery, not guaranteed behavior of every real model or convergence of arbitrary research tasks.

Hermes's authenticated local `/v1/models` catalog reports `stealth/space-bunny-alpha` context_length 1,000,000, compared with the 65,536 fallback used by affected runs. With a 48,000 output reservation, the nominal input allowance changes from 17,536 to 952,000 before envelope costs. These are declared limits and conservative budgeting units, not measured tokenizer counts or a speedup. A bounded refresh script writes only dated numeric metadata; the local instance now loads this snapshot (414 valid entries). The catalog also reports maximum reasoning effort by default for that model, which may contribute to latency; no unsupported reasoning override was applied.

The live Watchdog Ollama catalog no longer lists `deepseek-v4-flash` and does list `deepseek-v4.1-flash`, `glm-5.3`, and `glm-5.3-flash`. Updated managed suggestions and retired the known failing Flash identifiers. Existing chats, custom models and other provider profiles are preserved; no model is silently substituted for a saved selection.

Telemetry response bodies are now cancelled after intake and persistence-event non-success statuses produce warnings. This fixes resource cleanup and missing diagnostics. Watchdog authenticated reads were healthy (8–132 ms across three local observations); this does not establish the cause of every historical telemetry timeout.

### HTTP 408: established facts and limit of the evidence

Correlated run `szhd341m9wq6h:pass:0` with Watchdog session `wvujvwxe9n90m`: the final upstream request is recorded as successful about 76 ms after AI Chat's failure timestamp, with 58,271 ms upstream latency. Hermes's installed proxy maps its own transport timeout to 504 (300-second socket-read timeout), while Watchdog maps transport failures to 502. The Kujo HTTP receiver can emit plain-text 408 before dispatch if reading an incoming body times out. This identifies another possible origin; it does **not** prove which hop returned the historical 408 because its body was not retained.

Added safe `provider_http_failure` audit metadata: status, round, elapsed time, request/response byte counts and a coarse response-envelope classification (including exact plain `Request Timeout`). No provider text, headers, credentials or transcript are persisted by this event. The user-facing message no longer incorrectly asserts generation was running when a 408 arrived. No arbitrary timeout increase or speculative network rewrite was made.

### Remaining external / historical constraints

- The historical 408's exact origin cannot be recovered from missing evidence; a recurrence now has useful envelope diagnostics. Inspect this event and matching Watchdog trace before altering Kujo or Hermes. No sibling source was changed.
- True historical shell timeouts still require checking partial side effects before reconciliation. Do not retry blindly.
- Exhausted ChatGPT plan allowance remains an external entitlement, not something AI Chat can reset.
- Refresh dated Hermes metadata before its 30-day expiry; stale snapshots intentionally fall back safely.

The earlier SignalBox evidence-compaction capture/signal now describes a fixed issue; this report supplies resolution evidence without creating a duplicate capture.

### Follow-up verification receipt

- Starting commit: `2896f2a55c1a327ab16fec4c7d6d055ae6737e53`; implementation commit: `ae7796f`.
- `node --check lib/server-runtime.js`: passed.
- `node --test --test-concurrency=1 tests/*.test.js`: 471 total, 470 passed, zero failed/cancelled, one Linux-only sandbox skip on macOS; 165.5 seconds. Log: `/tmp/ai-chat-verified-full.log`.
- Focused provider-status/catalog/evidence/metadata selection: seven passed; `/tmp/ai-chat-followup-target.log`.
- `node --test tests/execution-journal.test.js`: eight passed, including database-backed cross-execution isolation; `/tmp/ai-chat-scoped-journal.log`.
- `node scripts/refresh-hermes-context.js`: saved 414 numeric model entries. `loadContextMetadata` + `contextPolicy` verified 1,000,000 for the affected Hermes model.
- `git diff --check`: passed.
- Earlier iteration failures were exact advertised-tool and timeout-message expectations, updated to verify the new contracts. The final full suite includes both and passes; no assertions disabled or deadlines enlarged.
- Deployment preflight: zero active streams and zero running journal entries before graceful local launch-agent restart.

SignalBox remaining 408 finding: capture `cap_05f73ea4-98db-48cd-9762-2a9d6066689c`, signal `sig_c763400a-837a-4561-a85a-a417b0cba5de`. Exact-ID and concept retrieval passed. No equivalent 408 record found; completed evidence-recovery work, routine verification and external allowance exhaustion were rejected as new captures. Existing evidence-starvation signal was not duplicated or silently dispositioned.
- Deployed `/healthz`: healthy. `node scripts/smoke-test.js` with the local instance token and `SMOKE_BASE_URL=http://127.0.0.1:4174`: passed health, providers, state and offline fixture chat (all HTTP 200). No paid inference or user prompt replay. Log: `/tmp/ai-chat-deployed-smoke.log`.

## DeepSeek deferred shell and composer follow-up

Affected execution `hgmrp6hrp594k:pass:0`, model `deepseek-v4.1-flash:cloud`, failed after 12,744 ms with `tool_execution_unavailable`, not a timeout. The saved request authorized `local_shell` and enabled tool discovery. The model invoked that deferred tool without first requesting its schema; the active-schema allowlist stopped the entire chat despite the tool being in the caller-authorized catalog.

AI Chat now distinguishes authorized deferred tools from disabled/unknown tools. A premature call loads the schema, records an explicit non-execution receipt, and lets the model issue a fresh corrected call. Original arguments are never executed. Normal round/call bounds apply; schema recovery survives resume. OpenAI-style and native Ollama three-round fixtures both prove zero shell dispatch before schema delivery and exactly one dispatch after correction; disabled-tool rejection remains covered.

Also fixed a validation boundary found during regression testing: tool-runtime schema rejection occurs before executor dispatch, so it now carries `execution_started=false`. The existing shell failure handler can safely return that error to the model. Executor errors receive no such marker and retain reconciliation requirements.

Composer: removed the save-status pseudo-element on desktop and mobile while retaining accessible save feedback and visible error text. Mobile language/model controls now share a row; the usage chevron remains available. Browser layout tests include real Select2 controls at 320, 375, 720, 900 and 1440 px.

The initial capability instruction now lists only currently loaded schemas, matching the wire request; deferred tools remain in the explicit discovery index. This removes the conflicting hint that encouraged calling an unloaded tool. Schema loading has its own audit event rather than claiming the shell command ran.

Verification: `node --test --test-concurrency=1 tests/*.test.js` passed 473 tests, zero failed/cancelled, one Linux-only skip (474 total; 102.0 seconds; `/tmp/ai-chat-composer-verified-full.log`). Focused shell schema-recovery/validation tests passed three; discovery/observability tests passed six; composer/disclosure/discovery tests passed eight. `git diff --check` and syntax checking passed. Deployment preflight confirmed zero active streams/running executions before graceful restart. No failed user prompt or shell command was replayed, and no historical receipt was rewritten.
Deployed `/healthz` and `node scripts/smoke-test.js` against port 4174 passed: health, providers, state and offline fixture chat all HTTP 200 (`/tmp/ai-chat-composer-smoke.log`). Implementation commits: `cc47c58` (composer), `db23641` (tool recovery).
