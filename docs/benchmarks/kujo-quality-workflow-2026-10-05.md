# Kujo quality workflow upgrade — 2026-10-05

## Scope and implementation

Starting repository: `main`, `2869afa119abd87fe0202a777b13da83adef05e8`.
Runtime/tool improvements: `1844661`. Acceptance infrastructure: `419858c`. Runtime-pattern follow-up: `c457ede`. Post-comparison argument clarification: `4697fa9`; scaling/duplication guidance: `67e2b51`. Those last two guidance changes are tested but not measured by these generation runs.

Implemented the repository-side parts of the quality plan:

- Bounded, provider-neutral Kujo task guidance selected from the latest user request and authorized tools. No model brand special cases or permission changes.
- Eleven small runtime-qualified examples, including type predicates, JSON validation, atomic persistence, structured CLI errors and whole-row replacement. The executable verifier checks expected output and exit status. New validation fails on 1.5.0's VM, so new examples are restricted to verified 1.7.0 rather than advertised globally.
- Optional declared dependency/test manifests for `local_kujo`; changes or removal invalidate successful verification and stop benchmark repetition. Later observed hash changes invalidate contract evidence even without a local-file-write receipt.
- A correction for successful composite benchmark receipts: exit status is now available for contract evidence only after all trials succeed.
- Bounded failure diagnosis at two and five failures, with success resetting the current streak, a minimal reproduction and a compact blocker/verified-state handoff. No automatic retries, runtime switching, timeout extensions or permission changes.
- Reviewer guidance explicitly covers short writes, temporary-file creation, code duplication and scale-appropriate algorithms.
- Literal argument guidance explains that `local_kujo` inserts `--`; user-supplied arguments remain unchanged. Five calls in the first upgraded run incorrectly supplied a second separator.
- Runtime qualification now validates intentional CLI error exit status/stderr as well as successful examples; the exact pinned 1.7.0 binary passes all 12 supported probes.
- Acceptance-asset SHA-256 integrity checks before/between/after benchmark generation; altered assets invalidate the run. Regression coverage includes deletion, symlink replacement, modification during generation and rejection before requests.
- Fresh interval-processing acceptance suite: 39 cases, deterministic generated inputs, strict error-contract checks and positive/negative oracle calibration. The task is published for reproduction after evaluation and is no longer a private holdout.

Canonical workflow: [Kujo quality workflow](../engineering/kujo-quality-workflow.md).
API addition: optional `verification_paths`, additive receipt manifest fields; existing callers remain valid. Profiles, models, auth, user data formats and provider routing are unchanged.

## Verification

- Baseline full suite: 636 passed, 0 failed, 1 skipped.
- Full suite on final production code: 649 passed, 0 failed, 1 existing skip (`node --test --test-concurrency=1 tests/*.test.js`). The final full suite is supplemented by focused argument, guide, reviewer and runtime tests; all 46 local-runtime boundary tests passed with an existing sensitive-file fixture.
- Kujo 1.7.0: 11 examples / 22 checks pass (`KUJO_REFERENCE_BIN=... node scripts/verify-kujo-reference.js`). Kujo 1.5.0: prior seven examples / 14 checks pass; four new examples withheld.
- Authenticated live smoke: health, providers, state and chat passed (`node --env-file=.env scripts/smoke-test.js`).
- `git diff --check` passed. Live server restarted only when idle; provider configuration hash unchanged.
- Logs: `/tmp/ai-chat-quality-baseline-20261005.log`, `/tmp/ai-chat-quality-final-verified-20261005.log`, `/tmp/ai-chat-quality-finaltargeted.log`, `/tmp/ai-chat-quality-smoke-final.log`.

## Comparison controls and limits

One fresh task, three fresh directories/chats, same GLM 5.3 Flash from Watchdog / Ollama Cloud, same pinned Kujo 1.7.0 default backend, 12,000 response tokens per model request, one attempt, serial execution, 15-minute stream deadline, review/contract enabled. The deadline is a cap, not a claimed model latency. The only prompt difference is the output directory.

The baseline used the already-running pre-upgrade app; the first upgrade used restarted `419858c`; the final generation run used `c457ede`, with whole-row replacement and collection guidance. All used the same integrity-enabled benchmark runner and independent oracle. The corpus was expanded during baseline observation, including generic stderr guidance; this is a targeted development comparison, not a preregistered blind trial. No generated artifact was repaired for grading.

Acceptance hashes were unchanged. The controller retained the manifest in memory through grading. Asset integrity detects persistent modification; this is not an OS sandbox or proof the builder could not read verifier files. Broad local shell permissions remain under operator control. Strong adversarial evaluation needs a separately isolated worker/controller. No frontier control was run: the configured frontier profile uses the Codex harness, which would introduce a harness confound. No frontier parity claim is supported.

## Results

| Variant | Independent checks | Response time | Reported tokens | Tool calls | Model rounds | Advisory review |
|---|---:|---:|---:|---:|---:|---|
| baseline | 39/39 | 418.2s | 783,306 | 49 | 28 | pass |
| upgraded | 39/39 | 681.8s | 1,998,517 | 72 | 36 | pass |
| qualified | 39/39 | 668.4s | 2,378,836 | 105 | 41 | inconclusive |

All three responses completed and passed the independent behavior oracle. This
is three implementations of **one** task, not a replacement for the earlier
six-task benchmark suites. Reported tokens are not billed-cost measurements;
cache accounting is unavailable. None of the generated artifacts were repaired.
The final reviewer failed its JSON submission and remained inconclusive; the
app did not turn that into a pass. This is a model/review reliability limitation.

Raw nonzero/error receipt counts were 6, 18 and 35. These are **not** all tool
infrastructure defects: expected invalid-input tests also return nonzero. The
first upgrade included five duplicated-`--` argument mistakes and eight later
intentional JSON rejection results. Baseline included guessed built-ins and a
missing documentation path. Both baseline and upgrade encountered unsupported
language operations. These distinctions matter more than a raw error percentage.

### Generated-script performance

Three process-wall-time trials per size, same pinned binary, descending disjoint
intervals; all outputs checked against the canonical result. Includes process
startup; local load and tiny sample size limit generalization. These are observed
artifact timings, not a stable CI performance budget.

| Variant | 100 intervals, median | 1,000 intervals, median |
|---|---:|---:|
| baseline | 46.4ms | 532.6ms |
| upgraded | 77.3ms | 2154.9ms |
| qualified | 73.3ms | 1748.8ms |

## Professional assessment

The infrastructure is more explicit and better tested. The measured generated
code did **not** show an overall quality or efficiency improvement. All variants
were correct on the tested behavior, but the two upgraded variants cost more
inference and produced slower scripts on this workload.

Source inspection explains part of the artifact difference: baseline sorts
encoded numeric keys using the runtime's sort; the encoding relies on the fixed
endpoint bounds and deserves an explanatory helper/comment. Both upgraded
variants use insertion sort, with quadratic worst-case comparisons. The first
upgrade also manually joins serialized rows. The final variant leaves duplicated
validation/merge functions in `main.kujo` and `intervals.kujo`; tests of the helper
copy alone would not establish entry-point coverage. The independent oracle runs
the actual CLI, so its results remain meaningful. Declared dependency manifests
were used in four final-run calls, but hashes cannot prove semantic test coverage.

These are useful small-script builders with external verification. This evidence
does not justify trusting them for unsupervised high-end production engineering,
or claiming frontier parity. More prompting is not automatically better. The
last argument/scaling guidance changes are deployed and unit-tested, but their
effect on generated quality is unmeasured; do not attribute a benefit yet.

## Remaining boundaries and follow-ups

- **Kujo repository:** nested assignment passes compilation but fails execution on
  the exact pinned 1.7.0 binary. Default VM: exit 4, Stack underflow. Interpreter:
  exit 4, Complex index assignment not yet supported. Safe whole-row replacement
  is verified and available in AI Chat. Upstream compiler/runtime work remains;
  no sibling repository was modified. Reproduction:
  [nested-index-assignment.kujo](../engineering/reproductions/nested-index-assignment.kujo).
- **Evaluation:** use broader fresh tasks and repeated matched trials before any
  quality uplift claim. Review-format reliability and token efficiency remain
  existing open findings. A frontier control must disclose or eliminate the
  Codex-vs-generic harness difference.
- **Isolation:** hash checks detect persistent acceptance changes, not access or
  temporary tampering. Strong adversarial isolation requires a separately
  permissioned worker/controller. Existing user command permissions are preserved.
- **Training:** the verified example corpus and admission rules are ready for
  retrieval. Hosted-model fine-tuning/deployment is not available through this
  repository's provider contracts; no model training was performed.

## Reproduction commands

Prepare a fresh task directory, replace `RUN_ROOT` in the public task, and freeze
oracle/calibration hashes as described in the workflow document. Use a fresh run
ID/title to avoid reusing prior responses. Credentials come from the local env file.

```sh
node --env-file=.env scripts/run-benchmark-suite.js \
  --tests /path/to/fresh-suite.md \
  --provider-profile "Watchdog / Ollama Cloud" --model glm-5.3-flash:cloud \
  --tool-preset local-dev --require-instance-role any \
  --run-id UNIQUE --title-prefix UNIQUE \
  --max-tokens 12000 --max-attempts 1 --stream-timeout-ms 900000 \
  --concurrency 1 --acceptance-manifest /tmp/frozen-acceptance.json
node scripts/verify-kujo-intervals.js /fresh/main.kujo /absolute/qualified/kujo
```

Recheck the retained acceptance manifest before grading. Do not change generated
source to improve a score. Final script timings use descending disjoint pairs
`[2*i, 2*i]` for 100 and 1,000 values, three trials each, 10-second process cap,
checking every output against the ascending canonical array.

## Evidence and handoff

[Machine-readable comparison](kujo-quality-workflow-2026-10-05.json) contains run
IDs, execution IDs, source hashes, raw-artifact paths and timings. Reproducible task:
[interval task](../../benchmarks/kujo-interval-quality-tasks.md). Oracle:
`scripts/verify-kujo-intervals.js`; positive and deliberately defective controls:
`tests/kujo-intervals-oracle.test.js`. Acceptance integrity is recorded unchanged
for every run, then rechecked by the controller before independent grading.

SignalBox: new capture `cap_5388c468-9d40-4bf5-8fd4-2f4f164d5078`, signal
`sig_e2269a30-c17a-457c-911a-5260eef76357` for the upstream runtime limitation;
both verified by exact ID and concept retrieval. Existing efficiency finding
`sig_43c2eb25-5ab0-471b-b0df-e7bded60c543` was deduplicated, not recreated.
Completed-work summaries and routine verification were rejected as captures.
Strata receives the repository state/handoff and this report reference separately.
