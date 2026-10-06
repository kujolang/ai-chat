# Kujo read-progress and delivery-budget repair — October 6, 2026

Status: implementation verification in progress; fresh six-task run not yet dispatched.

## Root causes, not a general quality claim

The preceding maintenance comparison reported 13,063,702 versus 21,880,061 tokens.
Of the 8,816,359 additional reported tokens, migration contributed 7,401,369
(about 84%). Its 294 complete unchanged reads continued after a warning because
that warning imposed no execution bound. Repeated provider-facing results also
remained expanded until context/body pressure triggered generic compaction.
Other task differences included real review/repair work and sampling variation;
the 67.5% aggregate increase is not evidence that every individual task worsened.

The interrupted pagination attempt exposed a separate scheduling defect: review
had a deadline of 04:27:04.466 UTC, after the task/client deadline around 04:25:40
UTC. Optional review could compete with delivery after useful code was written.
This does not establish that every timeout was caused by review.

## Changes

- Development-loop recovery at six consecutive unchanged complete reads of at
  most two views. Older duplicate result bodies reference the newest full result;
  original journal results, call IDs, assistant text and reasoning are preserved.
- Stop at twelve matching reads, before another inference, with
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
