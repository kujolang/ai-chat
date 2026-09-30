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
