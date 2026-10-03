# Overall model assessment — October 3, 2026

Model: `deepseek-v4.1-flash:cloud`, through Watchdog / Ollama Cloud in AI Chat.
This assesses observed model-plus-harness behavior, not the model in isolation.

## Professional assessment (subjective)

**Supervised mid-level coding assistant, with junior-level inconsistency in edge
cases and unsupported claims.** Useful for bounded scripts, CRUD prototypes,
small bug fixes and CLI tooling. Not demonstrated as a senior engineer or an
unattended production owner. Human job levels are analogies, not validated model
classifications.

| Dimension | Judgment / 10 | Evidence and limit |
|---|---:|---|
| Overall assistant capability for tested work | 7 | Delivers working artifacts and recovers with tools; needs review |
| Delivered work quality | 6.5 | Useful prototypes; recurring CSV validation and reporting defects |
| Practical usefulness under review | 8 | Writes/runs/tests scripts, API and CLI; real debugging/persistence checks |
| Independent production judgment | 4 | Misses plausible edge cases and makes unsupported claims; broad production ownership untested |

These are editorial ratings, not measured benchmark scores. Tenths are not an
accuracy claim. The overall rating is not an arithmetic average of these dimensions.
A passing completion rubric is not a production-readiness certification.

Strengths: meaningful failing-before/passing-after bug fixes; working Go and Kujo
programs; deterministic CLI results and content hashes; API validation and actual
restart persistence tests; recovery from an intentionally timed-out command.

Weaknesses: generated CSV programs accept non-finite numbers or mishandle overflow,
headers/escaping; Kujo builtin recall varies; shell arguments sometimes need repair;
benchmark prose invents cache state or unmeasured causal explanations. Tests can
pass while important acceptance requirements remain unspecified. No substantial
large-repository architecture, migration, security or production incident exercise
was part of this suite, so senior competency there is unknown.

## Deduplicated empirical record

Count each unique model benchmark run once, including adverse diagnostics and
operator-stopped model attempts. Exclude the launch that failed its health check
before creating a model request. Application unit-test runs and individual tool
calls are not additional model benchmarks.

| Group | Runs | Accepted task attempts / attempted |
|---|---:|---:|
| Original + intermediate + upgrade-final full suites | 3 | 11/18 |
| Round 3 candidates, including final 3f | 6 | 26/36 |
| Exhaustion B/C/D/E full suites | 4 | 22/24 |
| Unchanged full repeats F/G | 2 | 12/12 |
| Earlier targeted receipts and exhaustion A | 2 | 0/2 |
| Documentation control/treatment | 2 | 2/2 |
| **All recorded runs** | **19** | **73/94 (77.7%)** |

Thus: 15 full six-task suites (71/90) plus four targeted one-task runs (2/4).
The six milestone suites highlighted in user-facing comparisons were
3/6 → 5/6 → 5/6 → 6/6 → 6/6 → 6/6, or 31/36 (86.1%). That smaller subset must
not be presented as the complete historical total.

The last three full suites E/F/G passed **18/18 (100%)** on unchanged application
code. The following two targeted documentation tests also passed, making **20/20
observed task attempts on the current configuration**. This is six original task
types repeatedly exercised, not 94 distinct problems, and is not an estimate of
future reliability. Earlier harness defects/context handling contributed to
failures, so historical 77.7% is not a pure model-ability score.

The documentation pair reduced reported tokens 55.7% and receipts from 50 to 35;
correctness tied. One sequential pair with different selected workloads does not
prove general efficiency or quality gains. Model training-corpus membership is
unknown; documentation retrieval helped it use unfamiliar syntax, but language
familiarity alone does not explain the Go edge-case issues.

## Sources and verification

Unique IDs and independent grading were reconciled from:

- [Original/upgrade comparison](development-2026-10-02-comparison.json).
- [Round 3, including six candidates](development-round3-2026-10-02.json).
- [Exhaustion A–E](development-exhaustion-2026-10-03.json).
- [F/G and milestone comparison](development-repeat-g-2026-10-03.md).
- [Documentation experiment](kujo-context-ab-2026-10-03.md).

Aggregation by unique run ID: 19 runs, 94 attempts, 73 accepted. No experiments
were rerun for this assessment. Previous application verification remains 540
passed, one Linux-only skip; it is not part of the model completion denominator.
No production files or configuration changed.
