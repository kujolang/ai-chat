# Development benchmark: third consecutive-run check

Run `dev-2026-10-03-exhaustion-g` independently verified **6/6**. E, F and G
are three consecutive 6/6 runs on unchanged application code: **18/18 task
instances**, with no runner retries or human repairs. This supports repeatability
on these six prompts, not universal reliability or production readiness.


## Full comparison

| Milestone | Verified completion | Rate | Elapsed | Reported tokens | Tool receipts |
|---|---:|---:|---:|---:|---:|
| First | 3/6 | 50% | 476.319 s | 814,711 | 187 |
| Second | 5/6 | 83.3% | 405.510 s | 942,912 | 208 |
| Third | 5/6 | 83.3% | 610.783 s | 1,771,713 | 300 |
| Final engineering run E | 6/6 | 100% | 965.052 s | 2,586,064 | 174 |
| Unchanged repeat F | 6/6 | 100% | 393.980 s | 2,912,002 | 198 |
| Unchanged repeat G | **6/6** | **100%** | **439.833 s** | **2,751,433** | **174** |

| Task | First | Second | Third | E | F | G |
|---|---|---|---|---|---|---|
| CSV utility | Pass | Pass | Pass | Pass | Pass | Pass |
| Kujo/Go programs and complete timing report | Fail | Fail | Fail | Pass | Pass | Pass |
| Debug fixture | Pass | Pass | Pass | Pass | Pass | Pass |
| Persistent HTTP API | Fail | Pass | Pass | Pass | Pass | Pass |
| Intentional timeout recovery | Pass | Pass | Pass | Pass | Pass | Pass |
| Duplicate-file CLI | Fail | Pass | Pass | Pass | Pass | Pass |

The earlier diagnostic A–D attempts remain in the engineering report, including
D's 5/6 before the final fix. C's earlier 6/6 is not part of this consecutive streak.
Completion is independently graded artifact/task completion, not merely HTTP/SSE
success or a subjective code-quality score.

G took 45.853 seconds more than F (11.6%) and used 160,569 fewer reported tokens
(5.5%), with 24 fewer receipts. It was 525.219 seconds shorter than E. No runtime
optimization occurred between E/F/G: the model selected different code, tests and
prime workloads. These timing differences are not a measured harness speedup.
Reported usage sums repeated context across provider rounds; it is not unique
context size, cost or cache-adjusted billing. Cache details were unavailable.

## Per-task evidence

| Task | E elapsed / receipts | F elapsed / receipts | G elapsed / receipts | G independent verification |
|---|---:|---:|---:|---|
| CSV | 73.371 s / 21 | 31.331 s / 16 | 23.137 s / 15 | 5 Go tests; compiled fixture output checked |
| Kujo/Go | 570.504 s / 72 | 156.635 s / 77 | 253.893 s / 45 | Both programs agree on 7 boundary probes; ten final trials and medians verified |
| Debugging | 37.638 s / 16 | 13.705 s / 14 | 11.557 s / 14 | 5 Node tests; original failure and repaired behavior verified |
| HTTP API | 147.989 s / 23 | 58.602 s / 22 | 66.342 s / 29 | 18 integration tests, including real child-process restart |
| Timeout | 14.896 s / 8 | 15.436 s / 8 | 14.549 s / 9 | One intended short timeout followed by one successful retry |
| CLI | 113.831 s / 34 | 109.023 s / 61 | 63.527 s / 62 | 15 Go tests; identical compiled JSON twice; file hashes, sizes and ordering checked |

Task durations exclude between-case overhead. G's four generated test suites pass
43 tests (5 + 5 + 18 + 15), in addition to independent output/boundary checks and
receipt verification. Test counts differ across generated implementations and
are not comparable coverage percentages.

## Quality assessment

**The agent reliably completed these tasks, but output quality still needs review.**
G improves on F in API error/persistence coverage and Kujo syntax fluency, while
its CSV validation is weaker. Three perfect completion scores do not mean three
perfect implementations.

### CSV: adequate fixture behavior, weakest production candidate

G uses an `order_id,customer,amount` input schema and sorted tab-separated output.
The supplied fixture produces `alice\t15.00` and `bob\t25.00`; empty/malformed
amount rows are explicitly reported and skipped. Five tests pass. This satisfies
the same bounded task criteria used in previous rounds.

Additional reviewer probes find that `NaN` and `Inf` are accepted with exit 0 and
printed as totals; a wrong header is silently discarded. E and F rejected
non-finite input, so this is a quality regression in the **generated program**, not
an application-code regression. G uses float64 totals and reads the entire CSV
into memory; numerical precision and large-input resource bounds are not robust.
Its tab-separated output is different from E/F's CSV output, so their comma-escaping
failure cannot simply be assigned to G. None of these generated CSV programs
should be treated as production financial processing without further requirements
and tests. The original completion rubric has not been retroactively tightened.

### Debugging: small, correct repair

The original receipt has one passing and four failing tests. The model changes
percentage handling to divide by 100, preserves the interface, and gets five
passing tests. Independent rerun confirms the fix. This remains a narrow seeded
bug task, not evidence of broad debugging coverage.

### API: stronger verification and state handling

G's 18 tests launch a real child process, create/update/delete records, stop the
process and restart against the same data file. Updated and deleted state survives.
Tests also cover malformed JSON, non-JSON content types, a 64 KiB request bound,
and corrupt storage returning 500 without crashing. Independent `npm test` passes.

The store serializes reads and mutations through a per-instance promise queue,
reads current disk state and writes through a temporary file plus rename. It does
not retain an already-mutated in-memory state after a failed write in the same way
as earlier generated variants. This is code-supported assessment, not proof of
multiprocess coordination or power-loss durability. Reading the whole store for
each operation also limits scale; no throughput claim was measured.

The agent corrected a `node --test test/` invocation and a test fixture that sent
raw malformed text while expecting valid-JSON validation behavior. It retained
malformed-JSON coverage and added valid JSON string/null cases. These are
legitimate corrections, not weakened assertions to manufacture a pass.

### CLI: meaningful failure-path debugging

F had 19 passing tests; G has 15. G discovered that size prefiltering skipped
unreadable files whose sizes were unique. It kept the failing test and added a
readability probe before prefiltering. The final implementation has deterministic
size/hash group ordering, sorted paths, SHA-256 hashes and explicit errors.

Independent execution produces four duplicate groups containing nine files, with
two byte-identical JSON runs. Actual file bytes independently match every reported
hash and size. Original receipts exercise unreadable paths and restore fixture
permissions. Exit semantics are explicit: 0 clean, 1 usage, 2 partial errors,
3 fatal errors. They differ from F's chosen interface; these are separate generated
programs, not changes to AI Chat's public API.

### Kujo/Go: better language execution, imperfect benchmark interpretation

G consults Kujo documentation and passes its first syntax check/build, unlike F's
seven failed exploratory syntax/builtin probes. Both programs implement inclusive
trial division and agree at limits 0/1/2/3/4/49/1000: 0/0/1/2/2/15/168. Original
receipts also agree at 100,000 (9,592) and 200,000 (17,984).

At 200,000, the actual `/usr/bin/time -p` wall trials are:

| Runtime | Five wall trials (seconds) | Median |
|---|---|---:|
| Kujo | 21.29, 20.18, 20.24, 19.30, 19.95 | 20.18 s |
| Go | 0.20, 0.16, 0.16, 0.18, 0.16 | 0.16 s |

All trials and medians match the receipts. There was earlier 100,000 testing but
no separate excluded 200,000 warmup. The 126.125 ratio applies only to these
implementations and these wall measurements, including startup. E measured
300,000 wall time; F measured 100,000 internal compute time; G measured 200,000
wall time. They cannot establish language/runtime optimization between rounds.

Initial Go build receipt: 788.606 ms. Rebuild: 0.64 seconds from `time` and
655.819 ms shell duration. Calling the initial build "cold" is unsupported without
cache-state evidence. The generated report also calls 0.09 seconds below the
two-decimal timer resolution; it is above 0.01 seconds, although relatively coarse.
These reporting errors prevent calling the analysis publication-quality despite
working programs and genuine trials.

## Runtime reliability and recoverable errors

All six executions complete with `stop`, one runner attempt each, zero transport
failures and zero runner retries. G records 101 provider rounds, 174 tool receipts
and three input repairs (E: 97/174/1; F: 112/198/2).

Sixteen G tool receipts have failed status: one missing documentation path,
seven missing parent/files, two create-versus-existing-file errors, five restricted
file writes, and the one deliberately requested timeout. All recover. The blocked
writes concern `.bin` extensions and a sensitive filename; safe text fixtures
satisfy the task. These are observable input/policy failures, not silent task
failures. Nonzero test commands are also inspected separately: a completed tool
receipt does not imply its subprocess tests passed.

The requested 1,000ms timeout stopped at 1,007.992ms after printing `started`.
The single 10,000ms retry finished in 5,195.056ms with `started` and `finished`.
The script has no side effects beyond output/timer. This demonstrates intentional
failure recovery; it does not justify retrying arbitrary consequential commands.

All file-tool writes target their assigned case directories. Shell command review
found no prior-answer reuse; language documentation reads are allowed. This is
receipt-based evidence, not a hermetic isolation guarantee.

## Verification receipt and remaining limits

Independent verification performed after timing trials:

- Cases 01 and 06/dupfind: `go test -json -count=1 ./...` — pass (5 and 15).
- Case 01: `go build -o /tmp/exhaustion-g-orders .` and compiled fixture/quality
  probes — build and fixture pass; quality weaknesses above reproduced.
- Case 02: `kujo run prime_count.kujo N` and `./prime_count_go N` for
  N = 0, 1, 2, 3, 4, 49, 1000 — matching expected counts.
- Case 03: `node --test` — 5 pass.
- Case 04: `npm test` — 18 pass, including actual process restart.
- Case 06: `./dupfind/dupfind -json fixtures` twice from case 06 — exit 0,
  identical output; Python hashlib/size/order assertions pass.
- Original prime timing and timeout receipts — verified; no additional timed
  trials were mixed into the recorded measurements.
- `SMOKE_BASE_URL=http://127.0.0.1:4174 npm run smoke` with configured local auth
  and Node 22 — pass: health/providers/state/chat HTTP 200, eleven providers.
- `git diff --check` and comparison JSON consistency — pass before commit.

Independent receipt manifest: `data/benchmark-runs/exhaustion-g-independent.json`.
Per-case independent logs: `data/benchmark-runs/exhaustion-g-independent-N.log`.
Live smoke log: `/tmp/exhaustion-third-smoke.log`. The earlier application suite
was 540 pass, one Linux-only skip; it was **not rerun** for this docs-only repeat.

No application change or unresolved harness blocker was found in this repeat.
Generated CSV edge cases and benchmark-report precision remain quality limits.
The next stronger evaluation would use fresh task families and a predeclared
edge-case rubric, rather than equating repeated success on six prompts with
universal readiness. This session adds no production behavior or configuration.

[Machine-readable sanitized comparison](development-repeat-g-2026-10-03.json).

## Controls and provenance

Starting revision: `19d761c624cb92eb2e1a5d077e1446a72dc3596c`, clean `main`.
Application source remains `c7e001f`; subsequent commits only record benchmarks.
No application edits, restarts, model/profile changes, permission changes, rerolls,
or human repairs to generated programs are part of this repeat.

Runner settings exactly match F: Watchdog / Ollama Cloud,
`deepseek-v4.1-flash:cloud`, 6,000 requested output tokens, concurrency one,
one attempt, 1,200,000ms overall deadline. Prompt text matches F byte-for-byte
once its assigned directory suffix is replaced. Task 03 starts from the original
buggy seed; other directories are fresh. Prior answer reads are forbidden by
prompt but not prevented by a hermetic filesystem sandbox.

Independent tests run after the prime timing trials. Application tests previously
passed 540 with one Linux-only skip; unchanged source does not require rerunning
them to assess these new generated artifacts. Live smoke is checked separately.

## Reproduction and evidence

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-03-exhaustion-g/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --title-prefix EXH20261003G \
  --run-id dev-2026-10-03-exhaustion-g \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

[Previous repeat and quality assessment](development-repeat-2026-10-03.md).
[Earlier engineering comparison, including adverse attempts](development-exhaustion-2026-10-03.md).

Raw runs/receipts remain under ignored `data/benchmark-runs/`; generated files
under `data/dev-benchmark-2026-10-03-exhaustion-g/`. Credentials and private
reasoning are excluded from committed reports.
