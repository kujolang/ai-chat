# GLM after the development-verification intervention

**All 18 original-suite responses completed, but strict acceptance was 6/6, 5/6, 6/6: 17/18, up from 16/18 in the preceding batch. Production code quality did not show a comparable improvement. The new Kujo tasks completed only 5/9, with an important runtime defect contributing to the difficulty.**

These are GLM-5.3 Flash results through **Watchdog / Ollama Cloud**, not a new DeepSeek or OpenAI comparison. The experiment comprises 27 first-attempt tasks: three repeats of the original six tasks and three repeats of three new Kujo tasks. No model attempts were retried, no generated artifacts were repaired by the evaluator, and no settings or application source were changed during the runs.

[Machine-readable evidence](glm-verification-three-rounds-2026-10-04.json) · [Previous comparison](glm-review-three-rounds-2026-10-04.md) · [Intervention](development-verification-intervention-2026-10-04.md)

## Results at a glance

| Round | Original suite: strict acceptance | New Kujo: completed and accepted | New Kujo independent checks, original runtime | Standard elapsed | New Kujo elapsed |
|---|---:|---:|---:|---:|---:|
| 1 | 6/6 | 2/3 | 27/31 | 15m 26.964s | 9m 55.914s |
| 2 | 5/6 | 2/3 | 31/31 | 14m 27.244s | 14m 23.203s |
| 3 | 6/6 | 1/3 | 24/31 | 13m 41.464s | 20m 42.897s |
| Total | **17/18 (94.4%)** | **5/9 (55.6%)** | **82/93 (88.2%)** | **43m 35.672s** | **45m 2.014s** |

Across this experiment, 23/27 responses completed; 22/27 tasks met their respective acceptance criteria. Keep the two suites separate when interpreting that aggregate: the new tasks are different and have no historical baseline. Total timed suite elapsed was 88m 37.686s.

A response completing, an artifact passing some checks, and production readiness are three different outcomes. The second inventory task and third counter task left artifacts that pass the independent checks but never delivered a completed response. They remain failed deliveries. The unfinished third parser passes nine rejection checks but fails **all seven valid-input checks** on the runtime used during generation; 9/16 does not make it a functioning parser.

## Historical comparison: original six tasks only

| Configuration | Rounds | Accepted | Fully accepted suites | Suite elapsed |
|---|---:|---:|---:|---:|
| Original 65K context | 4 | 19/24, 79.2% | 0/4 | 54m 5.641s |
| Corrected 1M context | 3 | 17/18, 94.4% | 2/3 | 40m 34.741s |
| Engineering guidance | 3 | 17/18, 94.4% | 2/3 | 64m 21.124s |
| Initial independent review | 3 | 16/18, 88.9% | 2/3 | 68m 6.458s |
| Updated verification/tooling | 3 | **17/18, 94.4%** | **2/3** | **43m 35.672s** |

GLM's original-suite history is now **16 rounds, 96 tasks, 86 accepted (89.6%), eight fully accepted suites**. The nine new Kujo tasks are additional and are not folded into that historical score. DeepSeek's previously reported 73/94 over 19 runs is unchanged; no DeepSeek attempt ran in this experiment.

The new standard batch took 36.0% less elapsed time than the previous batch. Reported usage was **6,534,663 tokens**, all recorded complete, versus **at least 14,824,015** previously. This is an observed difference, not a controlled performance gain: timing workloads changed within the allowed adaptive task, host load was uncontrolled, and there was no paired review-off control. The new prime workloads were 500,000, 100,000, and 100,000; the previous completed rounds used one million. No claim of faster Kujo execution follows from these suite times.

## What the standard artifacts actually did

All twelve generated test-suite invocations passed independently. They report 91 framework tests/subtests; one API suite wraps its own checks inside one Node test, so raw test counts are not comparable quality scores. Fresh-source prime checks passed **46/48**: the round-2 Go program returns 168 primes for inputs 0 and 1 by silently substituting 1,000, whereas its Kujo counterpart correctly returns zero. This violates the explicit equivalence requirement, so the round-2 timing task is a strict failure despite valid timings at 100,000. Neither artifact documents a shared minimum-input restriction. Freshly built duplicate CLIs passed all three independent fixtures, including hashes, sizes, sorted paths, repeat output, empty files, and missing-root errors.

| Task | Strict result | Quality evidence |
|---|---|---|
| CSV program | 3/3 | Normal and quoted-customer totals work; all three fail the aggregate arithmetic probe in different ways. |
| Kujo/Go timing | **2/3** | Five formal trials per language and verified medians at measured inputs; round 2 fails equivalence at 0/1. |
| Discount regression | 3/3 | Each demonstrates a failing test before the source fix and passing tests afterward. Supplemental half-up oracle mismatches: 0, 0, 314. |
| Persistent HTTP API | 3/3 | CRUD, malformed/null input and real process restart work. All three expose unsaved in-memory state after a failed write. |
| Intentional timeout | 3/3 | Each executes the harmless script at 1,000ms, then exactly once at 10,000ms, with partial and complete evidence. |
| Go duplicate CLI | 3/3 | Tests/builds pass; independent five-file fixtures produce the correct two duplicate groups deterministically. |

### Money handling remains weak

The unchanged aggregation fixture supplies 9,500 rows of `9999999999999.99`; the exact total is `94999999999999905.00`.

- Round 1 wraps its integer-cent sum and prints `-89467440737095611.16`.
- Round 2 also wraps its sum. It additionally mishandles a single amount at the signed-int64 cent boundary, producing malformed negative money output.
- Round 3 uses floating-point aggregation and prints `94999999999999984.00`, **79.00 too high**. It also accepts `NaN` and `Inf` as money and emits nonfinite totals.

These are supplementary defensive-quality probes, not retroactively added strict requirements. The third program prints comma-separated display text without escaping a comma in a customer name; the original request did not require machine-readable CSV output, so that is not counted as a strict failure.

The discount oracle checks 101,101 bounded inputs per implementation with exact integer half-up arithmetic. Results remain 0/0/314 mismatches, identical to the preceding batch. The original fixture does not specify half-cent tie handling, so this remains a separately labeled quality observation.

### Persistence still fails after a write error

Each independent API probe creates, updates, deletes, stops the process, starts another process against the same file, and confirms the persisted result. All three pass. All three promptly reject JSON `null` with 400.

Making only the evaluator's own data file/directory unwritable then produces a 500, leaves disk unchanged and keeps the server alive. But a subsequent GET exposes two tasks rather than the one actually persisted. Each implementation mutates live memory before saving. Atomic rename protects the file publication step; it does not roll back the in-memory mutation. **All three reviewers passed these APIs without identifying or fixing this defect.**

Round 3 did successfully recover from a separate generated-test failure: objects were passed to `Buffer.from`, expected error text was wrong, and failed setup outside `try/finally` leaked an in-process server. A 180-second command timeout stopped that test run; the model corrected the test helper and cleanup, then passed final tests and a real-child smoke test. That is useful debugging evidence, but it did not address failed-write state consistency.

### Timing evidence is real, but not a language shootout

Verified compute medians were:

| Round | Input | Kujo median | Go median |
|---|---:|---:|---:|
| 1 | 500,000 | 22,593.535ms | 156.841ms |
| 2 | 100,000 | 14,635.266ms | 50.722ms |
| 3 | 100,000 | 4,550.133ms | 35.353ms |

Reported medians match the saved executions. Round 2's discarded wrong-argument Go invocation is excluded; calibration and post-review checks are not silently counted as formal trials. Bounds are exclusive in rounds 1/2 and inclusive in round 3; independent correctness checks honor that choice. Host activity and generated implementations differ. These numbers validate reporting and execution, not intrinsic language performance or interpreter/JIT equivalence.

## New Kujo tasks: delivery versus artifacts

| Task | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Bounded duration parser | Delivered; 16/16 | Delivered; 16/16 | Output-cap failure; 9/16 on original VM |
| Atomic inventory transfer | Delivered; 11/11 | Provider-continuation failure; artifact 11/11 | Delivered; 11/11 |
| Persistent counter | Output-cap failure; no `main.kujo`, 0/4 | Delivered; 4/4 | Output-cap failure; artifact 4/4 |

The completed five responses all pass their independent task checks. Seven of nine task artifacts pass all applicable checks on the original runtime, but only five were delivered completely. The counter's four checks cover separate-process persistence, range rejection without mutation, corrupt-file preservation, and controlled failed-write consistency. They do not certify power-loss durability, concurrency, or every possible malformed state.

The new suite consumed **at least 14,902,641 reported tokens**, 421 provider rounds and 772 recorded tool receipts—more than the standard suite despite having half as many tasks. The standard suite used 346 provider rounds and 615 receipts. This is substantial runtime-discovery and recovery overhead, not evidence that merely increasing context makes the work efficient.

### A verified environment problem, not just unfamiliar-language reasoning

The unchanged third-round parser fails with `[KUJOVM001] ... Invalid binary operation: bool > int` in `parse_digits` on **PATH Kujo 1.5.0's default VM**. Independent execution of that identical file produces the correct answer under:

- the same Kujo 1.5.0 binary with `--interpreter`;
- the available Kujo 1.7.0 binary in default mode;
- Kujo 1.7.0 with `--interpreter`.

More strongly, the **entire third-round 31-check quality verifier passes** under 1.5.0 interpreter and 1.7.0 default, versus 24/31 on the original VM. All three artifact sets under 1.7.0 score 27/31, 31/31, 31/31: **89/93**. The four remaining failures are the missing first counter file, which changing a runtime cannot supply.

This isolates an execution-backend difference with strong evidence for a 1.5.0 VM defect; it does not identify the compiler instruction or register-allocation cause. The model's claimed workaround was not sufficient on the original VM. No runtime was upgraded, no source was repaired, and these supplemental checks do **not** retroactively convert interrupted responses into completed tasks. They show why blaming all Kujo failures on model training would be wrong.

AI Chat's agent tools use PATH `kujo`; bridge `KUJO_BIN` is separate. The four new reference examples pass but do not cover this failure. Runtime capability qualification needs more representative coverage before claiming that the environment is suitable for general Kujo coding.

## Failure attribution

Four new-suite tasks did not deliver:

1. Round 1 counter: `output_continuation_limit`, 199,543ms; no final main file.
2. Round 2 inventory: `tool_continuation_timeout`, 206,667ms; one provider round lacks usage. The journal proves the post-tool wait failed; it does not isolate Ollama, Watchdog, or the upstream connection as the origin.
3. Round 3 parser: `output_continuation_limit`, 496,951ms; repeated VM errors before delivery.
4. Round 3 counter: `output_continuation_limit`; artifact passes four checks, but no completed response. See machine-readable receipt for precise duration.

The output cap remained 6,000 per provider response with two bounded length continuations. These are configured harness stops interacting with the model's runtime exploration/output use, not a demonstrated inability to write the final logic. The largest terminal context estimate was 520,813 against an input allowance of 1,042,576; terminal budget records report zero compactions. This is not a reconstruction of every intermediate context estimate. None of these failures was the 20-minute benchmark deadline or the old 15-second command limit. The three deliberate one-second timeout tests are expected successes and are not added to this failure count.

## What improved in review—and what did not

Original-suite final review outcomes improved from **3 pass / 13 inconclusive** to **13 pass / 5 inconclusive**. All eighteen current standard tasks reached review. One extra review/repair cycle reran a stale static check on final prime source; it was procedural verification, not a demonstrated semantic repair.

Across all 27 tasks: 16 final passes, seven inconclusive outcomes, four tasks that never reached review. The seven rejections are now diagnosable: four uninspected evidence references, two invalid-JSON submissions, and one invalid findings array. No final outcome was merely unexplained four-round exhaustion. The verdict-only last round helped termination, but valid formatting/evidence references remain unreliable. More valid review verdicts did not prevent the API or CSV defects.

## Professional assessment

| Dimension | Previous | Current | Assessment |
|---|---:|---:|---|
| Overall development capability | 7/10 | **7/10** | Better familiar-task completion; useful implementation and recovery |
| Delivered code quality | 6.5/10 | **6.5/10** | No broad upgrade: defensive money/state defects remain |
| Supervised usefulness | 8/10 | **8/10** | Strong scaffold and bounded implementation value with independent checks |
| Unsupervised production judgment | 4/10 | **4/10** | Inconsistent failure invariants, expensive exploration, review blind spots |

These are qualitative professional judgments, not calibrated measurements or a conversion of 82/93 into a grade. The evidence supports **mid-level ability on bounded implementation, with junior-level inconsistency in production judgment**. It does not support senior-level autonomy or frontier-model parity. There was no new OpenAI/frontier control, so this experiment cannot establish that gap numerically.

The work is useful; it is not uniformly poor. Prime implementations, regression fixes, CLI behavior, and basic API workflows are verified. The problem is trusting them without independent failure tests. Kujo is additionally penalized by the installed VM and by delivery interruptions: eight of nine artifact sets pass their task checks on 1.7.0, yet only five tasks completed under the actual generation setup. Both facts matter.

## Next justified experiment

1. **Qualify and explicitly select the agent runtime/backend first.** Preserve the bridge distinction; add the unchanged parser reproduction to compatibility checks. Revalidate file/error APIs and existing workflows before changing the local runtime. Do not patch generated source to work around an already-fixed old VM without evaluating the newer runtime.
2. **Run a controlled output-budget experiment** on the new tasks after runtime qualification, with fresh directories, fixed runtime, same model and equal attempts. Test a larger supported output allowance against 6,000; do not raise timeouts or retry failed artifacts into passes. This can separate budget exhaustion from reasoning limits.
3. **Ground actual file/JSON/error APIs**, not just arithmetic examples. Provide compact executable, version-qualified examples and narrow documentation retrieval. The present four-example guide is insufficient for the observed IO/type-error discovery cost.
4. **Turn failure invariants into executed evidence.** Have a separate evaluator test persistence rollback, finite/exact money and overflow on isolated fixtures. A read-only same-model review missed these repeatedly. Preserve evaluator separation and never expose the independent test answers as task solutions.
5. **Make verdict errors recoverable within the existing review budget**, for example validated reference choices and precise feedback while a round remains. Do not weaken reference validation or force a pass.
6. After those controls are established, compare exact GLM, DeepSeek and a selected frontier model on fresh tasks and paired review-on/off runs. The historical six tasks are a regression suite, not sufficient evidence of general coding quality.

No fixes from this list were applied during this benchmark. The runtime-selection issue is recorded for human review as SignalBox Capture `cap_ca954530-df63-4f70-8e7e-71ff735eced1`, Signal `sig_a006df31-d2de-4835-841a-6ea48d6a6d0c` (project `ai-chat`). Existing review/accounting/JIT findings were not duplicated or dispositioned.

## Reproduction and verification receipt

Starting application commit: `7d5ca82efaf2970a8cf1be5d7853ac52e6e75a9e`. Runtime/tooling changes were frozen. Saved catalog identifier: `glm-5.3-flash:cloud`; verified context window 1,048,576 with a 6,000-token output reservation. PATH Kujo 1.5.0 and Go 1.27.1 hashes remained unchanged across suites. Review enabled with its existing four-round/five-minute bounds. One attempt, concurrency one, deadline 1,200,000ms. No review-off control; no new paid comparison model.

The standard prompts match the preceding batch after directory substitution. New prompts instantiate `benchmarks/kujo-quality-tasks.md` into fresh assigned directories, with explicit restrictions on reading prior artifacts or the verifier. This is an instruction-based holdout, not a security boundary. Receipt audit found no direct reads of prior benchmark answers/verifier and no `local_file_write` outside assigned case directories. One runtime probe used `npm exec -- node --version` and observed Node 26.7.0; it then checked direct Node 22.17.0. Independent Node verification explicitly used 22.17.0. No global package install is evidenced; the receipt does not establish whether npm used cache or network.

Local orchestration/evaluation scripts and raw executions remain under ignored `data/benchmark-runs/verification-scripts/` and `data/benchmark-runs/verifyglm*`. Timed command for each suite:

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-04-verifyglmN-KIND/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' --model glm-5.3-flash:cloud \
  --tool-preset local-dev --require-instance-role any \
  --title-prefix 'VERIFYGLMN-KIND ' --run-id verifyglmN-KIND \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

`N=1,2,3`; `KIND=standard,quality`. Credentials were loaded privately.

Verification after all timed suites:

- `python3 .../tests.py verifyglmN`: 12/12 generated suite invocations pass using fresh Go tests and Node 22.17.0.
- `python3 .../csv_probe.py verifyglmN`: fresh build and seven fixtures per round; defects detailed above. The initial evaluator filename `csv.py` shadowed Python's library in rounds 2/3; renamed evaluator and reran. No generated code changed.
- `python3 .../api.py verifyglm1 verifyglm2 verifyglm3`: real child-process restart/null checks pass; failed-write memory invariants fail in all three. Round 2's documented update method is PATCH; an initial evaluator PUT assumption was corrected before scoring. Children and evaluator fixtures cleaned.
- `python3 .../primes.py`: 46/48 fresh-source boundary invocations pass; round-2 Go at 0/1 fails and reduces strict acceptance. The final report assertions caught this discrepancy before publication; the provisional 18/18 acceptance statement was corrected.
- `python3 .../cli.py`: 3/3 fresh-build duplicate fixtures, repeats and missing-path errors pass, respecting each CLI's format/exit contract.
- `node scripts/verify-kujo-quality.js RUN_ROOT`: 27/31, 31/31, 24/31 on the original PATH runtime.
- Same verifier with `KUJO_REFERENCE_BIN` pointing to existing 1.7.0: 27/31, 31/31, 31/31. Round 3 with the 1.5.0 interpreter: 31/31. Artifact-only diagnostics, no new generation.
- Exact-integer discount oracle: 303,303 inputs, mismatches 0/0/314. Receipt timing medians match reports; regression-before-fix and timeout-retry sequences checked.
- Before/after hashes and modes of existing generated artifacts match. No manual repairs. `git diff --check` and report arithmetic/JSON checks pass.
- Post-run authenticated health: healthy, zero active streams, zero queued benchmark requests; review enabled. No restart or production-code changes were needed.

The application source suite was not rerun for this report-only change. Its preceding 601-pass/one-skip serial receipt remains historical evidence, not a new benchmark verification result.
