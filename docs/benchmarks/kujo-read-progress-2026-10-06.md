# Kujo read-progress and delivery-budget repair — October 6, 2026

Status: complete. Code deployed; 714 tests passed, one existing platform skip.
Fresh six-task guided regression ran on commit `79ae579`; three deliveries and
three transport failures. No general quality or reliability improvement claimed.

## Root causes, not a general quality claim

The preceding maintenance comparison reported 13,063,702 versus 21,880,061 tokens.
Of the 8,816,359 additional reported tokens, migration contributed 7,401,369
(about 84%). Its 294 complete unchanged reads continued after a warning because
that warning imposed no execution bound. Repeated provider-facing results also
remained expanded until context/body pressure triggered generic compaction.
Other task differences included real review/repair work and sampling variation;
the 67.5% aggregate increase is not evidence that every individual task worsened.

The interrupted pagination attempt exposed a separate scheduling defect: review
had a deadline of 04:27:04.466 UTC, after the task/client timeout observed at 04:25:41.589
UTC. Optional review could compete with delivery after useful code was written.
This does not establish that every timeout was caused by review.

## Changes

- Development-loop recovery at six consecutive unchanged complete reads of at
  most two views. Older duplicate result bodies reference the newest full result;
  original journal results, call IDs, assistant text and reasoning are preserved.
- Stop at twelve or more matching reads at a provider-round boundary, before another inference, with
  `execution_no_progress`, `retryable:false`. The task remains incomplete. No
  automatic retry/replay, success fabrication, permission change or file rewrite.
- Changed contents/mtime, new ranges, partial/error results and intervening tools
  interrupt the match. Read-only requests and the independently bounded review/
  final phases are excluded. Explicit resume starts a new bounded window after
  the persisted stop marker.
- Optional review/repair deadline respects the parent task deadline minus a
  60-second delivery reserve. A worker finishing within that reserve is delivered
  with an explicit inconclusive-review notice without optional review inference.
  In-flight provider responsiveness can still consume remaining time; no guaranteed
  latency or general timeout elimination is claimed.
- On-demand types guidance demonstrates `is_bool` and `len(keys(value))`. The
  dictionary-representation warning applies only to the exact reproduced binary
  and relevant guide topics. The upstream Kujo native bug is mitigated, not patched
  in this repository.

No dependencies, provider accounts, selected models, permissions, persistence
formats or model context/output allowances were changed. The new stop code and
checkpoint state are additive. Historical benchmark artifacts remain unchanged.

## Saved-failure replay

`node scripts/replay-read-progress.js /tmp/maintenance-t4-execution.json` operates
on saved evidence without inference and emits no model reasoning. It reaches the
stop after **8 provider responses / 15 tool calls**, including **12 unchanged
reads**, versus the recorded failure's 150 provider rounds / 297 calls. Its first
recovery changes serialized provider context from **26,697 to 23,043 bytes**.
Those are replay counts/bytes, not a live recovery rate or billable-token savings.
The original transcript and immutable results remain available.

## Fresh-run protocol (recorded before dispatch)

Run the same six maintenance tasks once with the prior guided configuration on
GLM 5.3 Flash / Watchdog Ollama Cloud, in fresh owned directories. Keep the same
pinned Kujo SHA, 12,000 output allowance, 15-minute total per task, no transport
retries, frozen independent development/holdout checks and bounded conditional
repair policy. No DeepSeek requests. Include every failure and repair cost.

The comparison is a historical regression check of the repair bundle, not a
randomized causal ablation: the older guided arm lacked the proxy byte fix, and
this run includes the new read guard, delivery budget and qualified type facts.
Grade source quality with the same anchored rubric; distinguish failed delivery,
partial saved code, correctness, cost and editorial quality. Do not replace old
failed results with these new attempts or claim frontier parity.

Raw evidence will remain under `data/kujo-read-progress-20261006/` (ignored).


## Fresh results and assessment

| Measurement | Original baseline | Previous guided | Fixed guided |
| --- | ---: | ---: | ---: |
| Deliveries | 5/6 | 4/6 | 3/6 |
| Saved-artifact development checks | 13/13 | 11/13 | 11/13 |
| Saved-artifact holdouts | 59/59 | 51/59 | 43/59 |
| Total independent groups | 72/72 | 62/72 | 54/72 |
| Reported tokens | 13,063,702 | 21,880,061 | 3,829,268 |
| Reported input tokens | 12,543,603 | 21,406,785 | 3,619,074 |
| Reported output tokens | 520,099 | 473,276 | 210,194 |
| Cached input tokens | 9,479,680 | 17,449,600 | 2,199,680 |
| Complete usage attempts | 5/6 | 4/6 | 3/6 |
| Executed tools | 305 | 570 | 175 |
| Provider rounds | 226 | 365 | 128 |
| Summed request elapsed time | 68m 31.693s | 63m 56.959s | 32m 51.068s |
| Development-controller repairs | 0 | 0 | 0 |
| Assigned-task source score (missing = 0) | 2.625/4 | 2.250/4 | 1.917/4 |
| Edited-artifact score | 2.625/4 | 2.700/4 | 2.875/4 |
| Delivered-artifact score | 2.650/4 | 2.750/4 | 2.917/4 |

**Do not interpret the 82.5% aggregate token decrease as an 82.5% efficiency
improvement.** Pagination and stock failed before editing; CSV failed after
writing correct saved code. Failed attempts have incomplete token accounting.
Only configuration and atomic save delivered in both guided rounds: together they
used **2,243,142 versus 5,189,566 tokens (56.8% less)**. Their matching source grade
is unchanged at **2.875/4**. Against the original baseline those same tasks used
2,341,661 tokens, so the new pair is only 4.2% lower. These are individual samples,
with varying cached context and model behavior, not a causal speed/cost claim.

Migration is a concrete recovery: **1,045,617 tokens, 39 calls, 29 rounds, 12/12
checks and a delivery**, versus 9,517,851 tokens and an unchanged seed previously.
No live read-progress recovery/stop event fired in this fresh round: the saved
replay and deterministic tests prove the new bound; this live outcome cannot be
attributed to that guard. No request-byte compaction was needed. No task reached
the parent delivery reserve. The deadline fix is demonstrated by regression tests,
not by claiming it rescued a timeout in this round.

| Task | Delivery | Tokens | Checks on saved artifact | Source score /4 |
| --- | --- | ---: | ---: | ---: |
| Configuration | Completed | 1,169,801 | 13/13 | 3.00 |
| Pagination | Interrupted stream; seed unchanged | 152,785 | 3/12 inherited | 0.00 |
| Stock | Interrupted stream; seed unchanged | 24,356 | 3/12 inherited | 0.00 |
| Migration | Completed | 1,045,617 | 12/12 | 3.00 |
| Atomic save | Completed | 1,073,341 | 11/11 | 2.75 |
| CSV | HTTP 502; partial saved code | 363,368 | 12/12 | 2.75 |

Source grades use the same four anchored dimensions and unblinded judgment as the
[previous comparison](kujo-maintenance-2026-10-05.md). Configuration retains a clear
single helper and 32 recorded CLI cases but no runnable test suite. Migration
retains an independently rerun six-assertion CLI harness, including idempotence and
1000/1001 boundaries; its quadratic duplicate scan, hardcoded harness paths and
leftover probe limit polish. Atomic save validates before publishing, preserves
metadata, and documents concurrency/durability limits; its tests are case tables
and manual postconditions. CSV now uses the real `is_bool` predicate and qualified
dictionary guidance, but its harness checks first/last row presence rather than
order and incorrectly rejects zero rows. Its 1000/1001 checks pass independently;
its zero-row harness failure is retained, not repaired by the evaluator.

The edited-artifact mean is 7.19/10; the full assigned-task mean is 4.79/10.
Neither is evidence of frontier parity or a general senior-engineer capability.
The apparent delivered-only increase compares different surviving tasks. On the
same delivered tasks, quality did not improve. The app fixes remove demonstrated
failure mechanisms; **overall autonomous reliability is still unacceptable in
this run**.

Engineering-review outcomes are inconclusive/not-requested/not-requested/
inconclusive/pass/not-requested. Configuration produced an invalid verdict and
migration an invalid findings array; both stayed inconclusive rather than being
promoted to passes. The app's existing review repair (configuration) is separate
from the development controller, which was not exercised by these results.

## Transport findings and remaining work

1. **Two incomplete upstream streams remain unresolved.** Pagination and stock
   ended without a terminal marker. Watchdog requests 8714 (`chatcmpl-752`) and
   8718 (`chatcmpl-403`) record success with string `null` finish reasons. AI Chat
   preserved partial output and correctly refused success. Watchdog source
   `src/dashboard_server.kujo:3556` accepts a successful HTTP close without a model
   completion marker; `finish_reason_from_stream_events` stringifies null. That
   explains misleading telemetry, not whether Ollama or transport dropped the
   terminal event. Do not fabricate a successful finish or replay uncertain tools.
   Follow-up: content-free terminal-event/byte provenance on both sides of the
   proxy and a missing-terminal regression in Watchdog. Inspected Watchdog HEAD:
   `a842217c794d9115f54863d69cffffae2485f663`; its existing local config edits were
   not changed by this task.
2. **CSV's 502 was local proxy interference, not a Kujo coding defect.** At
   18:04:58 UTC a temporary packaged Watchdog runtime started on 127.0.0.1:7700
   alongside the existing wildcard listener. Its separate database contains the
   matching request at 18:05:44.190 UTC: 30,025 ms and DNS failure resolving
   `api.openai.com:443`, rather than the intended Ollama route. The temporary
   orphan PID 11301 was terminated; original PID 1244 remained and sole-listener
   status was verified. The originating launcher/test was not identified. No
   sibling source was modified. Follow-up: temporary/test launchers must use
   isolated ports and guaranteed cleanup; proxy startup should reject port
   ownership conflicts. This late interference confounds the final task and
   does not explain the earlier interruptions.
3. **Model quality remains a separate limit.** Malformed review submissions and
   weak generated assertions need stronger evidence before another prompt change.
   Do not add a larger global instruction stack or widen budgets based on this
   run. Do not count a failed delivery's correct file as a completed task.
4. The pinned upstream Kujo literal-dictionary `len` defect remains open. Scoped
   guidance mitigates it; no runtime fix or cross-version qualification is claimed.

## Verification receipt and compatibility

- `PATH=Node22:$PATH KUJO_REFERENCE_BIN="$PWD/data/toolchains/kujo-2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0" node --test --test-concurrency=4 --test-timeout=120000 tests/*.test.js`:
  **715 tests, 714 pass, zero fail, one existing Linux mount-isolation skip**,
  52,717.430719 ms. Detailed log `/tmp/read-progress-full-verified.log`.
- `node scripts/verify-kujo-reference.js` with the pinned binary: 16 examples,
  32 checks. Updated types example independently checked under interpreter too.
- `node scripts/replay-read-progress.js /tmp/maintenance-t4-execution.json`:
  saved failure bounded as reported above.
- `node /tmp/run-read-progress-benchmark.js`: six frozen tasks through isolated
  port 4198; controller exit 0 means evaluation completed, **not six tasks passed**.
  Frozen assets remained intact. Raw results/snapshots/receipts:
  `data/kujo-read-progress-20261006/`. Sanitized statistics and source reviews:
  [JSON report](kujo-read-progress-2026-10-06.json).
- `go run .../candidates/04/harness.go`: six assertions pass. In candidate06,
  `KUJO_BIN=PINNED_BINARY go run boundary_harness.go 1000` and `1001` pass;
  `0` fails incorrectly (generated-test quality finding, not an app regression).
- `node --env-file=.env scripts/smoke-test.js`: production health/providers/state/
  offline chat pass on port4174 after deployment and again after benchmark.
  Initial deployment probe preceded listener readiness and failed; the readiness
  check and rerun passed. Logs retained separately.
- Original provider-profile hash equals final hash. Benchmark listener stopped;
  original Watchdog listener retained. No profile/model/permission changes.

New public behavior is the additive `execution_no_progress` error and explicit
inconclusive review delivery near the parent deadline. No dependencies or existing
provider contracts were removed. Changes were committed in small units and pushed.
