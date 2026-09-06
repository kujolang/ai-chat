# Ten-improvement implementation and acceptance record

Objective: implement **all ten** ranked improvements in PRODUCTION_HARDENING.md. This record tracks work; incomplete rows are not completion claims. Baseline: 6b2e969985fc35fb2ab91d578818b8de6c1ef1ea.

| # | Requirement | Required verification | State |
|---|---|---|---|
| 1 | Durable turn/call journal, receipts and explicit resume | Restart between completed tools; ambiguous in-flight side effect cannot replay; identical finished request returns stored result | Implemented; API/browser resume, reconciliation and persistent native restart fixtures pass |
| 2 | Drain/checkpoint shutdown; recover stale waiting turns | Shutdown during detached tool/stream; restart restores recoverable state | Implemented for streaming and JSON model work; queued admission, child termination, drain and restart tests pass |
| 3 | Bounded SSE queue, slow-consumer policy, replay cursor | Backpressure fixture and disconnected cursor replay without rerunning model/tools | Implemented; queue, API and actual-browser interrupted-response replay pass |
| 4 | Provider-aware whole-context budget | Count content, schemas, tool args/reasoning/receipts; preserve protocol under limits and reject impossible fixed input | Implemented for HTTP requests and native initial transcripts; native internal context uses the CLI's configured total-context compaction |
| 5 | Real-family daily-task evaluations | Run actual available model families, compare eager/deferred completion, schema selection, rounds and reported cost/usage | Completed 12-attempt GLM/Grok evaluation; quality failures and missing dollar billing are explicit in the report |
| 6 | Explicit constraints/decisions outside lossy summaries | Create/update/delete scoped durable constraints; preserved through long history and reload | Implemented; API, compaction/restart and browser editor checks pass |
| 7 | Lightweight fetch/extraction under URL/DNS policy | Static extraction without Chromium; redirect/private/DNS rejection; rendering escalation | Implemented; shared transport, hostile-network fixtures and provider continuation pass |
| 8 | Configured bounded search failover | Primary transient failure uses alternate once with provenance; deterministic failure/cancellation does not cascade | Implemented; deterministic executor and cancellation tests pass |
| 9 | Browser process/network containment | Enforced network boundary and non-HTTP egress tests, not merely prompt or Chromium flags | Implemented on macOS and Linux; direct TCP/UDP, inherited descendants and Chromium WebSocket/STUN controls pass |
| 10 | All-day mixed-provider soak, metrics, auxiliary cancellation | Actual sustained run with process/queue/latency evidence; cancellation during repair, title, benchmark admission and stream | Auxiliary cancellation implemented and verified; actual all-day soak still pending |

Do not replace live evaluation or sustained soak evidence with a short mock run. Preserve the full objective across continuations.

## September 6 foundation verification

`npm test` passed 326/326 with Node 22.17.0 (`/tmp/ai-chat-reliability-full-v2.log`). Subsequent search cancellation cleanup and context receipt tests passed 23/23 (`/tmp/ai-chat-failover-final.log`). Port-conflict fixtures disable developer-machine integrations so their five-second deadline measures startup conflict handling instead of scanning installed skills.

The execution journal encrypts request/checkpoint/result/event bodies, binds IDs to request fingerprints, preserves completed call receipts, requires explicit resume, and requires operator reconciliation of ambiguous calls. It claims no exactly-once external side-effect guarantee. Remaining work includes explicit resume UI, Codex continuation semantics, retention policy, and end-to-end reconnect verification. A live PID owner prevents a second process from recovering another instance's active work; ownership acquisition failure closes the newly opened database.

The whole-context estimator counts UTF-8 protocol bytes plus framing and output reservation. It is conservative bookkeeping, not a provider tokenizer measurement. Completed tool groups are compacted only when result IDs match; out-of-order results remain associated with their correct call IDs. Model metadata and complete coverage of non-streaming/Codex paths remain required.

Search failover fixes an extra-retry bug, permits one configured alternate attempt, retains actual backend provenance on cache hits, and aborts upstream work when all coalesced callers cancel or the runtime closes. The full objective remains active; real-family evaluation, persisted constraints, lightweight fetch, browser containment, and the actual all-day soak are still outstanding.

## Explicit continuity milestone

The Saved notes editor now stores user-authored constraints and decisions per chat in an encrypted record independent of messages. Optimistic revisions reject concurrent overwrites; clearing notes advances the revision. Ordinary full-state replacement retains the latest record, while deleting a chat cascades its notes. New requests include the notes in the protected system prefix for that chat. Impossible protected context fails instead of dropping them. No automatic model extraction or rewriting occurs.

The route regression creates notes, rejects stale and oversized updates, checks encrypted storage, rewrites an older transcript snapshot, compacts 50 turns, restarts the runtime, clears notes, and verifies chat deletion. The browser regression edits through the actual sidebar control, reloads the page, simulates a competing update, preserves unsaved edits, reloads current notes, clears them, and closes the dialog using Escape. This resolves the persisted-constraints item listed as outstanding in the earlier foundation snapshot.

Final milestone validation: `npm test` passed 328/328 on Node 22.17.0 (`/tmp/ai-chat-continuity-full-final.log`); `git diff --check` passed. The full ten-item goal is still incomplete.

## Static page extraction milestone

`web_fetch` is available through the selectable Page Reader preset and explicit API schemas. It shares the browser's HTTP transport, URL/site/destination policy, repeated DNS validation, and connection pinning. The browser continues to intercept HTTP through that same transport. The parser performs no JavaScript execution, browser launch, cookie handling, or subresource requests. Results preserve final-URL provenance and explain when rendering may be needed.

Verification: `npm test` passed 338/338 (`/tmp/ai-chat-page-fetch-full-final.log`); both isolated offline smoke modes passed (`/tmp/ai-chat-page-fetch-smoke.log`). Focused tests cover static extraction with Chromium absent, metadata/redirects, blocked private and mixed DNS, DNS rebinding, socket pinning and Host preservation, redirect loops, bounded decompression/output, incomplete bodies, MIME errors, cancellation/shutdown, late DNS completion, Unicode truncation, and provider continuation with the browser disabled. The final discovery-guidance check passed separately (`/tmp/ai-chat-page-fetch-discovery.log`). This completes item 7; it does not establish browser process/network containment or replace the outstanding real-family evaluation and all-day soak.

## Browser containment milestone

Browser launch now requires macOS Seatbelt network denial or Linux Bubblewrap namespaces. Playwright uses inherited pipes; the parent continues to fetch HTTP through the shared checked transport. Unsupported platforms and unavailable sandboxes fail closed. The child inherits only HOME, TMPDIR, PATH, and LANG. macOS provides a process network boundary without claiming filesystem or general IPC isolation. Linux exposes scoped mounts and separate PID, IPC, UTS, network, user, and mount namespaces.

Verification: macOS full suite passed 343 tests with one Linux-only skip (`/tmp/ai-chat-containment-final-macos.log`). Linux focused suite passed 20/20 with no skips (`/tmp/ai-chat-linux-containment-final.log`), including real Chromium pipe rendering, WebSocket and WebRTC/STUN positive controls followed by blocked probes, direct and inherited TCP/UDP probes, and a file outside the mount scope remaining invisible. Linux validation used an isolated Docker internal network, no host workspace/socket mounts, and test-container namespace/proc permissions. CI now requires sandbox availability instead of silently skipping containment probes. The Linux image used the pre-override dependency snapshot; macOS validates the patched dependency tree separately. `npm audit --omit=dev` reports zero vulnerabilities with the qs 6.16.0 override.

This completes item 9 for the supported platforms. It does not replace remaining execution UX, provider-budget coverage, real-family evaluation, or the actual all-day soak.

## Auxiliary cancellation milestone

Streaming and JSON model work now share bounded request admission, explicit cancellation, and shutdown drain. JSON disconnect cancels its provider child; ordinary SSE detach remains recoverable. Bridge and Codex cancellation waits for real child closure before releasing the lifecycle. Benchmark queue entries observe cancellation and clean up listeners/timeouts without consuming a later provider slot. The browser includes auto-title and completion-repair controllers in Stop, assigns request IDs, disables their tool presets, and suppresses title fallback/update after cancellation.

Verification: full suite passed 355 tests with one Linux-only skip (`/tmp/ai-chat-auxiliary-full-final.log`). New checks cover real Node child termination standing in for both bridge/Codex executables on Stop/disconnect/shutdown; queued benchmark Stop and shutdown before dispatch; queue timeout/listener cleanup; non-streaming heartbeat absence; and browser Stop during title generation without fallback. The earlier containment commit also passed Ubuntu 22.04 CI run 34045363930; Ubuntu 24.04's default namespace restriction fails closed instead of being disabled. Real-family evaluation and the actual all-day soak remain pending.

## Live-validation harness and startup preflight

The real-provider harness in `scripts/reliability-live-run.js` creates isolated storage and controlled local/browser fixtures, compares eager/deferred schemas, and records task evidence, reported usage/cost, latency, process memory, event-loop delay, and SSE pressure. Runs shorter than eight hours cannot count as an all-day soak. See `docs/LIVE_RELIABILITY_VALIDATION.md`. The initial live matrix produced provider failures/timeouts, not successful task evidence; real-family evaluation and soak acceptance remain open.

The health response now includes aggregate SSE pressure counters. A detach regression now waits for the server's observed connection closure instead of assuming it happens within 25 ms. Under heavy host load, the serial full suite passed 357 tests, skipped one Linux-only probe, and failed one cold-start port timeout (`/tmp/ai-chat-live-harness-serial-final.log`). Startup now checks an occupied HTTP port before loading integrations or claiming a database; focused startup/harness/SSE checks then passed 7/7 (`/tmp/ai-chat-live-focused-complete.log`). The startup assertions also verify that an occupied-port probe creates no database. Full CI must validate the committed revision.

## Browser replay milestone

The actual browser client recovers missing numbered SSE events from the durable journal after a response ends prematurely. Execution IDs and cursors now survive incremental state persistence, detached checkpoints, startup recovery and reload. A new model pass resets its cursor before receiving events.

The Playwright regression truncates a real server response after its first token, then lets the client replay the remaining journal events. It verifies the complete final answer, one chat POST, one system-time tool execution, exactly two expected provider rounds, and the same execution ID/cursor after reload (`/tmp/ai-chat-replay-final.log`). This completes item 3; explicit operator resume after a server interruption remains part of item 1.

Full local verification passed 358 checks, skipped one Linux probe and timed out one Chromium containment test under concurrent load (`/tmp/ai-chat-replay-full.log`). The unchanged containment suite then passed all three applicable checks in isolation with one Linux skip (`/tmp/ai-chat-replay-containment-recheck.log`).

Live evaluation `data/reliability-eval-20260906-c/summary.json` completed 12 attempts. Grok completed four requests and passed three task checks across eager/deferred modes; all six Nous attempts timed out. The run does not establish mixed-provider success or all-day stability. The harness/startup revision passed CI run 34046847407 and artifact checks 34046847413.

## Whole-context coverage milestone

JSON bridge requests and native Codex initial transcripts now receive the same protected-input budget enforcement as streaming HTTP rounds. Native measurements include the AI Chat wrapper and identify their scope; the CLI receives the chosen context window and a total-context auto-compaction threshold for its own additional instructions, tools and history. This delegates internal Codex budgeting to its supported configuration rather than pretending AI Chat can measure the CLI's hidden envelope. The output reservation does not impose a native output cap.

Exact provider/model metadata can come from a bounded, dated operator catalog or the local Codex model cache. Explicit model/provider overrides take precedence; stale metadata falls back transparently. No model-name heuristic supplies a vendor limit. Tests cover model identity, override precedence, effective percentages, stale/invalid metadata, protected oversized requests rejected before JSON/SSE provider dispatch, and actual compacted bridge payload/schema accounting. Native launch assertions verify the emitted configuration and result metadata.

Full local suite passed 363 checks with one Linux skip and one warning-expectation failure caused by an empty model-name catalog (`/tmp/ai-chat-whole-context-full.log`). Empty catalogs now correctly supply no context metadata without a warning. Focused metadata, native, JSON/SSE and Watchdog warning checks verify that correction (`/tmp/ai-chat-context-final-focused.log`). Replay revision 1d7eba9 passed Linux CI 34047736996 and artifact guard 34047736971.

## Real-family evaluation milestone

See `REAL_FAMILY_EVALUATION_2026_09_06.md` for the actual GLM/Grok matrix and hashed local evidence. Failed loops now retain dispatched-round counts and reported usage. Monetary cost survives normalization when reported; missing rounds/cost remain distinguishable from complete totals. Custom HTTPS targets reference environment credentials without putting secrets in target files or reports. This enabled the already-configured direct Ollama route while Nous and Watchdog were unresponsive.

The full local suite passed 368 checks with one Linux-only skip (`/tmp/ai-chat-live-evidence-full.log`). Context-budget revision d168497 also passed Linux CI 34048140472 and artifact guard 34048140575. The real evaluation completes item 5 without requiring every model answer to be correct. Item 10 still requires a separate actual eight-hour run, and item 1 still requires explicit resume UI, retention and native continuation.

## Retention and active soak

Journal retention now expires terminal payloads in bounded batches while preserving identity tombstones. Running/interrupted executions and uncertain external outcomes are excluded. Expired IDs cannot start provider/tool work again; replay returns an explicit expiration error. Tests cover payload removal, conflict/replay protection across journal reopen, disabled cleanup, a 100-run batch limit and retention of unresolved work (`/tmp/ai-chat-retention-focused.log`). Explicit resume UI and native continuation remain outstanding.

The expiration API regression passed, and the full local suite passed 371 checks with one Linux-only skip (`/tmp/ai-chat-retention-full.log`).

The actual eight-hour mixed GLM/Grok soak began at revision 49d0363 in `data/reliability-soak-20260906-a/`, using the same isolated matrix at 90-second intervals. Its PID and status must be revalidated from the process before interpreting progress. Starting it does not complete item 10. Revision 49d0363 passed Linux CI 34048529447 and artifact guard 34048529513.

## Explicit and native resume milestone

The response's Review execution dialog shows receipts, preserves evidence during reconciliation, restores completed results, recovers running output and resumes the stored request. The resume endpoint ignores replacement model/messages/tools in the submitted body. Browser tests verify the original model and response identity after pane changes, one completed clock call, blocking before uncertain-call reconciliation, successful continuation and reload. Cursor replay skips terminal events from older attempts. Dispatched-round counts include failed rounds before resume.

Streaming native runs retain their CLI session. Each native attempt has a journal boundary receipt in addition to observed action receipts; interrupted attempts require operator review because an action may precede its visible event. Resumption uses the exact recorded session and scope, preserves the sandbox and rejects a changed session identity. Legacy ephemeral runs remain unavailable for native resume. Auxiliary JSON native requests remain ephemeral. A successful native completion requires a completed turn and resolved action receipts, not merely a zero process exit code.

The native restart fixture launches a real child process, records one marker-writing action, closes/reopens the runtime, blocks resume until the interrupted attempt is reconciled, resumes the same persisted session and verifies exactly one marker. A second fixture kills a child returning a different session identity. Focused browser/native checks passed 4/4 (`/tmp/ai-chat-resume-final-focused.log`); the dialog was visually inspected at `/tmp/ai-chat-execution-review.png`.

The installed Codex CLI also passed a real gpt-5.6-sol persistence check: an initial request stored a fresh marker and a second `exec resume` request recalled it without including it in the new prompt. Both returned the same thread ID and successful turn completion. Evidence: `/var/folders/wb/0cck3lgd08n55g_8ly9qmf_00000gn/T/ai-chat-native-live-5eE7Ne/verification.json`. An explicit nonexistent session ID exited 1 without starting a new thread. These checks establish native session behavior; deterministic fixtures establish the application's action/reconciliation boundary.

An initial parallel suite hit host EAGAIN process-spawn failures. The first serial command also selected unrelated scripts outside the package's test glob; those extra scripts failed and are not acceptance checks. The final scoped serial run uses exactly `tests/*.test.js`. The live soak remains active and must finish before claiming all ten improvements complete.

Final scoped serial verification passed 378 checks with one Linux-only skip (`/tmp/ai-chat-resume-full-scoped.log`). Subsequent native checks passed 2/2 (`/tmp/ai-chat-native-resume-final.log`), including stored-result replay with unreadable current profile credentials; replay does not depend on contacting or decrypting the provider. The native receipt stores the complete bounded item so MCP server/tool identity remains available when reconciling an interrupted action. The live CLI's saved initial and resumed turn contexts both recorded `sandbox_policy: read-only` and `approval_policy: never`.

## Final-runtime soak handoff

Resume revision `5ce4c0a` passed Linux CI `34050772806` and artifact guard `34050772840`. The preliminary soak A was deliberately stopped after 2,943,517 ms because its runtime revision (`49d0363`) preceded the completed resume implementation. Its preserved summary reports 33 attempts, mixed-provider success, no SSE overflow, and incomplete all-day duration. It is preliminary evidence only.

Soak B started on the clean `5ce4c0ae156fd5ca85c47d91b0228423982f6d4f` runtime at **2026-09-06 18:14:18.374 UTC**, in `data/reliability-soak-20260906-b/`. Its earliest eight-hour completion is **2026-09-07 02:14:18.374 UTC**. Initial PID is `31652`; execution handle is `1350`. Revalidate that exact process or handle before treating it as live or terminal. Observation timeouts do not justify restarting it. Documentation-only changes after launch do not change the tested runtime. Review terminal summary, metric gaps, memory growth, queue pressure and per-family outcomes before accepting item 10. No all-day success is claimed yet.
