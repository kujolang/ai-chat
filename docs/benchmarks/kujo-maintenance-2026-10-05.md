# Kujo maintenance quality experiment — October 5, 2026

Status: live comparison in progress. This revision records the frozen method,
verified transport fix and bounded follow-up plan; final scores are pending.

## Scope and method

This follow-up implements the three next steps from the engineering judgment
comparison: bounded repairs driven by independent development checks,
runtime-qualified small language patterns, and unfamiliar Kujo maintenance tasks.
It does not promote another global prompt or claim frontier-level performance.
The repair controller is an opt-in experiment API; ordinary UI chats do not
automatically execute these task-specific acceptance checks.

The preregistered [protocol](../../benchmarks/kujo-maintenance-protocol.md) uses six
new tasks: configuration values, pagination, ordered stock adjustments, idempotent
migration, atomic settings publication, and lossless CSV export. The baseline and
guided arms use GLM 5.3 Flash through the same Watchdog / Ollama Cloud profile.
Both retain compact grounding, allocation guidance, batch verification and the
existing engineering review. Only the guided arm receives selected pattern text
and up to two development-driven repairs. New guide topics are available to both
arms; this measures supplied context, not exclusive tool access.

There are 13 development cases and 59 distinct holdout cases, calibrated against
independent correct implementations and defective legacy seeds. These are 72
case groups, not 72 independent engineering assignments. Initial guided and
post-repair results are paired observations, not independent rounds. Holdout
results never enter model repair feedback. All initial deliveries, failed
attempts and repair costs count; no transport retry is used to force a pass.

Kujo 1.7.0 default backend is pinned to SHA-256
`2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
Sixteen reference examples passed 32 compile/run checks before generation.
New maintenance patterns are not represented as qualified on older runtimes or
the interpreter backend. Acceptance assets and candidate snapshots are hashed.
Prompt boundaries and hashes are not an operating-system filesystem sandbox.

Raw receipts, model artifacts and snapshots remain in the ignored directory
`data/kujo-maintenance-20261005/`; they are not included in this report because
they can contain private local paths and model reasoning. The final sanitized result
artifact will record measured outcomes and source evidence only.

## Verification and environment

Before model dispatch, local TCP connectivity intermittently failed, including a
standalone Python process connecting to its own loopback listener. The affected
existing HTTP/browser/action/OAuth tests were not evidence of model-generated
code defects. The root cause was not established; no firewall or VPN settings
were changed. A graceful idle application restart did not immediately fix it.
Connectivity later recovered, and three authenticated application health calls
succeeded before benchmark dispatch. Failed setup attempts dispatched no model
requests and were excluded from model cost.

Verification receipts (Node 22.17.0, pinned `KUJO_REFERENCE_BIN`):

| Check | Result |
| --- | --- |
| Reference qualification | 16 examples, 32 checks passed |
| Focused controller, oracle and guide tests | 24 passed |
| Initial serial full suite | Interrupted during loopback incident; not a pass |
| First bounded full suite during incident | 681 passed, 15 failed, 1 skipped |
| Full suite after loopback recovery, before byte-limit fix | 697 passed, 0 failed, 1 existing platform skip; 698 total |
| Full suite with byte-limit fix | 702 passed, 0 failed, 1 existing platform skip; 703 total |

Exact final full-suite command:

```sh
PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH \
KUJO_REFERENCE_BIN="$PWD/data/toolchains/kujo-2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0" \
node --test --test-concurrency=4 --test-timeout=120000 tests/*.test.js
```

The skipped test requires Linux mount isolation. The recovery suite took
66,168.988382 ms; the byte-limit suite took 60,379.00678 ms; these are verification receipts, not speedup claims. The recovery suite overlapped
the beginning of baseline task 1 and the later suite overlapped baseline work, so benchmark latency is not a controlled
throughput comparison. Verbose logs are preserved at
`/tmp/ai-chat-maintenance-{controls-final,recovered-full-tests}.log` and the earlier
`full-tests` / `bounded-full-tests` variants.

## Cross-model reproduction

The controller takes an explicit provider profile and model identifier. The same
frozen protocol can be repeated in fresh owned directories for DeepSeek; no
DeepSeek run or profile change is part of this experiment. See
[development benchmark instructions](../../benchmarks/DEVELOPMENT.md).

## Request-size defect found and fixed during the experiment

Baseline stock task 3 ended on HTTP 413 at provider round 40. AI Chat's audit
record reports a 530,495-byte request, a 95 ms rejection, and a 71-byte JSON-like
response. Read-only Watchdog telemetry identifies request row 8149 at the matching
time as `json_parse_limit`: “JSON body exceeds configured parse limit: 524288”.
The model's discovered context window was 1,048,576 tokens; AI Chat had no separate
proxy-body budget. This is a verified transport integration defect, not a claim
that the stock code failed or GLM exhausted its documented token window.

Commit `6909cf6` adds an independent serialized-body budget to the existing
context compactor. Managed Watchdog routes default to 524,288 bytes, configurable
through `WATCHDOG_MAX_REQUEST_BYTES` and a benchmark-specific override. Operators
must match the smaller actual Watchdog parse/proxy limit. It preserves the model
window/output allowance and saved receipt references; it neither enlarges
Watchdog limits nor automatically replays failed work. Unfit protected content
fails locally before dispatch. Direct Ollama connections with Watchdog telemetry
are unaffected. HTTP 413 errors now explain the request-size boundary without
exposing provider response contents.

Six focused regressions pass, covering the observed request size, Unicode/JSON
escaping, exact byte boundaries, protected input rejection without dispatch,
stream/JSON envelopes, and direct-transport exclusion. The full 703-test suite
passes with one existing platform skip. No Watchdog repository files or settings
were changed.

Both comparison arms continue in the same already-running Node process loaded
at `4d28a5b`; it is not restarted between arms. Therefore this fix is **not**
credited with changing either arm's result. The corpus, guidance and acceptance
assets remain frozen, and the new code is verified separately. Incomplete
candidates retain failed-delivery status even when posthoc frozen checks pass.

The idle interactive LaunchAgent was gracefully restarted after verification.
Authenticated health, providers, state and offline chat smoke checks passed on
port 4174. Its health reports the new 524,288-byte cap; all seven provider profiles
match their pre-restart hash and the experiment-start hash. The benchmark process
on port 4198 was not restarted.

### Bounded transport follow-up (specified before execution)

After both arms finish, run stock task 3 once in a fresh directory against the
fixed server at `6909cf6`. Reuse its original baseline contract and defective seed,
with only the owned path changed: same model/profile, 12,000 response allowance,
15-minute deadline, no new guidance and no retry. Apply the same frozen checks
afterward; show no development or holdout counterexamples to this follow-up model.
Record whether the byte guard actually compacts a request. A new delivery without
a triggered guard is not live evidence that the guard caused success; deterministic
regression coverage still proves the boundary. Report its cost and outcome
separately, never as a replacement baseline pass or a new six-task round.
