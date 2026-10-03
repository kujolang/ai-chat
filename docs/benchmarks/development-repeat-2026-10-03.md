# Development benchmark: unchanged-runtime repeat

Repeat run `dev-2026-10-03-exhaustion-f` independently verified **6/6**.
This is the second consecutive 6/6 on unchanged application code: twelve completed
task instances across E and F, without rerolls or manual repairs. That supports
repeatability on these six prompts; it does not establish universal reliability.

## Full milestone comparison

| Milestone | Verified completion | Rate | Elapsed | Reported tokens | Tool receipts |
|---|---:|---:|---:|---:|---:|
| First | 3/6 | 50% | 476.319 s | 814,711 | 187 |
| Second | 5/6 | 83.3% | 405.510 s | 942,912 | 208 |
| Third | 5/6 | 83.3% | 610.783 s | 1,771,713 | 300 |
| Previous final E | 6/6 | 100% | 965.052 s | 2,586,064 | 174 |
| Unchanged repeat F | **6/6** | **100%** | **393.980 s** | **2,912,002** | **198** |

| Task | First | Second | Third | E | F |
|---|---|---|---|---|---|
| Go CSV utility | Pass | Pass | Pass | Pass | Pass |
| Kujo/Go benchmark and complete trial report | Fail | Fail | Fail | Pass | Pass |
| Debug fixture | Pass | Pass | Pass | Pass | Pass |
| Persistent HTTP API | Fail | Pass | Pass | Pass | Pass |
| Intentional timeout recovery | Pass | Pass | Pass | Pass | Pass |
| Duplicate-file CLI | Fail | Pass | Pass | Pass | Pass |

The earlier engineering investigation also included failed attempts, including D's
5/6 immediately before the final recovery fix. They remain in the linked report;
they are not discarded to claim that every run has passed. Scores above are task
completion, not subjective code-quality ratings or an estimate of population accuracy.

F was 571.072 seconds shorter than E but used 325,938 more reported tokens and
24 more tool receipts. No optimization was introduced between them. The model
chose a smaller prime workload and different implementations/test suites; shorter
latency is not evidence that the harness became faster. Usage includes repeated
input across provider rounds, not unique context, billable cost or cache-adjusted
consumption. Cache details were not reported.

## Per-task comparison and independent verification

| Task | E elapsed / receipts | F elapsed / receipts | F independent result |
|---|---:|---:|---|
| CSV | 73.371 s / 21 | 31.331 s / 16 | 8 top-level Go tests, 2 subtests; fixture outputs verified |
| Kujo/Go | 570.504 s / 72 | 156.635 s / 77 | Matching boundary counts; all ten trials and medians checked |
| Debugging | 37.638 s / 16 | 13.705 s / 14 | 4 Node tests; failing-before/fixed-after receipts |
| HTTP API | 147.989 s / 23 | 58.602 s / 22 | 14 integration tests; independent real-process persistence restart |
| Timeout | 14.896 s / 8 | 15.436 s / 8 | Exactly one short timeout and one successful retry |
| CLI | 113.831 s / 34 | 109.023 s / 61 | 19 Go tests; two identical compiled JSON runs, actual file hashes checked |

Task durations exclude the runner's between-case overhead. Different generated
test counts do not by themselves rank quality.

### Go code quality

**Useful small programs, still prototypes.** F's CSV uses sorted output, explicit
row errors, non-finite checks, integer-cent accumulation and meaningful exit codes.
Its invalid fixture contains both empty and malformed amounts; those rows are
reported and skipped with exit 2 while valid totals remain. E aborted on invalid
input with exit 1. The prompt did not prescribe either policy, and both are explicit.

However, both parse amounts through float64 and lack overflow bounds. In F, an
independent `1e20` input returns exit 0 with `Alice,-92233720368547760.00`.
A quoted customer `A,B` is emitted as unescaped `A,B,1.00`, adding a CSV column.
`NaN`/`Inf` are rejected with exit 2. These financial/serialization weaknesses
persist across both successful runs; a 6/6 completion score does not mean they
are safe to deploy for financial processing.

The CLI is stronger evidence of practical Go work: streaming content hashes,
size-based prefiltering, deterministic group/path order, nested/empty file tests,
symlink exclusion and useful error behavior. Its nineteen tests pass. The final
fixture tree independently produces four groups, nine duplicate files and 62
reclaimable bytes, with actual SHA-256 hashes and sorted paths verified. Two JSON
runs are byte-identical. Exit 1 explicitly means duplicates found, not a failed
benchmark. Original receipts prove unreadable paths were exercised and permissions
restored.

The agent corrected two wrong ordering expectations in its own new tests. Review
confirms the prompt requires determinism, not a specific group order: sorting the
comparison helper and correcting slash-vs-letter lexical order are legitimate
expectation fixes. It did not remove the ordering/determinism checks. E's CLI
passed first time with twelve tests; F needed more work but completed correctly.

### Kujo and Go language assessment

**Able to finish working programs with execution feedback; Kujo fluency remains
uneven.** E's first syntax check passed. F consulted documentation and a runtime
example, then tried fifteen exploratory probe files. Seven probe commands failed:
undefined `now_ms`, `millis`, `unix_ms`, `clock`, `timestamp`, `number`, and invalid
`int(...)` syntax. It recovered to supported `time()`/`to_int()` and delivered
working equivalent trial-division programs. These are model discovery mistakes,
not seven AI Chat transport failures.

Independent probes at 0/1/2/3/4/49/1000 yield 0/0/1/2/2/15/168 in both programs.
Original receipts prove both return 9,592 at 100,000. After a separate warmup,
five in-program compute measurements are:

| Runtime | Five trials (ms) | Median compute | Median shell wall time |
|---|---|---:|---:|
| Kujo | 6552, 7074, 5629, 6842, 7245 | 6842 ms | 6900.189 ms |
| Go | 73, 45, 42, 84, 67 | 67 ms | 95.296 ms |

The separately recorded Go build took 1187.671 ms. The model calls this a “cold
cache” build without evidence that caches were cleared; that label is unsupported.
Its explanation that the first measured Go trial's wall-time spike came from
binary verification is also unverified. The timing values and arithmetic are
real; those causal explanations are not established.

E instead used 300,000 inputs and `/usr/bin/time -p` process wall times, with
medians 36.91 seconds and 0.31 seconds. F's 100,000-input internal timing cannot
be used as a direct speedup comparison against E. Kujo `time()` is wall-clock
milliseconds; Go uses elapsed timing. These small programs do not harden missing
arguments, enormous bounds or clock adjustment. The ratios describe these
implementations on this machine, not universal language performance.

### API, debugging and timeout behavior

F's API passes fourteen Node integration tests: CRUD, validation, malformed JSON,
status codes, HTTP behavior and closing/reopening the server against persisted data.
The generated CLI smoke test only checks process startup/health/cleanup. Independent
verification went further: create two tasks in one actual process, update one,
delete the other, terminate and reap that process, launch a new process with the
same data file, and confirm the updated task survives and the deleted one stays
missing. Both children were reaped. E's API had twenty-five passing tests and its
own process-restart smoke. Both are useful local JSON demos, not multi-writer
transaction systems. F uses synchronous whole-file persistence and mutates memory
before persistence, leaving production resource/rollback design work.

F's discount receipts show one passing and three failing tests before the minimal
percent/100 fix, then four passing tests afterward and independently. The documented
function/export contract is preserved. E had five passing tests; this remains a
tiny debugging fixture, not proof of large-repository maintenance ability.

The timeout script contains only two prints around a five-second timer. Exactly
one 1000ms request produced `started` and `local_shell_timeout` (1541.923ms measured
spawn-to-close), then exactly one 10000ms request exited 0 with `started`/`finished`
(5190.411ms). Deadline-to-close overhead means wall duration is not exactly the
requested timeout. There were no settings changes or hidden automatic replays.

## Reliability assessment

F finished all six in one attempt each, without terminal transport failures,
context-exhaustion errors, empty-final continuations or saved-result reads. API and
CLI each needed one bounded output-limit continuation and then completed tool work.
Neither triggered the additional post-limit review. All six report complete usage;
there were 112 provider rounds and two tool-input repairs.

Eleven tool receipts failed within otherwise completed tasks: two missing discovery
paths, two blocked file extensions, one read-before-overwrite guard, five missing
parent directories, and the one deliberately requested timeout. The agent corrected
its inputs or used the intended recovery path. These are distinct from unrecovered
app failures. The application retained evidence and returned actionable errors;
the tests do not show that the model always uses tools efficiently.

Overall: the previous 6/6 was reproduced on unchanged code. Both runs finish useful
work, with evidence-backed tests and commands. They also reproduce quality gaps
in financial input handling and unsupported reporting language. This is positive
repeatability evidence for these tasks, not a calibrated claim of Codex-level
quality, production readiness or success on unrelated prompts.

## Controls

Starting revision: `27174aa9b152d672db65cc25ff33e057c346dda3`, branch `main`, clean.
Runtime source is unchanged from the previous six-task success (`c7e001f`);
`27174aa` only records that investigation. No application, prompt, routing,
permission, timeout, model, output allowance, or context-setting changes were made.

Same Watchdog / Ollama Cloud profile, `deepseek-v4.1-flash:cloud`, 6,000 requested
output tokens, concurrency one, one attempt, and 1,200,000ms runner deadline.
Suite text is byte-identical to candidate E after replacing its workspace suffix
`exhaustion-e` with `exhaustion-f`. The discount fixture is freshly copied from the
original seed; other tasks start empty. No generated answer is manually repaired.

This repeat has one independent generation per case, not rerolls until success.
Prior benchmark source is forbidden by prompt; read scope is still not a hermetic
filesystem sandbox. Inspect receipts for source reuse. Independent program tests
run after the prime timing trials to avoid adding load to those measurements.

The previously verified application suite was 540 passed, one Linux-only skip,
zero failures. Application code has not changed, so that suite is not rerun merely
to grade these new generated artifacts. Live smoke and artifact tests are recorded
separately below.

## Evidence and reproduction

Previous full comparison, fixes and all adverse engineering trials:
[exhaustion investigation](development-exhaustion-2026-10-03.md).

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-03-exhaustion-f/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --title-prefix EXH20261003F \
  --run-id dev-2026-10-03-exhaustion-f \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

Raw run data and sanitized receipt exports remain under ignored
`data/benchmark-runs/`; generated source is under
`data/dev-benchmark-2026-10-03-exhaustion-f/`. No credentials or private reasoning
are included in this report.


## Verification receipt

- F `01`: `go test -json -count=1 ./...`, then `./orders testdata/orders.csv`
  (exit 0) and `./orders testdata/orders_invalid.csv` (expected exit 2).
- F `02`: `kujo run primes.kujo N` and `./primes N` at
  N=0,1,2,3,4,49,1000. Original five-trial values/build duration checked from receipts.
- F `03`: `node --test`, four passing tests.
- F `04`: `npm test`, fourteen passing tests; `node scripts/smoke-cli.js`, exit 0;
  independent Python HTTP/process-restart verifier, all assertions passed.
- F `05`: reviewed original two receipts and `sleep_print.js`; did not replay the
  intentional timeout for grading.
- F `06`: `go test -json -count=1 ./...`, nineteen passing top-level tests;
  `./dupefind -json fixtures` twice, both expected exit 1, identical output. Python
  SHA-256/size checks against each reported file passed.
- All file-tool writes target the assigned case directory. Inspected read/shell
  inputs show documentation/runtime discovery and no prior benchmark-answer reuse.
  This is an observed scope audit, not enforced read isolation.
- `npm run smoke` with existing authentication loaded privately against port 4174:
  health/providers/state/offline chat all HTTP 200, eleven providers. Receipt:
  `/tmp/exhaustion-repeat-smoke.log`.
- `git diff --check`: passed. No application changes, restart, dependencies,
  credentials, profiles, permission changes or sibling repository modifications.

Independent receipt manifest: `data/benchmark-runs/exhaustion-f-independent.json`;
additional process-restart evidence: `exhaustion-f-api-restart.json` in the same
directory. Per-case logs share the `exhaustion-f-` prefix.

Portable comparison, task IDs, token data and verification receipts:
[`development-repeat-2026-10-03.json`](development-repeat-2026-10-03.json).
