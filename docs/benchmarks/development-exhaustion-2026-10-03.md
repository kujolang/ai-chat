# Development benchmark: exhaustion investigation

Final fresh candidate **E independently verified 6/6** on runtime `c7e001f`.
All six tasks completed in one run; generated artifacts were not manually repaired.
The live server runs the verified fixes and passes authenticated smoke checks.

Earlier milestones were **3/6 → 5/6 → 5/6**; this milestone reaches **6/6**.
Go utilities and Kujo programs now complete with real execution evidence. They
remain prototypes: extra CSV probes expose overflow/escaping weaknesses, and
benchmark prose still overstates “cold” compilation. Completion is stronger than
before, but it is not a blanket code-quality or unattended-reliability guarantee.

## Comparison baseline

| Engineering milestone | Independently verified completion | Elapsed | Reported tokens | Tool receipts |
|---|---:|---:|---:|---:|
| Round 1: original | 3/6 | 476.319 s | 814,711 | 187 |
| Round 2: previous upgrade | 5/6 | 405.510 s | 942,912 | 208 |
| Round 3: previous final | 5/6 | 610.783 s | 1,771,713 | 300 |
| Round 4: final E | **6/6** | 965.052 s | 2,586,064 | 174 |

| Task | Round 1 | Round 2 | Round 3 | Round 4 E |
|---|---|---|---|---|
| CSV utility | Pass | Pass | Pass | Pass |
| Kujo/Go programs and five-trial report | Fail | Fail | Fail | **Pass** |
| Debug fixture | Pass | Pass | Pass | Pass |
| Persistent HTTP API | Fail | Pass | Pass | Pass |
| Intentional timeout/retry | Pass | Pass | Pass | Pass |
| Duplicate-file CLI | Fail | Pass | Pass | Pass |

These scores measure task completion, not a subjective code-quality rating. The
prior evidence and intermediate failures remain in
[the three-round report](development-round3-2026-10-02.md). No cases are stitched
across runs, and transport success alone is insufficient.

## Verified causes and changes

Starting revision: `45c1d767f6df66f4106646a5f2d5e55cd5cdb501` on `main`.

1. Context retained obsolete standalone planning while discarding execution facts.
   `ed03012` retires older standalone reasoning first, gives native receipts durable
   identities, migrates misleading legacy “output omitted” envelopes, and folds
   complete saved-result reads back into the original action. Partial/mismatched
   results remain separate. Long command excerpts retain their beginning and end.
2. Repeated identical file snapshots occupied context while recent failures lost
   their outcomes. `70b765d` folds identical historical snapshots by a fingerprint
   of the read request, content, pagination and stable metadata. Every requested
   live read still runs and has a distinct durable journal receipt. Old read
   excerpts and input copies give way before recent execution results.
3. The local Watchdog/DeepSeek route used the conservative 65,536 allowance despite
   its served model advertising 1,048,576 tokens. The estimator counts UTF-8 bytes
   plus framing, so it was especially restrictive. A route/model-specific verified
   configuration correction is evaluated separately; it is not an increased
   timeout, output cap, default for unknown models, or weaker correctness gate.
4. `bf09588`: shell results lacked elapsed durations visible to the model. Monotonic
   `duration_ms` now records spawn-to-close elapsed time, including startup and
   output collection. Timeout receipts retain duration and working directory.
   This is not CPU time or an internal algorithm benchmark.

5. `00da58f`: `local_shell` silently shortened argument strings to 1,000 code
   units. In case 4 of run C, a 1,924-character inline script was executed as
   1,000 characters and failed. Oversized/NUL arguments now fail before spawn
   with known non-execution and a file-based-script hint. The schema states the
   existing limits. Valid whitespace/empty arguments are preserved; executable
   paths are no longer truncated or internally whitespace-normalized.

Full source outcomes remain in the encrypted execution journal. Context projection
never reruns a write/shell command or treats partial evidence as complete.

## Context evidence

On 2026-10-03, unauthenticated `POST https://ollama.com/api/show` with
`{"model":"deepseek-v4.1-flash:cloud"}` returned architecture `deepseek_v41` and
`model_info.deepseek_v41.context_length = 1048576`. Numeric evidence is saved locally
in `data/benchmark-runs/exhaustion-context-source.json`. The
[official Ollama catalog](https://ollama.com/library/deepseek-v4.1-flash/tags)
also lists a 1M context window. This applies to that cloud route, not arbitrary
local allocations or similarly named models at other providers.

The local override uses `watchdog:deepseek-v4.1-flash:cloud`, because context lookup
uses the profile provider ID. Existing Hermes metadata and unrelated settings are
preserved. Operators should reverify this volatile provider fact when changing
models/routes; explicit overrides take precedence over dated metadata.

A deterministic 70-identical-snapshot fixture shrank from 121,081 to 2,579 serialized
bytes while retaining every read identity and one complete outcome. This is a
synthetic context measurement, not a production token or latency claim.

## Experiment controls and limitations

All new runs use Watchdog / Ollama Cloud, `deepseek-v4.1-flash:cloud`, requested
6,000 output tokens, one attempt, concurrency one, and a 20-minute runner deadline.
The original six tasks and discount seed are unchanged except fresh work-directory
paths and a stricter instruction against reading previous benchmark answers.
The workspace is not a hermetic read sandbox; receipts are audited for contamination.
No human edits generated solutions to make them pass. Independent verification
occurs after timing trials, not concurrently with prime measurements.

One live trial per revision cannot establish general model reliability or a causal
speedup. Cumulative provider tokens include repeated input, not unique context or
necessarily billed tokens. A clean result will establish completion of these six
specific tasks, not guarantee all future agent requests or production-quality code.


## Diagnostic trail (all attempts retained)

| Candidate | Runtime | Context limit | Scope | Verified | Elapsed | Reported tokens | Receipts |
|---|---|---:|---|---:|---:|---:|---:|
| A | `ed03012` | 65,536 | Kujo/Go only | 0/1 | 404.329 s | 1,878,647 | 191 |
| B | `70b765d` | 65,536 | All six | 5/6 | 982.155 s | 2,898,841 | 328 |
| C | `bf09588` | 1,048,576 | All six | 6/6 | 785.776 s | 4,148,887 | 217 |
| D | `00da58f` | 1,048,576 | All six | 5/6 | 501.395 s | 2,731,973 | 152 |
| E | `c7e001f` | 1,048,576 | All six | **6/6** | 965.052 s | 2,586,064 | 174 |

Run IDs are `dev-2026-10-03-exhaustion-<lowercase candidate>`.
A was manually stopped after 100 file reads and no useful progress. B's API case
was manually stopped after 54 file reads with a remaining failing validation test;
its independent rerun confirmed four passes and one failure. Cancellation is a
failure, not a pass or an excluded sample. Aborted provider rounds may lack final
usage, so diagnostic token totals are available reported usage, not guaranteed billing.

B completed Kujo/Go with real matching counts and five trials per program. Its
report lacked a measured compile duration and mislabeled the working directory
for one documented command. These reporting weaknesses remain part of its quality
assessment. C has actual compile durations and correct command working directories.

C's six executions report complete usage. No saved-result rereads occurred. The
largest final per-case input estimate was 218,017 bytes plus accounted framing;
no strict context compaction was needed in those final provider rounds. This
supports the diagnosis of unnecessary context pressure, but different generated
programs/workloads and model variation prevent isolating one change's causal effect.

C used 217 receipts versus round 3's 300, but 4,148,887 reported tokens versus
1,771,713 and 785.776 seconds versus 610.783. Retaining evidence improved completion
in this trial at a higher reported context cost. There is no efficiency-win claim.

## Independent quality assessment: first 6/6 run

- CSV: six Go tests pass. Valid and malformed fixtures behave as reported; empty
  amounts are explicitly skipped. Additional probing still accepts `NaN`/`Inf`
  and prints non-finite totals with exit 0. This is a working demonstration, not
  production financial processing. Round B's integer-cents implementation was
  stronger on decimal precision; a higher completion score does not imply every
  generated program improved.
- Kujo/Go: both implement an inclusive Eratosthenes sieve. The agent consulted
  documentation, fixed a builtin-name collision, replaced repeated array growth,
  and accommodated the sequence generator limit. Independent probes at
  0/1/2/3/4/49/1000 return 0/0/1/2/2/15/168 in both languages. Receipts also prove
  equality at 100000 and 1000000. This shows usable Kujo development and recovery,
  but initial syntax/performance mistakes show that it is not effortlessly fluent.
- At 1000000, the five Kujo compute timings are 4199397, 4198540, 4643204, 4429194,
  4518330 microseconds; median 4429194. The five Go compute timings are 3103, 3146,
  3167, 3134, 4267; median 3146. These compare these implementations and execution
  modes, not universal language speed. Neither is process startup time.
- Go builds measured 982.313 ms and 127.263 ms. The generated report calls the
  first “cold,” but caches were not cleared or proven cold. Treat these as initial
  build and rebuild durations only. Independent verification uses original receipts
  for timing, not later reruns under different conditions.
- Debugging: five Node tests pass. Receipts demonstrate failing tests before the
  minimal percent/100 fix and preserve the documented export contract.
- API: 29 passing Node tests (including parent tests), plus an independently rerun
  child-process smoke test. CRUD, invalid input, malformed JSON, persistence after
  restart, deletion and monotonic IDs are exercised. The model found and fixed ID
  reuse after restart. JSON-file storage is still a local demo, not a verified
  multi-process transaction system.
- Timeout: exactly one 1000ms run preserves `started`, followed by exactly one
  10000ms run returning `started`/`finished` and exit 0. No setting change or hidden
  automatic replay was used.
- CLI: 15 Go tests pass. Two independent compiled runs return identical JSON and
  four groups in the final fixture tree. Empty/nested files and unreadable file
  and directory handling were exercised; permissions were restored.

The agent is capable of useful Go utilities and small Kujo programs when execution
feedback remains available. Tests and evidence review remain essential. A 6/6
completion score is not a claim of flawless reporting, robust financial validation,
or production readiness.

## Confirmation failure and bounded recovery

D's API case (`d1b1037f-82ac-4150-bf19-7baec523b309`) returned a successful
transport stop after one output-limit continuation, but created no API files.
Its final reply announced that it was writing the project. The six receipts were
only discovery/runtime checks. This is a task failure regardless of the runner's
six successful HTTP/SSE completions.

`ba24ab2` now gives that specific protocol state one completion review per
execution: tools have executed, output-limit recovery is pending, and the next
stop has text but no intervening tool progress. The model must compare the original
request with retained evidence, finish remaining work, or identify its blocker.
The review is checkpointed across resume. It does not classify arbitrary prose,
automatically replay tools, require side effects, or increase the existing two
output-limit/two empty-final recovery caps. Six regression scenarios cover both
provider transports, legitimate blocking, resuming tool work and bounded review.
This improves recovery; it does not prove that every future final answer is true.

D's other five tasks independently pass. CSV uses integer cents and rejects
non-finite values; its 10 Go tests and the discount's five Node tests pass. CLI's
13 Go tests pass with two stable duplicate groups. Prime boundary probes match in
both languages; five measured trials at 1,000,000 have Kujo median 8,735,626 us and
Go median 5,145 us. Different implementations/workload details make these variation
evidence, not proof of a runtime regression from C.

`c7e001f` fixes a real timeout-cleanup exception exposed by the full suite: a redundant group
SIGKILL after child close returned EPERM and escaped the event handler. Successful
force-kill is now tracked rather than repeated; signal failures become structured,
non-retryable `local_shell_termination_failed` errors with partial output and no
claim that the process is terminated. Regression tests cover denied TERM/KILL;
the real SIGTERM-resistant child-tree timeout test remains enabled.

## Verification and compatibility

All commands use Node v22.17.0. Starting full suite: `npm test`, 523 passed,
one skipped, zero failures (`/tmp/exhaustion-baseline-tests.log`). After the
final recovery/termination changes: `npm test`, **540 passed, one skipped,
zero failures**, 84.883 seconds (`/tmp/exhaustion-final-full.log`). This includes
actual subprocess-tree termination and both streaming-provider recovery protocols.
The preceding full-suite failure is retained in `/tmp/exhaustion-review-full.log`;
it prompted the termination fix, not a disabled assertion or timeout increase.

Focused verification:

```sh
node --test tests/local-runtime.test.js
node --test --test-name-pattern='post-limit|output-limit continuation|reasoning replay|native Ollama recovery' tests/server-routes.test.js
git diff --check
```

These passed: 42 local-runtime cases and 16 targeted route cases. Detailed logs:
`/tmp/exhaustion-termination-tests.log` and `/tmp/exhaustion-review-tests.log`.
Full suites after the earlier three changes passed as well; their receipts are
`/tmp/exhaustion-facts-full.log`, `/tmp/exhaustion-read-full.log`,
`/tmp/exhaustion-duration-full.log`, and `/tmp/exhaustion-argument-full.log`.

The live benchmark invocation for final candidate E is:

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-03-exhaustion-e/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --title-prefix EXH20261003E \
  --run-id dev-2026-10-03-exhaustion-e \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

Substitute the candidate suffix for earlier runs; A used only original test 2.
Canonical prompts remain in `benchmarks/development-tasks.md`. Ignored run JSON,
per-case sanitized receipts and independent-verification logs reside under
`data/benchmark-runs/`; generated workspaces remain under
`data/dev-benchmark-2026-10-03-exhaustion-<candidate>/`. No generated program was
patched by the reviewer. Raw reasoning/credentials are excluded from this report.

Runtime changes: `lib/context-budget.js`, new `lib/receipt-context.js`,
`lib/receipt-outcome.js`, `lib/local-runtime.js`, `lib/tool-runtime.js`,
`lib/server-runtime.js`; behavioral regression coverage is in their existing
`tests/` suites. Contracts and runtime setup documentation reflect the additions.
No new dependencies, public CLI changes, database migrations, profile deletions,
credential changes or permission relaxation were required. SSE/checkpoint metrics
and shell elapsed durations are additive. Invalid oversized shell arguments now
explicitly fail rather than silently executing corrupted input; valid arguments
preserve their original bytes/spacing. Termination failure is an explicit error,
not a claim of completed cleanup. Existing context-override configuration was used
for one verified local route. No sibling repository modification is required.

Remaining limitations: this is a small live sample with variable model behavior;
full task grading remains an independent review, not a semantic guarantee made by
the streaming harness. Prior answer artifacts are forbidden by prompt but not
filesystem-isolated. Generated financial/API prototypes need production review.
Those limitations are not weakened or hidden to reach a six-task score.

## Final candidate E: artifact review

Tested runtime: `c7e001f` (includes recovery commit `ba24ab2`).

- **Go CSV:** ten top-level tests and 14 subtests pass independently. The model's
  report says eleven top-level tests; the actual test event count is ten. Valid
  fixture output matches, while empty/malformed amounts exit 1. Non-finite input
  is rejected, improving on C. However, an extra `1e20` probe overflows conversion
  and produces a malformed negative total with exit 0; quoted customer `A,B` is
  printed without CSV escaping. It accumulates integer cents but still parses
  through float64. This is a useful small utility, not safe financial software.
- **Kujo and Go:** the agent read actual language/standard-library documentation,
  wrote equivalent single-file trial-division programs, and passed its first
  Kujo syntax check and Go build. Independently tested bounds
  0/1/2/3/4/49/1000 give 0/0/1/2/2/15/168 in both programs. Execution receipts show
  matching 9,592 at 100,000 and 25,997 at 300,000. The programs implement the same
  inclusive bound and algorithm. They are deliberately small benchmark programs;
  missing CLI arguments and huge integer bounds are not hardened.
- **Real measurements:** after a separate warmup at 300,000, five Kujo wall times
  are 39.13, 38.17, 36.44, 36.50, 36.91 seconds (median **36.91 s**). Five Go times
  are 0.33, 0.31, 0.30, 0.31, 0.33 (median **0.31 s**). These are `/usr/bin/time -p`
  process wall times, including startup; unlike C, they are not internal compute
  microseconds. Startup was not separately subtracted, so the model's claim that
  both are fully compute-bound is stronger than the evidence. The approximately
  119x ratio describes these two implementations on this machine only.
- **Build:** the original Go build receipt records **753.257 ms**. The model again
  labels it “cold” without clearing or verifying caches; this report corrects
  that to initial build time. All ten timing values and the median calculation
  are verified from receipts, not copied unquestioningly from its prose.
- **Debugging:** five independent Node tests pass. Receipts show one pass/four
  failures before the percent/100 fix and five passes after; only the tiny
  implementation and its new regression test changed.

- **API:** 25 independent Node tests pass, including actual child-process restart
  after create/update/delete. A second smoke run's JSON receipt is independently
  checked: create 201, malformed/invalid 400, missing update 404, deletion 204,
  one persisted task after restart and zero after deletion. Only built-in modules
  are used. This is a single-process JSON store with serialized writes and atomic
  rename, not verified multi-process durability; memory is changed before a write
  completes, so storage-failure rollback needs further production design.
- **Timeout:** exactly one 1000ms request returned `started` and the structured
  timeout (elapsed 1023.962ms); exactly one 10000ms retry returned exit 0 with
  `started`/`finished` (elapsed 5359.019ms). The script contains no file writes or
  subprocesses. No settings or command limits changed to make it pass.

- **CLI:** 12 independent Go tests pass. Two compiled JSON runs are identical:
  eight scanned files, two duplicate groups (four equal nonempty files and two
  empty files), no errors. Original receipts prove unreadable/missing/non-directory
  error handling and permission restoration. Tests include unreadable directories,
  nested files, deterministic ordering, filters and JSON output.

E used 174 receipts and 97 provider rounds, with one input repair and complete
reported usage for all six tasks. No saved-result reads occurred. API and CLI
needed one output-limit continuation each and then performed tool work; no
post-limit completion review was triggered in E. That added review is verified by
deterministic regressions reproducing D's failure state, not falsely credited as
an observed live rescue in E. There were no empty-final continuations.

All five candidates in this investigation consumed **14,244,412 reported tokens**,
including failed/cancelled work. E took longer than round 3, largely including its
chosen repeated ~37-second Kujo trials; the algorithms and measurement methods
changed, so total latency cannot isolate harness performance. E retained more
context and used more reported tokens than round 3 while making fewer tool calls.
No universal speedup, token saving, or statistical reliability percentage is claimed.

Machine-readable case scores, timings, usage, execution IDs and failed attempts:
[`development-exhaustion-2026-10-03.json`](development-exhaustion-2026-10-03.json).

Final independent commands, run in E's numbered directories:

- `01`: `go test -json -count=1 ./...`; compiled `./orders` against each fixture.
- `02`: `kujo run prime_count.kujo N` and `./prime_count_go N` for
  N=0,1,2,3,4,49,1000. Larger trial counts/timings verified from original receipts.
- `03`: `node --test`.
- `04`: `npm test`; `node scripts/smoke.js`, with its returned status/persistence
  fields independently asserted rather than accepting exit 0 alone.
- `05`: checked exact two original command receipts and reviewed `wait.js`.
- `06`: `go test -json -count=1 ./...`; `bin/dupfinder -json fixtures` twice.

Evidence manifest: `data/benchmark-runs/exhaustion-e-independent.json`; per-case
logs share that prefix. Scope audit found all file-tool writes within their
assigned directories and no prior benchmark-answer reads in inspected inputs.
Read-only filename/runtime discovery and language documentation were used outside
those directories. This is an observed audit, not an enforced isolation guarantee.

Final `npm run smoke` against port 4174 (existing authentication loaded privately)
passed health/providers/state/offline chat, all HTTP 200; eleven provider profiles
remain available. Receipt: `/tmp/exhaustion-final-smoke.log`. `git diff --check`
passed. Runtime changes are committed in six focused commits; this report and its
sanitized comparison data are committed separately. No sibling changes are needed.
