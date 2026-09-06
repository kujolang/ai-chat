# Ten-improvement implementation and acceptance record

Objective: implement **all ten** ranked improvements in PRODUCTION_HARDENING.md. This record tracks work; incomplete rows are not completion claims. Baseline: 6b2e969985fc35fb2ab91d578818b8de6c1ef1ea.

| # | Requirement | Required verification | State |
|---|---|---|---|
| 1 | Durable turn/call journal, receipts and explicit resume | Restart between completed tools; ambiguous in-flight side effect cannot replay; identical finished request returns stored result | In progress |
| 2 | Drain/checkpoint shutdown; recover stale waiting turns | Shutdown during detached tool/stream; restart restores recoverable state | Core stream tests pass; auxiliary lifecycle still pending |
| 3 | Bounded SSE queue, slow-consumer policy, replay cursor | Backpressure fixture and disconnected cursor replay without rerunning model/tools | Queue, replay and API tests pass; browser end-to-end replay pending |
| 4 | Provider-aware whole-context budget | Count content, schemas, tool args/reasoning/receipts; preserve protocol under limits and reject impossible fixed input | Streaming budget implemented; other provider paths and metadata pending |
| 5 | Real-family daily-task evaluations | Run actual available model families, compare eager/deferred completion, schema selection, rounds and reported cost/usage | Pending |
| 6 | Explicit constraints/decisions outside lossy summaries | Create/update/delete scoped durable constraints; preserved through long history and reload | Pending |
| 7 | Lightweight fetch/extraction under URL/DNS policy | Static extraction without Chromium; redirect/private/DNS rejection; rendering escalation | Pending |
| 8 | Configured bounded search failover | Primary transient failure uses alternate once with provenance; deterministic failure/cancellation does not cascade | Implemented; deterministic executor and cancellation tests pass |
| 9 | Browser process/network containment | Enforced network boundary and non-HTTP egress tests, not merely prompt or Chromium flags | Pending |
| 10 | All-day mixed-provider soak, metrics, auxiliary cancellation | Actual sustained run with process/queue/latency evidence; cancellation during repair, title, benchmark admission and stream | Pending |

Do not replace live evaluation or sustained soak evidence with a short mock run. Preserve the full objective across continuations.

## September 6 foundation verification

`npm test` passed 326/326 with Node 22.17.0 (`/tmp/ai-chat-reliability-full-v2.log`). Subsequent search cancellation cleanup and context receipt tests passed 23/23 (`/tmp/ai-chat-failover-final.log`). Port-conflict fixtures disable developer-machine integrations so their five-second deadline measures startup conflict handling instead of scanning installed skills.

The execution journal encrypts request/checkpoint/result/event bodies, binds IDs to request fingerprints, preserves completed call receipts, requires explicit resume, and requires operator reconciliation of ambiguous calls. It claims no exactly-once external side-effect guarantee. Remaining work includes explicit resume UI, Codex continuation semantics, retention policy, and end-to-end reconnect verification. A live PID owner prevents a second process from recovering another instance's active work; ownership acquisition failure closes the newly opened database.

The whole-context estimator counts UTF-8 protocol bytes plus framing and output reservation. It is conservative bookkeeping, not a provider tokenizer measurement. Completed tool groups are compacted only when result IDs match; out-of-order results remain associated with their correct call IDs. Model metadata and complete coverage of non-streaming/Codex paths remain required.

Search failover fixes an extra-retry bug, permits one configured alternate attempt, retains actual backend provenance on cache hits, and aborts upstream work when all coalesced callers cancel or the runtime closes. The full objective remains active; real-family evaluation, persisted constraints, lightweight fetch, browser containment, and the actual all-day soak are still outstanding.
