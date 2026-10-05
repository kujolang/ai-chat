# Kujo code quality and efficiency — 2026-10-05

**The runtime-qualified allocation recipe produced a meaningful improvement.**
Two fresh rounds of the selected configuration delivered 6/6 programs, passed
212/212 independent correctness checks, and retained the speed improvement.
At 3,200 items, execution fell from baseline medians of 2260–2407 ms to 103–139 ms.
Generation used 52.4% and 59.2% fewer reported tokens than the fresh matched baseline.
This establishes better runtime efficiency with preserved tested correctness on
these tasks. It does **not** establish frontier parity or broadly better autonomous
production judgment.

The tested configuration is now enabled persistently in the local instance:

```dotenv
KUJO_GROUNDING_MODE=compact
KUJO_VERIFICATION_BATCH_ENABLED=1
KUJO_ALLOCATION_GUIDANCE=1
ENGINEERING_REVIEW_MODE=always
```

The server restarted idle on port 4174; all seven provider profiles have the same
hash before and after. Existing model choices, accounts, API keys, permissions,
engineering-review enablement and contract settings were preserved. Repository
installation defaults remain conservative: legacy grounding, batch/allocation off,
always review. The local recommendation is qualified for this pinned runtime and
workload, not every provider or Kujo version. Reverting the first three flags to
`legacy`, `0`, `0` restores the previous workflow.

See the [method, promotion rule and deviations](kujo-efficiency-method-2026-10-05.md),
[sanitized per-task data](kujo-efficiency-2026-10-05.json),
[task contracts](../../benchmarks/kujo-collection-quality-tasks.md), and
[implementation guide](../engineering/kujo-quality-workflow.md).

## Matched comparison

Requested model: `glm-5.3-flash:cloud`, Watchdog / Ollama Cloud. Three tasks:
consecutive integer runs, frequency counts, and linear sorted union. All use the
same 12,000-token response allowance, one attempt, 15-minute caller deadline,
engineering contract/review, and pinned Kujo 1.7.0 default backend. Fresh directories;
no manual changes to generated answers. No frontier-model implementation control.

| Configuration | Delivered | Independent cases | Reported tokens | Model tool calls | Provider rounds | Response time total |
|---|---:|---:|---:|---:|---:|---:|
| Baseline: legacy, no batches, always review | 2/3 | 106/106 | 6,135,254 | 227 | 118 | 37m 34s |
| Compact: compact reference only | 2/3 | 106/106 | 4,108,150 | 163 | 90 | 27m 34s |
| Batch: compact + batches¹ | 2/3 | 106/106 | 1,713,967 | 70 | 57 | 19m 46s |
| Selective: compact + batches + focused review² | 3/3 | 106/106 | 2,779,620 | 87 | 71 | 23m 55s |
| Allocation: compact + batches + allocation, always review | 3/3 | 106/106 | 2,923,129 | 84 | 76 | 24m 27s |
| Confirmation: identical Allocation configuration | 3/3 | 106/106 | 2,505,434 | 69 | 68 | 22m 36s |

Correct files left by failed executions are **not completed deliveries**. Baseline
runs and Compact merge hit the caller deadline; their reported usage is incomplete.
Batch merge exhausted two output-limit continuations before completion; its usage
is complete. No corrected-comparison delivery failed with the earlier 408/EPIPE
transport problem. Reported counts are not exact billing; unfinished rounds may be
missing. Provider load, stochastic generation, run order and regression suites
running during parts of generation confound wall-time attribution.

¹ Batch merge's broad `rg -n keys` over app docs exposed one descriptive line from
an older interval benchmark report and a historical probe-file path. No matched-task
implementation or grader read was observed, but this is a protocol deviation.
Retain the result with that caveat; Batch is not a perfectly isolated causal control.
Allocation/Confirmation file reads stayed in their assigned directories, and
observed shell calls used their own harnesses or runtime/environment discovery.
These observations are not OS-level read isolation.

² The measured Selective run predates the final activity-index correction described
below. Its new index overhead has not been model-benchmarked. Selective performed
zero deterministic repairs in this sample; regression tests cover that branch.

Across the six recorded configurations: 18 attempts, 15 deliveries, and 636/636
fixed checks across saved artifacts. These are repeated task families, not 636
independent tasks. Do not pool this suite with the older one-task 39-case interval
comparison. All six manifests retained the frozen oracle/calibration/prompt hashes.

## Generated-code quality

All 162 original scaling trials checked complete output. Medians include process
startup; these sequential measurements occurred outside full regression-suite runs.

| Configuration | Runs, contiguous input (3200) | Frequencies (3200) | Merge (3200) |
|---|---:|---:|---:|
| Baseline | 2260 ms | 2350 ms | 2407 ms |
| Compact | 110 ms | 5159 ms | 2348 ms |
| Batch | 154 ms | 2719 ms | 2404 ms |
| Selective | 181 ms | 2359 ms | 2859 ms |
| Allocation | 132 ms | 119 ms | 135 ms |
| Confirmation | 139 ms | 103 ms | 113 ms |

The original runs fixture produces a single output run. A separate post-hoc sparse
fixture makes every value produce an output pair. All 54 supplemental trials passed:

| Configuration | 200 pairs | 800 pairs | 3200 pairs |
|---|---:|---:|---:|
| Baseline | 52 ms | 322 ms | 3919 ms |
| Compact | 36 ms | 156 ms | 2088 ms |
| Batch | 39 ms | 170 ms | 1807 ms |
| Selective | 45 ms | 100 ms | 335 ms |
| Allocation | 31 ms | 48 ms | 129 ms |
| Confirmation | 32 ms | 53 ms | 142 ms |

These extra trials did not change the frozen correctness score or task prompts.
They expose output-building cost that the contiguous fixture cannot establish.

Source inspection explains the result:

- Baseline uses correct high-level algorithms, but repeated functional `push`
  copies growing arrays. Runs also copies input during validation. Some Kujo probes
  test helpers/built-ins instead of the actual CLI; real CLI cases were also run.
  One abandoned frequency probe contains an earlier copy of its counting helper;
  a runs scale fixture was disabled. These are not a polished reusable test suite.
- Compact eliminates one costly input copy in runs, but frequency counting adds
  validation/output copies. Merge retains expensive append and numerous guessed
  process-API probes. Compact context alone did not consistently improve code.
- Batch's runs/frequency Go harnesses test real CLI behavior and larger complete
  outputs with expectations built by construction. That improves test coverage,
  but production programs still append repeatedly. Merge incorrectly describes
  total runtime as linear despite its growing-array copy cost.
- Selective runs builds JSON text in 64-pair chunks. It is faster on the measured
  sparse workload, but chunk size does not establish its universal linear-time
  comment. Frequency still appends. Merge catches parsing and processing together,
  so unexpected processing failures would be mislabeled as malformed JSON.
- Allocation and Confirmation use function-local preallocation, indexed writes
  and a final slice. They retain normal JSON serialization, validate before output,
  and restrict parse catches to parsing. Merge remains a two-pointer algorithm.
  Their real-entry-point harnesses use constructed expected values, not copied
  production algorithms. Some harnesses assume owned working directories or a local
  pinned path. Confirmation frequency uses more control flags than necessary;
  maintainability has not uniformly become exemplary.

The duplication scanner records exact cross-file Kujo text matches for inspection;
it is not a parser or proof that semantic duplication is absent. Manual inspection
also covered the relevant Go harness behavior. Shared probe boilerplate is not
counted as a duplicate production algorithm.

**Assessment:** tested correctness was already strong. The new recipe improves a
specific, important engineering property—actual allocation/scaling behavior—and
makes that improvement repeatable in this sample. It does not prove stronger
judgment about persistence, concurrency, deployment, or unseen requirements.
Same-model review remains advisory: Allocation and Confirmation each had two
passes and one inconclusive review. Independent grading supports the result,
not an assumption that the reviewer is always right.

## Efficiency tradeoff and default decision

Allocation used 52.4% fewer reported tokens than Baseline, but 70.5% more than Batch.
Confirmation used 59.2% fewer than Baseline. Better code was not free relative to
the cheapest configuration. The selected configuration earns its local promotion
through two 3/3 deliveries, preserved independent correctness, and measured runtime
improvement. Focused review remains optional: its one measured sample did not show
an additional quality benefit sufficient to justify making it the local default.

Internal batch cases are separate from model calls: Batch 122, Selective 194,
Allocation 107, Confirmation 162. None are counted as independent oracle cases.
Allocation still needed ten input repairs; see JSON for each run's repair counts.

A deterministic eight-case fixture measured 16 → 9 subprocesses and 10,832 → 2,400
model-visible result bytes. Actual program launches remain eight; repeated version
probes are removed. Schemas and case arguments are excluded, so this is **not** a
billed-token estimate. A representative compact reference is 1,964 characters,
2,168 with allocation guidance, versus 1,941 for representative legacy guidance:
its benefit is sufficient information with less rediscovery, not a smaller initial
string. The qualified reference remains capped at 2,200 characters.

## Implementation and verification

Starting revision: `070450c81c23d87414b7c3742ef77b56d8da5b1f`, branch `main`.

| Revision | Meaningful change |
|---|---|
| `019d0a7` | Fresh connection per managed Watchdog streaming round; reproducible transport regression |
| `954427a` | Compact context, verification batches, recoverable case receipts, focused-review option |
| `6e8b820` | Independent collection oracle, mutant calibration, advisory duplication inspection |
| `d043ba3` | Actual entry-point harness guidance for large inputs |
| `1301f58` | Prevent misleading diff excerpts from partial reads and append writes |
| `94223ea` | Exact-runtime-qualified allocation reference and independent schema gate |
| `5e9919b` | Separate sparse-output measurement and calibration test |
| `d0f58fb`, `d53d998` | Preserve mutation-discovery references in focused review without command payloads |

After the original four arms, inspection found that focused selection could omit
references to earlier shell/script/custom-tool activity. The final packet indexes
up to 64 parent receipts, including failures; missing activity forces inconclusive
review. Child cases remain discoverable through the parent verification result.
The index is not a filesystem snapshot. Tests cover discoverability, bounded scope
and rejected pass submissions. This correction does not change the always-review
prompt used by Allocation/Confirmation.

All verification commands use Node 22.17.0:

| Command / evidence | Result |
|---|---|
| Baseline `node --test --test-concurrency=1 tests/*.test.js` | 649 passed, 0 failed, 1 existing skip |
| Final full `node --test --test-concurrency=1 tests/*.test.js` | 672 passed, 0 failed, 1 existing skip; 119165 ms |
| `node --test tests/engineering-review-focus.test.js tests/engineering-review.test.js` | 25 passed after final metadata simplification |
| `node scripts/qualify-kujo-runtime.js PINNED_BINARY default` and `interpreter` | 14 qualification probes satisfied expectations on each backend |
| `node scripts/verify-kujo-collections.js TASK MAIN PINNED_BINARY OUTPUT` | 106 cases and 27 scaling trials per configuration, all passed |
| `node scripts/measure-kujo-sparse-runs.js PINNED_BINARY MAIN` | 9 full-output trials per configuration, all passed |
| `node scripts/measure-kujo-array-growth.js PINNED_BINARY` | Trusted output-equivalent allocation probes; separate from model results |
| `node scripts/reproduce-watchdog-keepalive.js PINNED_BINARY` | Pooled 200/408/EPIPE/200 versus fresh connections 4×200 |
| `SMOKE_PORT=4174 node --env-file=.env scripts/smoke-test.js` | Passed health/providers/state/offline chat on the restarted local instance |

Pinned SHA-256: `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
The trusted 3200-item probe measured function-local repeated `push` at 1905 ms and
indexed preallocation at 33 ms (three-trial medians, full output equality). Top-level
indexed mutation was 596 ms, which is why function locality belongs in the recipe.
Speed is qualified only for this exact binary/default backend; interpreter probes
establish example correctness, not the same performance. The controller authored
and qualified the recipe; generated candidate files were not manually repaired.

Configuration/contracts are documented in `.env.example`, `docs/API_CONTRACT.md`,
and the implementation guide. Tool additions are opt-in and preserve authorization.
No package dependency, account contract or sibling repository was changed. No
credential/profile migration was required; execution metadata additions are
backward-compatible and documented. Other provider transports retain pooling.

## Exclusions, remaining work and evidence

All official configurations share the same [Watchdog fix](../engineering/watchdog-keepalive.md).
Its benefit is not credited to grounding or review. Six pre-fix diagnostic attempts
failed transport: Baseline pilot 0/3, 623,323 reported tokens, 71 calls, 11m 35s;
Compact pilot 0/3, 59,142 tokens, 2 calls, 4m 30s. The first pilot also failed its
acceptance-integrity check after an operator edit; the oracle was restored and
source auditing moved to a separate tool. These adverse records are not hidden or
pooled with the corrected comparison. One rejected concurrency-three setup did not
start generation. See the method for exact circumstances.

Remaining work is bounded and explicit:

- Upstream Kujo: fix queued HTTP 408/read-ahead behavior on reused connections.
  AI Chat's mitigation is deployed. This reproduction does not prove every older
  408 had the same cause; the earlier historical incident remains distinct.
- Upstream Kujo: document and regression-measure supported array-growth idioms,
  including ownership/function-local effects. Preserve functional API semantics;
  do not change `push` behavior merely to improve this benchmark.
- Existing benchmark-isolation follow-up: separately permission the worker and
  acceptance assets. Hash guards detect observed persistent edits, not transient
  tampering or arbitrary reads. The Batch documentation exposure demonstrates why
  fresh output directories alone are insufficient.
- Broader held-out tasks, other models/backends, final focused-packet efficiency,
  and a frontier implementation control remain unqualified. No further reruns were
  added after the single confirmation.

Local raw evidence: `data/kujo-efficiency-20261005/` and
`data/benchmark-runs/kujo-efficient-*-20261005-v1.json`. The companion JSON includes
per-task execution IDs, reported usage/completeness, errors, review outcomes,
source hashes captured during reporting, full oracle outcomes and scaling trials.
Credentials, databases and raw model traces are not committed. Full release logs:
`/tmp/ai-chat-efficiency-release-tests.log`, `/tmp/ai-chat-efficiency-final-smoke.log`;
profile-preservation receipt: `/tmp/ai-chat-efficiency-live.json`.

## Durable records

Strata saved the decision, evidence pointers and handoff in
`ce9c9718-7524-45b6-b201-98c530e7024a`; the existing project timeline/current-state
hub `8582f7c4-1408-44d4-b687-b7f5d6818a5d` was updated to revision 26 with a pointer.
Exact-ID and concept retrieval passed for both. Historical scores were preserved.

SignalBox admitted only two unresolved upstream items (project `kujo`):

| Finding | Capture | Signal |
|---|---|---|
| Queued HTTP 408 on reused connections | `cap_7f9e9b50-63ec-45a0-87ed-a4c78458f10e` | `sig_3b9ce473-b6fe-472b-85cf-16f2d3f56c6f` |
| Qualified array-growth recipes/performance fixtures | `cap_dcce8206-7abe-43b9-bbd1-a733fb97694d` | `sig_00cfb2c3-f586-4534-9434-1c96feeba232` |

Each Capture and Signal passed exact-ID and concept retrieval. The earlier
unconfirmed-408 capture/signal is explicitly related, not silently rewritten.
Existing benchmark-isolation evidence `cap_5ab5ae00-2e58-4e7a-a5dd-147d770143f3` /
`sig_47d24d80-ec87-45ae-95a5-38d55d5e645e`, and the existing app-efficiency/review
findings were not duplicated. Completed fixes, routine verification and general
session summaries were rejected as SignalBox captures. No downstream tasks or
Signal dispositions were created.
