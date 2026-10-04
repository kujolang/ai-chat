# GLM engineering judgment: three fresh rounds

## Result

The improved workflow produced **9/9 artifacts passing the frozen independent
oracle (135/135 checks)**. A later, explicitly separate partial-write probe found
a data-integrity defect in round 3's HTTP service. **Acceptance after all checks
performed is 8/9**. Generated artifacts were never repaired by the evaluator.

All nine server executions completed; only **7/9 final streams reached the
benchmark client**. Two large terminal events overflowed AI Chat's SSE queue.
That application bug is fixed and both exact saved results subsequently replayed
intact, with no tools rerun. The original benchmark delivery failures remain in
the results. Code correctness, delivery, and advisory review are separate metrics.

This is evidence that explicit failure requirements and verification help the
model deliver stronger work. It is not evidence of frontier-model parity or
reliable autonomous production judgment.

## Controls and provenance

- Model: `glm-5.3-flash:cloud`; profile: `Watchdog / Ollama Cloud`.
- Frozen generation commit: `690a0285227c419df9e18e584ca5a52be3c6a462`.
- Three fresh tasks, repeated three times, concurrency 1, one attempt, no model
  retry or human artifact repair. Each task had a 20-minute outer deadline and
  a 12,000-token per-response allowance.
- Tasks: exact Kujo decimal sums, atomic Kujo score batches, persistent Node HTTP
  entries with failed-write consistency. See [task contract](../../benchmarks/judgment-transfer-tasks.md).
- [Frozen independent oracle](../../scripts/verify-judgment-transfer.js) ran only
  after all generation finished. Reference controls and deliberately defective
  implementations calibrate it. Its 45 checks per round cover exact arithmetic,
  strict rejection, corrupt state, failed-write disk/visible state, recovery,
  concurrent updates, and restart. It does not certify every failure mode.
- Direct agent Kujo calls used the qualified, SHA-pinned 1.7.0 default backend.
  A discovered inheritance gap meant model-authored Node/Go harness children
  could still find 1.5.0. The independent oracle explicitly used pinned 1.7.0.
  The inheritance fix was isolated until generation finished.
- No new DeepSeek or OpenAI/frontier model runs; no review-off or matched
  same-task control. Tasks and explicit failure requirements differ from the
  earlier suite, output allowance increased from 6,000, runtime changed, and
  application tests overlapped generation. Do not infer causal quality or speed
  gains from these comparisons.
- Runs: `judgmentfinalglm1`, `judgmentfinalglm2`, `judgmentfinalglm3`.
  Raw receipts, outputs and controls: `data/benchmark-runs/`; generated files:
  `data/dev-benchmark-2026-10-04-judgmentfinalglm{1,2,3}/`.
  [Machine-readable evidence](glm-engineering-judgment-three-rounds-2026-10-04.json)
  includes execution IDs, checks, usage, source hashes and review outcomes.

## Results by round

| Round | Server completed | Stream delivered | Frozen checks | Frozen tasks | After supplemental probe | Advisory passes | Reported tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3/3 | 3/3 | 45/45 | 3/3 | 3/3 | 1/3 | 4,383,217 |
| 2 | 3/3 | 2/3 | 45/45 | 3/3 | 3/3 | 2/3 | 4,420,299 |
| 3 | 3/3 | 2/3 | 45/45 | 3/3 | 2/3 | 2/3 | 8,853,331 |
| Total | 9/9 | 7/9 | 135/135 | 9/9 | 8/9 | 5/9 | 17,656,847 |

All nine contracts were recorded before source writes. There were three review
repair cycles; four final reviews remained inconclusive. The supplemental fault
was applied only to the round 3 service whose source used `FileHandle.write`;
“after supplemental probe” does not imply exhaustive fault injection of all tasks.

| Round/task | Stream | Frozen checks | Duration | Tokens | Final review |
|---|---|---:|---:|---:|---|
| 1 / decimal | delivered | 15/15 | 450.305 s | 2,760,013 | pass after one repair |
| 1 / ledger | delivered | 11/11 | 243.976 s | 778,344 | inconclusive: citation |
| 1 / HTTP | delivered | 19/19 | 312.550 s | 844,860 | inconclusive: freshness evidence |
| 2 / decimal | lost terminal event | 15/15 | 535.479 s | 1,747,409 | inconclusive: verdict shape |
| 2 / ledger | delivered | 11/11 | 328.370 s | 2,031,512 | pass |
| 2 / HTTP | delivered | 19/19 | 197.684 s | 641,378 | pass |
| 3 / decimal | delivered | 15/15 | 412.066 s | 1,864,017 | pass |
| 3 / ledger | lost terminal event | 11/11 | 660.843 s | 6,510,509 | inconclusive: invalid verdict JSON |
| 3 / HTTP | delivered | 19/19 | 179.147 s | 478,805 | pass; supplemental defect found |

Usage was complete in the execution journal for all nine runs. Runner-only input
repair counts undercounted failed transports; journal reconciliation yields
**29 input repairs**, **334 provider rounds**, and **597 executable tool calls**.
Wall span was **55m 36.564s**; summed task latency was **55m 20.420s**. These are
observations under uncontrolled host load, not performance-improvement claims.
Expected rejection tests, exploratory language probes and permission denials
must not all be counted as product errors.

## What improved, and what did not

Observed strengths:

- All three decimal implementations use integer cents and handle aggregate
  bounds. In round 1, the reviewer identified a real leading-zero rejection bug;
  the worker repaired it and added regressions before the final independent run.
- All three services publish in-memory state only after successful persistence.
  The frozen oracle confirmed disk AND visible state survive ordinary forced
  write failures, followed by recovery and concurrent updates.
- Corrupt state is rejected rather than reset. Model-authored tests exercise real
  subprocesses and failure cases, rather than only compile/syntax checks.
- Final responses usually disclose the difference between model-authored tests,
  evidence receipts, and an independent oracle.

Remaining quality weaknesses:

- Round 3 HTTP `persist()` calls `await fh.write(...)` once and ignores
  `bytesWritten`. The supplemental child-only preload performs a legal partial
  write: POST returns **200**, GET shows the complete entry, but disk contains
  only `{"entries":{`. The ordinary unmodified control passes. The probe is
  calibrated against a defective writer and one that completes remaining bytes.
  This is a demonstrated generated-code defect, not a hypothetical warning.
  Node documents the returned byte count and distinguishes partial writes from
  complete-file helpers: [official filesystem documentation](https://nodejs.org/download/release/latest-jod/docs/api/fs.html#filehandlewritestring-position-encoding).
- That service also opens a predictable temporary filename with `w`, rather than
  exclusive creation. Collision/symlink behavior was not experimentally tested;
  it remains a source-supported concern under a hostile shared-directory threat
  model. Do not treat these task artifacts as production-ready services.
- The third ledger is unnecessarily elaborate: repeated parsing and a custom
  array detector based on JSON serialization, despite available language helpers.
  Other outputs are clearer. Passing behavior does not imply consistent design.
- Language exploration still includes unsupported helpers and immutable-binding
  mistakes. Some shell-based test invocations were blocked by the configured
  destructive-command gate. Restrictions were not loosened for the benchmark.
- Reviewer protocol/freshness failures consume time and sometimes prevent a
  useful verdict. A reviewer pass missed the partial-write defect.
- Cost is high: the third ledger alone used 71 provider rounds, 158 executable
  calls, and 6.51 million reported tokens. This is not an efficient small-task
  workflow yet. Nested-runtime inconsistency and task differences confound the
  cause; a matched follow-up is needed before claiming an efficiency fix.

The supplemental probe is [reproducible](../../scripts/probe-entry-short-write.js)
and separate from the unchanged 45-check oracle. Its ordinary control passed;
its injected run deliberately exited 1. It exercises partial string writes
through `FileHandle.write`, not every filesystem API or power-loss scenario.

## Comparison with earlier evidence

| Evaluation | Task acceptance | Additional evidence |
|---|---:|---|
| Previous standard six-task suite, three rounds | 17/18 | 18/18 responses; Go prime edge-case failure |
| Previous new quality tasks, three rounds | 5/9 | 82/93 checks on 1.5 VM; same artifacts 89/93 on 1.7 |
| Current fresh transfer tasks, three rounds | 9/9 frozen; 8/9 expanded | 135/135 frozen checks; one later partial-write failure |

The historical standard GLM record remains **86/96 accepted tasks across 16
rounds**, with eight fully passing six-task suites. Do not add these new tasks to
that denominator: contracts and grading differ. The prior quality batch's
14,902,641 reported tokens were a lower bound (incomplete usage), while this
batch's 17,656,847 are complete. No valid cost-reduction percentage follows.
See the [previous assessment](glm-verification-three-rounds-2026-10-04.md).

## Professional assessment

These are subjective ratings for the observed work, not pass-rate conversions:

| Dimension | Prior assessment | Current assessment /10 |
|---|---:|---:|
| Overall capability in this workflow | 7 | 7.5 |
| Delivered code quality | 6.5 | 7.5 |
| Usefulness with supervision | 8 | 8.5 |
| Independent production judgment | 4 | 5 |

The output is useful supervised implementation work, roughly mid-level on these
bounded tasks. Independent production decisions still require experienced
review. The stronger failure behavior is encouraging, but explicit task coaching,
expensive trial-and-error, and the unhandled partial write limit the conclusion.
We helped the workflow make better decisions; we did not establish senior-level
judgment or parity with an untested frontier-model baseline.

## Application defects fixed after the frozen runs

| Change | Evidence / compatibility |
|---|---|
| Qualified runtime inherited by Node/Go child commands (`fc06a80`) | Direct/nested probes changed from 1.7/1.5 to 1.7/1.7. Hash/alias checks remain after permission checks. Bridge runtime unchanged. |
| Contract-linked custom test commands included in review inventory (`fc9cc68`) | `node test.js` receipts now contribute ordering and bounded output tails; later writes still invalidate freshness. No claim of semantic coverage from exit 0. |
| Large terminal SSE delivery (`90471c8`) | Buffer admission attempted 306,018 and 313,046 bytes against 262,144. Terminal chunks respect backpressure and suppress interleaving heartbeats. Ordinary queue cap and complete payload fields retained. |
| Review citation choices (`a0a34cd`) | Schema offers successful inspected refs only; existing validation and correction/repair budgets preserved. Live improvement from this follow-up has not been benchmarked yet. |
| Supplemental oracle (`c1095bc`) | Detects falsely acknowledged partial persistence; calibrated positive/negative controls. Does not silently alter the frozen evaluation. |

The server was restarted only after generation finished. Both failed deliveries
replayed byte-complete saved payloads (305,932 and 312,976 transmitted bytes),
**zero tools replayed**, **zero overflows**, and **65,560-byte peak pending output**
against the unchanged 262,144-byte cap. Seven provider profiles and their names,
provider IDs, model lists and base URLs were preserved exactly.

The earlier failed live preflight is retained: five HTTP 400 responses plus one
operator-cancelled request at `cfa8d50`. It exposed OpenAI-shaped tool replies on
Ollama-native transport. `690a028` fixed the wire format before these fresh runs.
Those six preflight attempts are application-failure evidence, not model-quality
scores. This evaluation therefore involved nine eligible tasks plus six aborted
preflight attempts; no failed attempt was silently recycled into a pass.

## Verification and remaining work

- Full application suite: `node --test --test-concurrency=1 tests/*.test.js`
  on Node 22.17.0: **636 passed, 0 failed, 1 skipped**. Log:
  `/tmp/ai-chat-judgment-complete-full.log`. Focused protocol/runtime and oracle
  calibration tests also passed. No introduced regression remains known.
- Independent oracle: three invocations, each 45/45, exit 0.
- Supplemental probe: ordinary control exit 0; injected defect exit 1 as expected.
- No generated source edits by evaluator. File-operation inspection found no
  writes outside assigned task directories; one parent-directory listing occurred
  in round 3 HTTP work. No forbidden oracle/prior-answer reads were found in the
  inspected file-operation receipts. This was a prompt boundary, not a sandbox.
- Live restart, profile preservation and exact journal replay verified in
  `/tmp/ai-chat-judgment-live-verification.json`.

Remaining: qualify the efficiency/review improvements on matched tasks; do not
ship generated services without addressing defects and broader failure testing.
The older Kujo 1.5 VM arithmetic root cause remains a separate existing runtime
follow-up. No sibling repository was changed. No new full model round was run on
the post-benchmark fixes, and no claim of improved live review pass rate is made.


### Reproduction commands

```sh
# Real execution; substitute an available qualified binary, never assume PATH.
node scripts/qualify-kujo-runtime.js /absolute/qualified/kujo default
node scripts/verify-judgment-transfer.js data/dev-benchmark-2026-10-04-judgmentfinalglm1 /absolute/qualified/kujo
node scripts/verify-judgment-transfer.js data/dev-benchmark-2026-10-04-judgmentfinalglm2 /absolute/qualified/kujo
node scripts/verify-judgment-transfer.js data/dev-benchmark-2026-10-04-judgmentfinalglm3 /absolute/qualified/kujo
node scripts/probe-entry-short-write.js data/dev-benchmark-2026-10-04-judgmentfinalglm3/03/server.js --control
# Expected exit 1 on the untouched round-3 artifact:
node scripts/probe-entry-short-write.js data/dev-benchmark-2026-10-04-judgmentfinalglm3/03/server.js
node --test --test-concurrency=1 tests/*.test.js
```

Actual generation commands and exact executable/hash controls are preserved in
`data/benchmark-runs/verification-scripts/run-judgment-final.py` and
`judgmentfinalglm-controls.json`. The command uses `scripts/run-benchmark-suite.js`,
`--provider-profile "Watchdog / Ollama Cloud"`, `--model glm-5.3-flash:cloud`,
`--tool-preset local-dev`, `--require-instance-role any`, `--max-tokens 12000`,
`--max-attempts 1`, `--stream-timeout-ms 1200000`, `--concurrency 1`, and each
assigned `suite.md`/run ID. It deliberately targeted the idle local instance.

### Durable follow-up

SignalBox admitted one unresolved efficiency finding:
`cap_96caee5f-2ebb-4feb-b160-adafe67e6665`, signal
`sig_43c2eb25-5ab0-471b-b0df-e7bded60c543`. Both exact IDs and concept searches
were verified. Existing runtime qualification and review-reliability findings
were deduplicated, not recreated. Completed transport/runtime fixes, routine
verification and implementation summaries were rejected as SignalBox material;
they belong in the report and Strata. No downstream task or disposition was made.
