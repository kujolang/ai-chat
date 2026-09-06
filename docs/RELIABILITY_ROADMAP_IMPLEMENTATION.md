# Ten-improvement implementation and acceptance record

Objective: implement **all ten** ranked improvements in PRODUCTION_HARDENING.md. This record tracks work; incomplete rows are not completion claims. Baseline: 6b2e969985fc35fb2ab91d578818b8de6c1ef1ea.

| # | Requirement | Required verification | State |
|---|---|---|---|
| 1 | Durable turn/call journal, receipts and explicit resume | Restart between completed tools; ambiguous in-flight side effect cannot replay; identical finished request returns stored result | In progress |
| 2 | Drain/checkpoint shutdown; recover stale waiting turns | Shutdown during detached tool/stream; restart restores recoverable state | Implemented for streaming and JSON model work; queued admission, child termination, drain and restart tests pass |
| 3 | Bounded SSE queue, slow-consumer policy, replay cursor | Backpressure fixture and disconnected cursor replay without rerunning model/tools | Queue, replay and API tests pass; browser end-to-end replay pending |
| 4 | Provider-aware whole-context budget | Count content, schemas, tool args/reasoning/receipts; preserve protocol under limits and reject impossible fixed input | Streaming budget implemented; other provider paths and metadata pending |
| 5 | Real-family daily-task evaluations | Run actual available model families, compare eager/deferred completion, schema selection, rounds and reported cost/usage | Pending |
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
