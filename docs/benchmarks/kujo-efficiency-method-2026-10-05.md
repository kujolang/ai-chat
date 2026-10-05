# Kujo efficiency experiment protocol — 2026-10-05

Purpose: separate fewer model interactions from stronger generated code. This is
an exploratory matched-task ablation, not a frontier-model comparison or a
statistical claim about all engineering work.

## Configurations

All use Watchdog / Ollama Cloud, `glm-5.3-flash:cloud`, response allowance 12000,
one attempt per task, 900000 ms caller deadline, the same pinned Kujo 1.7.0 binary
(SHA-256 `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`),
and enabled engineering review/contract. The isolated app uses port 4198 and a
separate database; live chats/profiles are not benchmark fixtures.

| Configuration | Grounding | Case batches | Review |
|---|---|---|---|
| Baseline | legacy | off | always |
| Compact | compact | off | always |
| Batch | compact | on | always |
| Selective | compact | on | selective |

Each configuration gets three separate tasks and fresh output directories:
consecutive integer runs, numeric frequency counts, and linear sorted union.
Prompts specify exact CLI arity, integer/range validation, all-or-nothing output,
JSON-only success/error streams, and checks of real entry points. They prohibit
reading previous answers and acceptance assets. The same tasks are matched across
configurations. The benchmark runner processes tests sequentially; its configured
pane concurrency of two has no effect with one model lane. Provider load and order
can still confound wall time. No invisible retries or manual answer repairs.

## Independent evidence and decision rule

The controller freezes the oracle, its calibration tests and each prompt file
before generation; verifies hashes between tasks and before grading; then invokes
actual generated `main.kujo` files in fresh processes. Model-authored tests and
advisory review verdicts are reported separately. Source edits after generation
invalidate claims about that generated result.

The oracle has an independently implemented positive control and defective
controls (constant output, boolean coercion, contaminated streams, interrupted
execution). Scaling uses 200/800/3200 inputs, three trials per size, with functional
output checked on every trial. Report medians and ratios including startup; do
not convert noisy ratios into portable CI gates.

Source inspection records input validation, error behavior, algorithmic strategy,
entry-point coverage, and duplication. `audit-kujo-source.js` flags exact cross-file
text spans for inspection; it does not parse Kujo or prove semantic duplication.
Tests and shared boilerplate can legitimately match. No arbitrary style score is
allowed to outweigh functional defects.

A default candidate must preserve completed delivery and independent correctness
on every matched task, have no new source-quality defect, and show a useful
reduction in token/call cost. A 20% total-token reduction is the exploratory
threshold for meaningful efficiency. A quality improvement requires a concrete
improved property (for example, eliminating duplicated production logic or an
inappropriate algorithm), not a higher subjective number. One three-task sample
can justify an experimental option; repeat confirmation is required before claiming
a dependable default improvement. If no configuration clears the evidence bar,
retain existing defaults and report that outcome.

Record raw total/input/output tokens and usage completeness, model calls/rounds,
internal verification case count, time, terminal errors, correctness and scaling
separately. Partial generated files after transport failure are diagnostic artifacts,
not successful deliveries. Same-model review is advisory and correlated with the
builder; passing it is not independent acceptance or production certification.

## Rejected setup/pilot records

- A setup attempt requesting concurrency three was rejected by the server's
  reviewed maximum of two before generation. It is not a model result.
- The first baseline pilot (`kujo-efficient-baseline-20261005-v1`) had three terminal
  provider/transport failures. During its last task the operator briefly modified
  the grader to add source auditing; the integrity check correctly invalidated the
  run. The grader was restored byte-for-byte, and source auditing moved to a separate
  tool. This pilot is excluded from official comparisons. A fresh baseline is
  required. This protocol was recorded after that pilot and before completed valid
  configuration grading; it is not a preregistration of the rejected pilot.

The filesystem permissions available to the builder are not an OS isolation
boundary. Hash checks detect observed acceptance changes, not transient changes
restored between checks. This limitation is explicit.

## Transport correction before the comparison

The first compact trial also failed all three deliveries with empty HTTP 408
responses. Those pre-fix attempts are diagnostic records, not the ablation table.
A provider-free reproduction identified pooled-connection poisoning in Kujo's HTTP
server. AI Chat mitigation `019d0a7` uses a fresh socket for every managed Watchdog
stream round, without replay. See [transport evidence](../engineering/watchdog-keepalive.md).
All official configurations must include that same mitigation; baseline and compact
are rerun in fresh `*-v2` directories. The transport improvement cannot be credited
to compact grounding, batching or focused review.
