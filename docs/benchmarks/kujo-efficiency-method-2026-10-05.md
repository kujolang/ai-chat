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

## Additional allocation arm

Baseline scaling exposed roughly 13x process-time growth for 4x input, despite
high-level sorted/linear algorithms. A separate trusted probe reproduced the
collection-allocation cost and verified a function-local preallocation alternative
with output equality. An additional opt-in allocation-reference arm will test
whether the model adopts that general idiom and improves actual program scaling.
It is exploratory follow-up, not part of the original four-way isolated ablation.
`KUJO_ALLOCATION_GUIDANCE=0` remains in all four original arms, so their advertised
schemas and guidance do not gain this hint. Grader assets stay unchanged.

The allocation follow-up uses compact grounding + batches + **always** review,
so its direct comparator is Batch. This choice was made after Batch completed and
while Selective was still running: Batch reduced reported token use substantially
but did not improve delivery beyond 2/3. The additional arm tests a concrete code
quality mechanism, not a claim that Batch was already a qualified default winner.

## Supplemental sparse-output measurement

After Selective's first task, source inspection found a claim that joining fixed
64-pair string chunks makes construction linear. The original runs scaling fixture
is contiguous, so its output is a single run and does not stress that claim.
`scripts/measure-kujo-sparse-runs.js` is a separate post-hoc measurement for **every**
configuration: 200/800/3200 even integers produce that many separate output pairs,
three trials each, full output equality, 20-second per-process bound. It does not
change the frozen oracle, completion score or original 106-case count. Report it
separately and do not hide slower variants or treat it as preregistered evidence.

Bounded promotion check: if the allocation arm completes all three tasks, preserves
all independent checks, and materially improves measured construction cost without
a new source-quality defect, run one fresh three-task repeat of that exact
configuration. Otherwise stop this experiment and retain the existing defaults;
do not search indefinitely for a flattering rerun. Even two successful rounds
qualify only this narrow workload, not broad model reliability or frontier parity.

## Observed read-isolation deviation

A receipt audit after the original four arms found Batch merge ran `rg -n keys`
over AI Chat's entire `docs` directory. Its output included one descriptive line
from the historical interval-quality report and one historical benchmark JSON
fixture path. It did not expose a source implementation of these matched tasks,
but it violated the intended restriction against prior benchmark information.
Keep Batch's outcome/cost/artifact checks visible with this caveat; do not present
it as a clean causal control. Hash integrity checks remained satisfied and do not
prove read isolation. The allocation arm was already underway when this was found;
its comparison with Batch is consequently descriptive. Promotion must rely on its
own independent outcomes and a clean observed confirmation, not that control alone.

Generation wall time was not measured on an otherwise idle host: local regression
suites ran during parts of model generation. Consequently response-time differences
are descriptive and can reflect host load as well as provider load and stochastic
work. Independent generated-program scaling measurements ran sequentially after
model tasks, outside those full-suite runs. No wall-time percentage is claimed as
an isolated harness optimization.
