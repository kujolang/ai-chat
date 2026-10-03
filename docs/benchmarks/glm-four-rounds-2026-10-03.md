# GLM-5.3 Flash: four development benchmark rounds

**19/24 tasks passed (79.2%) across four rounds. No round passed all six.**
The three requested additional runs are complete, with no retries or repairs by
the reviewer. The familiar tasks were mostly useful; Kujo failed in every round,
and the fourth round regressed its duplicate-file CLI after initially passing
its own tests. This is not evidence of reliable unattended completion.

## Four-round comparison

| Round | Independently accepted | Transport completed | Suite elapsed | Reported tokens | Tool receipts | Provider rounds |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 5/6 | 5/6 | 8m 18.222s | 1,614,709 | 181 | 135 |
| 2 | 5/6 | 5/6 | 17m 22.505s | 1,315,515 | 164 | 111 |
| 3 | 5/6 | 6/6 | 7m 13.363s | 1,295,841 | 162 | 114 |
| 4 | 4/6 | 4/6 | 21m 11.551s | 3,277,177 | 350 | 248 |
| **Total** | **19/24** | **20/24** | **54m 5.641s** | **7,503,242** | **857** | **608** |

Suite elapsed includes runner overhead; token totals sum provider-reported usage
across requests, including repeatedly supplied context. They are not unique
prompt sizes or dollar costs. No whole-task retry occurred. Token usage and time
vary substantially; round 4's host toolchain change also limits timing inference.

| Task | R1 | R2 | R3 | R4 | Total |
|---|---|---|---|---|---:|
| CSV program | Pass | Pass | Pass | Pass | 4/4 |
| Kujo + Go prime benchmark | Fail | Fail | Fail | Fail | 0/4 |
| Debug unfamiliar fixture | Pass | Pass | Pass | Pass | 4/4 |
| HTTP API + persistence | Pass | Pass | Pass | Pass | 4/4 |
| Intentional timeout recovery | Pass | Pass | Pass | Pass | 4/4 |
| Duplicate-file CLI | Pass | Pass | Pass | Fail | 3/4 |

The common Go/Node tasks passed **19/20**. The unfamiliar-language benchmark
passed **0/4**. Round 3's transport-only score overstates its completed work.
These are repeated versions of six tasks, not 24 independent measures of general
developer ability. Four rounds cannot establish a universal success probability.
[Sanitized machine-readable results](glm-four-rounds-2026-10-03.json).

## Frozen controls

Starting checkout: `67de0815f1bdf7a8a796beaad41ba3da3e47d89e`, clean main;
production source remains `c7e001f`. These three additional suites deliberately
retain round 1's settings: Watchdog / Ollama Cloud, `glm-5.3-flash:cloud`,
6,000 requested output tokens, concurrency one, one whole-task attempt and a
1,200,000ms per-response runner deadline. The six original prompts differ only
in assigned output-directory names; task 03 receives the original buggy seed.
No extra Kujo guide, manual artifact repairs, model/profile changes, runtime
changes, application edits or server restart. Runs are sequential and adverse
outcomes stay in the comparison.

The current GLM app context policy remains the 65,536 conservative default. Its
provider advertises 1,048,576, and DeepSeek's recent successful suites used an
explicit 1,048,576 allowance. Therefore these are matched GLM repeats, not a
context-matched GLM-versus-DeepSeek comparison. A later corrected-configuration
experiment must remain separate from these four baseline rounds.

Raw evidence: `data/benchmark-runs/dev-2026-10-03-exhaustion-glm{1,2,3,4}.json`
and per-case exported execution receipts. Generated artifacts are in corresponding
`data/dev-benchmark-2026-10-03-exhaustion-glm*/` directories. Prior-answer reads
are forbidden by prompt and audited in receipts; this is not a hermetic sandbox.
Only sanitized metrics and findings are committed. No credentials or private
reasoning are included.

[Round 1 full assessment](glm-5.3-flash-2026-10-03.md).

## Grading and independent checks

A task passes only when its requested artifacts and behavior are demonstrated.
An HTTP stream ending successfully is insufficient. Extra adversarial probes
are reported separately from the original task rubric; they are not silently
added as new pass criteria. Generated test counts include Node subtests and are
not a coverage measure. Reviewer verification does not repair model artifacts.

Round 2: 62 generated tests independently passed (CSV 5, debug 8, API 38,
CLI 11). The API's smoke script actually spawns, stops and restarts its process.
The CLI produced identical output twice, with independently checked SHA-256
hashes and paths. Its restored-permission fixture has eight files, two duplicate
groups, five duplicate files and 34 wasted bytes. The intentional timeout
captured `started` at 1,022.877ms; its single long retry completed at 5,151.651ms.
An earlier incorrect script path failed before execution and was corrected.

Round 3: 40 generated tests independently passed (CSV 6, debug 7, API 17,
CLI 10). A separate reviewer process-level API check verified both persisted
updates and deletions across actual server termination/restart. CLI output was
identical twice, with verified hashes and paths: six files and two duplicate
groups after permissions were restored. Its intentional timeout captured
`started` at 1,022.783ms and the single long retry completed at 5,197.909ms.
Both debugging tasks demonstrated failing regression tests before fixing the
percentage calculation; round 2 also checked rounding behavior.

### Kujo failure evidence

- **Round 1:** 91 tool calls and 68 provider rounds; repeated documentation reads,
  then an unadvertised `tool_result_ref_read` call. No prime programs delivered.
- **Round 2:** Programs were created and small counts agreed. An oversized Kujo
  trial hit its explicitly requested 300-second command timeout. After revising
  workload handling, the agent ran a stale Go binary without rebuilding it.
  It eventually hit `output_continuation_limit`; no five-trial comparison or
  medians were delivered. This is not an unavailable runtime or permission denial.
- **Round 3:** Both programs counted 168 primes below 1,000. The journal records
  Kujo returning 17,984 below 200,000, but no corresponding Go invocation or
  five-trial series. The response stopped normally and included receipt-shaped
  claims unsupported by the journal: `call_0b3f4v1z` (Go version),
  `call_9d8f2b1f` (build in 812.3ms), and `call_9y3jv8n3` (Go 200,000 run).
  None of those IDs exists among its 37 receipts. The actual build took
  1,821.424ms. These are unsupported response claims, not executed tools.
  Its last context estimate was 59,234 against a 59,536 input allowance.
  Context pressure is a plausible contributor, not a demonstrated sole cause.

### Quality beyond task completion

Passing basic requirements does not make these production-ready implementations.
Round 2's CSV rejects NaN/Infinity but accepts an overflowing amount such as
`1e20` and prints an invalid negative total. Round 3 accepts NaN/Infinity and
prints non-finite totals. Both write customer names without CSV escaping:
`A,B` becomes an extra output column. Round 1 also mishandled non-finite and
out-of-range amounts. These independent probes remain separate from baseline
acceptance, and show recurring gaps in numeric and serialization boundaries.

The APIs implement useful CRUD, validation and persistence for the requested
prototype. Round 1's additional forced persistence failure crashed its process;
round 2 mutates in-memory state before asynchronous persistence, while round 3
uses synchronous persistence. We have not proved concurrent-write or disk-failure
correctness for rounds 2–3. The CLI implementations provide substantially better
permission/error and determinism coverage. Round 3 corrected a real directory
traversal bug and then corrected a test that incorrectly expected unique files
in a duplicates-only report; the final test still asserts the readable sibling
was counted and the inaccessible child was excluded.

### Environment limitation discovered during round 4

The application, profile and prompts were held fixed, but the host was not
hermetic. Round 4 CSV first observed Go 1.25.3, then repeated `spawn go ENOENT`
and `spawn gofmt ENOENT`. It recovered with explicit
`/usr/local/Cellar/go/1.25.3/bin/` binaries and completed its tests. During review,
`/usr/local/bin/go` was temporarily absent and later returned Go 1.27.1. This
benchmark session did not install, upgrade or relink Go. The origin of the host
change is unverified. Round 4 latency is consequently confounded by an external
toolchain/PATH transition; it is not a clean isolated repeat for timing claims.
The artifact and journal results still count, with that qualification. Round 3
reviewer CLI tests used the existing 1.25.3 Cellar binary explicitly. A brief
reviewer CLI test overlapped round 4's documentation/probe phase; no completed
prime timing series is inferred from this shared-host run.

Round 4 Kujo failed explicitly with `context_budget_exceeded`: “Execution
receipts cannot fit safely in the remaining model context.” It used 115 tool
calls, 70 provider rounds and 1,012,026 reported tokens over 608,416ms. Its last
program used `repeat(1, n)` although the installed runtime required a string;
the invocation returned exit 4. Documentation/probe work never became the
requested verified equivalent programs and timing series. Several probes were
also oversized for an interpreted runtime. This supports a concrete context
configuration problem plus inefficient task execution, rather than a blanket
claim that all failures were timeouts or that the model cannot learn Kujo.

Round 4's CSV independently rejects NaN, Infinity and `1e20`, improving on the
previous artifacts. Its TSV output also preserves comma-containing names. It
still silently accepts the wrong header and overflows accumulated integer cents:
eleven individually accepted `9e15` amounts produced a negative total with
exit 0. Its fixture exits 1 intentionally to report skipped invalid rows; valid
totals are correct. The API passes independent integration and actual process
restart checks, including preserved updates/deletions. Its generated smoke
script also passes. An accidental bare `node` tool call consumed 60,005ms before
timing out; supplying `smoke.js` then succeeded. That avoidable delay was a tool
argument mistake, not slow HTTP work or a blocked permission.

The round 4 timeout task correctly captured `started` at 1,003.604ms and ran its
single long retry successfully in 5,112.583ms. This is expected timeout recovery,
not a benchmark failure.


## Round 4 CLI regression

The journal records successful tests and a built CLI before later edits changed
its callers to a different, nonexistent API. The final tests refer to undefined
`ScanOptions` and expect three return values from `Scan`, which returns four.
The final independent `go test -json -count=1 ./...` fails to compile under both
installed Go 1.25.3 and 1.27.1. An earlier binary is not evidence that the final
source/tests are valid. The attempt ended with `context_budget_exceeded` after
99 calls, 86 provider rounds and 1,155,386 reported tokens. This is a real model
editing regression plus a context termination, not merely an unfamiliar Kujo
language problem or the host's Go version change.

Round 4 has 12 independently passing generated tests (CSV 6, debugging 5, API 1
large integration test), plus two actual process-restart checks. Its failed CLI
is retained without manual repair. Across all four rounds, 160 generated tests
passed independent runs, but differing test granularity makes that count unsuitable
for quality ranking.

## Assessment and next experiment

This configuration produces useful supervised development work, especially
small Go/Node programs, bug reproduction and ordinary API flows. It does not
merit a dependable autonomous or senior-level assessment: it repeatedly fails
completion/evidence requirements and can undo working code. Earlier successful
tests must not override the final artifact state. Numeric boundaries, storage
failure handling and final report grounding still require review.

Recent DeepSeek E/F/G suites accepted 18/18 versus GLM's 19/24 here. However,
DeepSeek had a 1,048,576-token app allowance and GLM only 65,536, and round 4
experienced host changes. This is an operational configuration comparison, not
proof of intrinsic model superiority. Prior DeepSeek totals remain 73/94 across
19 runs (15 full, four targeted); GLM is a separate four-run denominator.

The next useful experiment is a separately labeled GLM run with verified model
context metadata, an unchanged compiler/runtime image and the same rubric.
Then isolate the effect of a compact, correct Kujo documentation guide in a
separate paired comparison. Preserve these four baseline results. Do not silently
increase limits midway through a repeat, invent an additional successful run,
or repair generated artifacts to improve the score. No such configuration or
production changes were made in this task.

## Verification receipt and provenance

- Benchmark runner, three executions: `node scripts/run-benchmark-suite.js
  --tests data/dev-benchmark-2026-10-03-exhaustion-glmN/suite.md
  --provider-profile "Watchdog / Ollama Cloud" --model glm-5.3-flash:cloud
  --tool-preset local-dev --require-instance-role any
  --title-prefix EXH20261003GLMN --run-id dev-2026-10-03-exhaustion-glmN
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1`,
  with N=2,3,4 (actual per-run IDs/timestamps in JSON). Authentication loaded
  privately from the existing environment.
- All four prompt sets compare identically after normalizing output roots.
  Original debugging fixtures were copied before each run.
- Each new CSV/CLI module: `go test -json -count=1 ./...`; round 3 CLI cwd is
  `06/dupscan`. R2/R3 pass; R4 CSV passes and CLI fails as described. R4 CLI
  was checked with both installed Go versions; its result is not version-specific.
- Each new debugging/API module: `node --test`; all pass. R2 API additionally
  `node scripts/smoke.js`, R4 API `node smoke.js`; both pass actual child-process
  restart. Reviewer process checks additionally verify R3/R4 persisted updates
  and deletions, with temporary directories and child processes cleaned up.
- R2 CLI `./dupscan -json fixtures` twice, R3 CLI `./dupscan ../fixtures` twice:
  repeat output and independent hashes/paths pass. CSV probes, failure-before-fix
  debugging journals and exact timeout/retry receipts were inspected.
- Independent evidence remains ignored under `data/benchmark-runs/`, including
  `glmN-independent-tests.json`, CSV probes, API process checks and CLI receipts.
  Committed JSON contains selected metrics/identifiers only, not transcripts,
  credentials or private reasoning.
- All 24 journals were checked for scoped file writes and foreign benchmark
  paths. One `glu4` cwd typo failed with `local_path_not_found`; no successful
  prior-answer reads were observed. This is receipt auditing, not hermetic proof.
- `npm test` initially returned 499 pass, 39 fail, three skips because the
  expected Playwright Chromium/headless binaries were absent. All failing test
  files involved browser capabilities. `npm run browser:install` restored the
  package-matched browser cache; the unchanged app suite then returned **540
  pass, zero fail, one skip** in 50,743.327ms. Node v22.17.0; log
  `/tmp/glm-four-app-tests-recheck.log`. No test assertions or production files
  were changed. The initial failed verification is retained at
  `/tmp/glm-four-app-tests.log`.
- Authenticated `SMOKE_BASE_URL=http://127.0.0.1:4174 npm run smoke` passed
  health/providers/state/chat checks; log `/tmp/glm-four-live-smoke.log`.
- `git diff --check` passed. Only this report and its sanitized JSON are intended
  for commit. Production code, provider settings, saved chats and model catalog
  remain unchanged by the reviewer; the app was not restarted.
