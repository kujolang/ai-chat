# GLM-5.3 Flash after engineering guidance: three rounds

**Strict acceptance: 6/6, 6/6, 5/6 — 17/18 (94.4%). No convincing overall
code-quality or independent-production-judgment improvement over the preceding
three rounds.** The third Kujo/Go task exceeded the unchanged 20-minute runner
deadline while repeating expensive timing trials. It was cancelled, not retried
or replaced. Saved source correctness does not turn that unfinished task into a
pass.

The previous batch was 5/6, 6/6, 6/6: also 17/18 and two fully accepted suites.
The failure moved from broken final package discovery to excessive workload
planning. Useful narrow improvements appeared, but unchecked accumulated totals
and failed-write state inconsistencies remain in all three new implementations.

[Machine-readable evidence](glm-quality-three-rounds-2026-10-03.json) ·
[Intervention and predeclared protocol](development-quality-intervention-2026-10-03.md) ·
[Previous corrected-context results](glm-context-three-rounds-2026-10-03.md)

## Full comparison

| Configuration / round | Accepted | Responses completed | Suite elapsed | Reported tokens | Tool receipts | Provider rounds |
|---|---:|---:|---:|---:|---:|---:|
| Original 65K — 1 | 5/6 | 5/6 | 8m 18.222s | 1,614,709 | 181 | 135 |
| Original 65K — 2 | 5/6 | 5/6 | 17m 22.505s | 1,315,515 | 164 | 111 |
| Original 65K — 3 | 5/6 | 6/6 | 7m 13.363s | 1,295,841 | 162 | 114 |
| Original 65K — 4 | 4/6 | 4/6 | 21m 11.551s | 3,277,177 | 350 | 248 |
| Corrected 1M — 1 | 5/6 | 6/6 | 12m 36.282s | 2,624,622 | 192 | 108 |
| Corrected 1M — 2 | 6/6 | 6/6 | 14m 22.724s | 5,493,813 | 215 | 164 |
| Corrected 1M — 3 | 6/6 | 6/6 | 13m 35.735s | 5,769,061 | 228 | 156 |
| Engineering guidance — 1 (overall 8) | **6/6** | 6/6 | 19m 58.734s | 3,758,321 | 175 | 119 |
| Engineering guidance — 2 (overall 9) | **6/6** | 6/6 | 15m 14.712s | 3,942,999 | 181 | 143 |
| Engineering guidance — 3 (overall 10) | **5/6** | 5/6 | 29m 7.678s | **7,802,304** | **247** | **204** |

| Measure | Previous three | New three |
|---|---:|---:|
| Accepted tasks | 17/18 (94.4%) | 17/18 (94.4%) |
| Fully accepted suites | 2/3 | 2/3 |
| Completed responses | 18/18 | 17/18 |
| Suite elapsed, total | 40m 34.741s | 64m 21.124s |
| Mean suite elapsed | 13m 31.580s | 21m 27.041s |
| Reported tokens, total | 13,887,496 | 15,503,624 |
| Reported tokens, mean | 4,629,165 | 5,167,875 |
| Model-authored passing tests/subtests | 109 | 140 |

Measured suite time increased **58.6%** and reported tokens **11.6%**. More tests
are not proof of better coverage or production quality. Shared-host load,
agent-chosen algorithms/runtime versions and a small repeated task set prevent
attributing these differences solely to the added guidance. There is no measured
speed, cost, or overall-quality improvement to claim.

GLM history now totals **53/60 strict acceptances (88.3%) over ten full rounds**,
with four fully accepted suites. DeepSeek results are separate and unchanged.
The original four-round token totals above retain their historical reporting;
they were not retrospectively reconciled in this session. The direct before/after
comparison uses the previous three fully completed runs and the new reconciled
journal totals.

### Accounting correction: do not use the raw runner total

The raw new-batch runner total is **9,701,873 tokens**, which omits the cancelled
case. Its run record has `usage: null`, zero provider rounds and zero tool calls
because the client deadline aborted before terminal SSE metadata arrived.

Execution `a2666197-caad-4fbb-98d8-d599aef1bf4f` retains **5,801,751 tokens**,
**120 provider rounds**, and **131 completed tool calls**; `usage_complete` is true.
There are 132 receipts for that case, including the last interrupted call. The
report uses **603 recorded receipts** across all runs, including that interrupted
call; completed-call accounting totals 602. Durable metadata, not a guess or a
retry, supplies the missing values. Raw runner artifacts are preserved unchanged.

`streamChat` in `scripts/run-benchmark-suite.js` requests cancellation on deadline
but does not reconcile metadata from the saved execution. This is an unresolved
benchmark-accounting defect, separate from generation quality. Token figures are
model-reported repeated input/output use, not unique context size or dollar cost.

## Controls and provenance

Starting checkout: clean `main`, `eb02c830fa51adf52213795a66e8b525419a4857`.
No production source, prompt, profile, configuration or generated-source repairs
were made during the experiment. No whole-task retries, model substitutions,
server restarts or discarded attempts. Eighteen fresh chats/work directories.

All runs used Watchdog / Ollama Cloud, `glm-5.3-flash:cloud`, local-dev tools,
6,000 requested output tokens, concurrency one, maximum one attempt and a
1,200,000ms per-response runner deadline. Prompts exactly match the previous batch
after directory-name normalization; original buggy discount fixtures were copied
before each round. All 18 saved executions contain the engineering guidance once
and retain the verified 1,048,576 context policy, with 1,042,576 input allowance.

Default Go 1.27.1 and Kujo 1.5.0 hashes were unchanged before/after every suite.
Round 2 chose a separate Kujo 1.7.0 release binary, whose hash was captured while
that round ran and matched independent review. It was not fingerprinted before
round 1, so no stronger provenance claim is made. Rounds 1/3 used the default
Kujo 1.5.0. Algorithms differ across rounds; their language timing ratios are
not a controlled runtime comparison. Independent builds and fault probes ran
only after all three timed suites finished.

File-tool write audits found no writes outside assigned case directories. This
is receipt-based evidence, not an OS sandbox guarantee. The API cleanup review
in round 3 identified older temporary directories by timestamp and left them
untouched. No sibling repository was modified.

## Per-task acceptance

| Task | Round 1 | Round 2 | Round 3 | Evidence |
|---|---|---|---|---|
| CSV program | Pass | Pass | Pass | Final tests/build; independently supplied valid and invalid rows |
| Kujo + Go | Pass | Pass | **Fail: deadline** | First two reports have genuine five-trial data and correct medians; third never finishes |
| Debug fixture | Pass | Pass | Pass | Failing regression run before fix, preserved interface, passing final tests |
| HTTP API | Pass | Pass | Pass | Model tests plus independent real-process restart preserving update/delete |
| Intentional timeout | Pass | Pass | Pass | Partial `started`, followed by exactly one successful longer run |
| Duplicate-file CLI | Pass | Pass | Pass | Final recursive Go tests, rebuilt binaries, exact hash/path/order fixtures |

All twelve independently rerun project test suites pass: **44, 41 and 55 passing
tests/subtests** per round. All three prime source pairs also pass 48 independent
boundary invocations (0, 1, 2, 3, 4, 10, 49, 1000 with each program's documented
inclusive/exclusive convention). The cancelled case's artifact checks are useful
partial evidence, not a completed benchmark deliverable.

Each CLI independently reports the correct five-file fixture: two duplicate
groups, four duplicate members, six wasted bytes, exact SHA-256 values and sorted
paths. Repeated output is identical; missing paths produce nonzero errors.
Round 1 left a fixture **file** at mode 000, explicitly described in its response.
Its final recursive tests still pass. The previous failure involved an unreadable
**directory** that broke Go package discovery. Keep this distinction: round 1
passes the unchanged acceptance gate but still has a cleanup-quality concern.
Rounds 2/3 restore their permission fixtures.

### Why round 3 timed out

The agent spent substantial work on runtime/syntax/JIT investigation and then
scaled its sieve to ten million inputs. The first such Kujo trial took
**232,124.708ms** and returned the correct 664,579 count. It continued repeating
that expensive workload after already gathering smaller-workload trials. The
runner's unchanged 20-minute deadline cancelled the active execution; there was
no completed final report. It then continued the remaining suite normally.

At cancellation, the saved request-size upper-bound estimate was 296,434 against
an input allowance of 1,042,576, with no context removals in that receipt. This was
not context exhaustion. The proximate cause was workload planning exceeding the
runner's budget, not a provider transport crash. The runner deadline is not
explicitly communicated to the model in the task prompt; exposing a remaining
budget is a possible future intervention, but changing it during these runs
would invalidate the matched comparison.

## Supplementary quality review

These probes are separate from the frozen task acceptance gates. Old artifacts
were not repaired and their original scores are not rewritten.

| Probe | Previous corrected-context batch | New batch |
|---|---|---|
| Reject NaN/Infinity amounts | 3/3 | 3/3 |
| Reject selected out-of-range/scaling-overflow amounts | Inconsistent | 3/3 |
| Detect accumulated-total overflow | **0/3** | **0/3** |
| Reject JSON null promptly | 2/3 (one hang) | **3/3** |
| Keep memory/disk consistent after failed write | **0/3** | **0/3** |
| Real-process restart preserves update/delete | 3/3 | 3/3 |
| Final recursive CLI tests pass | 2/3 | **3/3** |
| Supplementary small-integer discount rounding sweep | 0/3 | 1/3 |

Every new CSV accepts 9,500 individually valid `9999999999999.99` rows, silently
wraps the accumulated integer total, prints a negative amount and exits zero.
Round 2 even formats the negative fractional part incorrectly. Conversion range
checks alone did not protect aggregation, despite explicit guidance to do so.
The quoted-customer probes preserve `A,B` in these human-readable text reports;
none claims to emit CSV, so CSV escaping is not required of their output format.

For APIs, the reviewer created/updated/deleted records, terminated each server,
started a new process against the same temporary file, and checked persistence.
Then temporary file/directory permissions were made read-only to force a write
failure. This same mechanism was applied to all three previous and all three new
APIs. Every one returned 500 and stayed alive, but exposed two records in memory
while disk retained one. Permissions were restored and all owned children stopped.
Atomic file replacement did not make the in-memory mutation transactional.

An additional matched rounding sweep applied the implementations' adopted
nearest-cent/half-up behavior to cents 0..1000 and percentages 0..100 (101,101
inputs per implementation). All three prior fixtures and new rounds 1/3 disagree
with the exact small-integer oracle on 314 inputs; e.g. 5 cents discounted 90%
returns 0 instead of 1. New round 2 passes this sweep by subtracting integer
percent before dividing. The original README does not specify tie behavior, so
this is explicitly a supplementary numerical-policy check, not a new acceptance
gate or proof for arbitrarily large JavaScript numbers.

### Professional assessment

| Dimension | Previous | Now | Judgment |
|---|---:|---:|---|
| Overall development capability | 7/10 | **7/10** | Useful multi-language implementation and recovery; still inconsistent |
| Delivered code quality | 6.5/10 | **6.5/10** | Generally readable, useful tests; material defensive correctness gaps persist |
| Supervised usefulness | 8/10 | **8/10** | Productive for scoped prototypes and reviewable changes |
| Independent production judgment | 4/10 | **4/10** | Missed state invariants, overflow and cleanup; excessive benchmark scope |

These are professional judgments grounded in the evidence, not a formula based
on pass rate. The model remains useful as a supervised mid-level assistant, with
junior-level inconsistency in defensive programming and completion judgment.
There is no evidence here for unsupervised senior-level ownership. The prompt
intervention reached every execution but did not reliably translate its specific
risk guidance into implementation or tests. Narrow improvements should be kept;
an overall grade increase would overstate the results.

## Unresolved findings and follow-up boundaries

1. **AI Chat benchmark accounting:** failed/deadline cases can lose usage and work
   counts in runner summaries. Preserve request IDs and reconcile bounded journal
   metadata; mark unavailable data unknown, never zero. This session corrects the
   report, not production code.
2. **Budget-aware execution:** the agent overran the fixed runner deadline with
   avoidable extra trials. A future experiment could communicate remaining time
   and require a measured stopping criterion. Do not silently raise limits or
   rewrite this failed attempt as passed.
3. **Artifact quality:** another generic reminder is not proven sufficient.
   Future work should evaluate executable, task-relevant verification of numeric
   invariants and failure-state consistency, without injecting benchmark answers
   or claiming all possible defects can be automatically certified.
4. **Cross-repository Kujo runtime:** independently reproduced a wrong JIT result
   in the installed Kujo 1.7.0 artifact. From round-2 `02/`, `kujo run prime.kujo
   10000` returns `primes=1229`; the same binary with `run --jit` returns
   `primes=true`, both exit zero. Its diagnostic mentions `MakeClosure(0)` fallback.
   The agent correctly excluded this mode from its reported timings. Binary
   SHA-256: `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
   Source SHA-256: `d564180107ccde8a30d46e82b33b0af80c49afd5e19ef4d340d54e06942aaf9d`.
   First establish binary provenance against current Kujo source fixes; this does
   not prove the present source checkout has the same defect. No sibling edits.

SignalBox admitted only the two concrete unresolved tool/runtime findings:

- AI Chat: Capture `cap_4ea710e2-6a07-41ba-a3f3-daad66858555`, Signal
  `sig_23294619-dec1-4a14-a720-d5a983f312b7`.
- Kujo: Capture `cap_d7a8c84f-8540-4139-89c3-cc450f2ce75b`, Signal
  `sig_52114180-6423-45a0-be05-b2f451d77e26`.

Exact and concept retrieval passed for all four IDs. Searches found related JIT
performance/gating records, but no equivalent correctness reproduction or
benchmark-usage finding. Routine results and generated-prototype defects remain
in this report/Strata rather than creating duplicate or noisy Captures.

## Verification receipt and evidence locations

Three sequential invocations, N=1,2,3:

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-03-exhaustion-qualityglmN/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' --model glm-5.3-flash:cloud \
  --tool-preset local-dev --require-instance-role any \
  --title-prefix 'EXH20261003QUALITYGLMN ' \
  --run-id dev-2026-10-03-exhaustion-qualityglmN \
  --max-tokens 6000 --max-attempts 1 \
  --stream-timeout-ms 1200000 --concurrency 1
```

Raw runs/receipts and independent verification JSON are under ignored
`data/benchmark-runs/`, prefixed `qualityglm` or `exhaustion-qualityglm`.
Generated projects are in `data/dev-benchmark-2026-10-03-exhaustion-qualityglmN/`.
No credentials, private reasoning, raw response dumps or repaired artifacts are
committed. The JSON report contains selected metrics, synthetic-fixture probe
results, IDs and provenance only.

- `go test -json -count=1 ./...` in each CSV/CLI module, `node --test` in each
  debug/API project: all twelve suites pass, 140 tests/subtests. Logs referenced
  by `qualityglmN-independent-tests.json`.
- `go build -o <temporary-binary> .` for CSV/CLI; source-file builds for prime
  programs. Independent CSV, CLI and prime checks use fresh reviewer fixtures.
- 48 prime boundary invocations pass; three CLI hash/order/determinism checks
  pass. API process/restart/fault checks and discount sweep cover old and new
  artifacts consistently; their failures are retained as quality findings.
- Full AI Chat unit suite was not rerun: this session changes only benchmark
  reports. The intervention's 560-pass/one-platform-skip result is recorded in
  its own report, not presented as a new run here.
- Local reviewer scripts are retained under ignored
  `data/benchmark-runs/qualityglm-review-scripts/`; per-probe command arguments,
  outputs and source/runtimes are preserved with the corresponding evidence.
  Arithmetic, context/guidance assertions and claimed receipt-ID checks pass.
- Live authenticated `SMOKE_BASE_URL=http://127.0.0.1:4174 npm run smoke` passed;
  `/tmp/qualityglm-live-smoke.log`. Health reported zero active streams and zero
  active/queued benchmark requests after the suites.
- `git diff --check` and machine-readable report arithmetic checks passed.
