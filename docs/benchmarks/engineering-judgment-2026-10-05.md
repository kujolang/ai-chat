# Engineering judgment comparison — October 5, 2026

## Scope and method

This experiment tests the next step beyond collection utilities: compatibility,
Kujo extension, persistence, cancellation, concurrency and conservative handling
of an ambiguous maintenance request. **Five tasks use Node; one uses Kujo.** It
cannot establish broad Kujo mastery or a senior developer equivalence.

The baseline retains the locally qualified compact reference, allocation guidance,
batched verification and always-review settings. The treatment adds only the
short, repository-owned decision/discovery/failure-handling guide. A connected
ChatGPT model provides a frontier control through AI Chat's provider-neutral tools,
not the native Codex harness. Exact outcomes and limitations are recorded below.

- Starting repository: `b7714ba2fe2dce043e3e48e8905b779d01980d58`, `main`.
- Evaluation fixtures/oracle: `183a8b4`.
- Corrected measured runtime: `1701d46`.
- Protocol: [engineering-evaluation-protocol.md](../../benchmarks/engineering-evaluation-protocol.md).
- Task specifications: [engineering-judgment-tasks.md](../../benchmarks/engineering-judgment-tasks.md).
- Reproduction: [DEVELOPMENT.md](../../benchmarks/DEVELOPMENT.md#engineering-judgment-comparison).
- Raw local evidence: `data/engineering-judgment-20261005-v2/` and
  `data/benchmark-runs/engineering-*-20261005-v2.json` (ignored runtime data).

Each arm gets fresh files/chats, six sequential tasks, one attempt, the runner
setting `max_tokens=12000` and a 900000 ms caller deadline. GLM uses the response
allowance and temperature 0.2; the ChatGPT plan adapter does not forward token or
temperature controls. The frontier route therefore does not have an identical
provider-side generation budget. There are 33 independently
executed check groups, not 33 independent development tasks. No candidate source
is manually repaired. Frozen acceptance files are hashed before generation and
verified again before grading. Reference and deliberate-defect controls calibrate
the Node checks; six positive-control Kujo groups pass on the pinned 1.7.0 default
runtime SHA-256 `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.

The controller's 0–4 source ratings follow the protocol's anchored rubric. They
are qualitative, unblinded judgments with supporting observations, not independent
numeric proof or a professional certification. Tests written by the model and
same-model review outcomes are recorded separately from the controller oracle.

## Real AI Chat fix discovered during setup

Ordinary `.cjs` modules were rejected by `local_file_read` and `local_file_write`.
The original baseline pilot hit repeated `local_file_not_readable` and
`local_file_write_blocked` errors, despite using an ordinary Node module format.
The pilot was explicitly cancelled and excluded from the matched comparison.
It reported 261897 tokens before cancellation; usage is not a complete bill.
Its run record also contains an unstarted second task, not a second model result.

`lib/local-runtime.js` now permits `.cjs` and `.mjs` through its existing bounded
text-file tools. Workspace confinement, sensitive paths, symlink checks, size
limits and overwrite safeguards remain in force. The new regression covers
listing/reading/writing modules and rejection of sensitive/escaping paths. This
is an additive file-tool compatibility fix, not a permissions bypass. It was
committed separately and deployed to the idle local app before measured runs.
All comparison arms receive the fix; its benefit is not attributed to guidance.

## Limitations

These are six small, well-specified synthetic engineering tasks. The ambiguous
case explicitly warns that shared IDs need not be duplicates and requires a
preview; it tests conservative execution, not the full difficulty of eliciting
requirements from a real stakeholder. The repository integration fixtures are
small and do not represent a large unfamiliar codebase.

There is one sample per arm, fixed arm order, no blinded source review, and no
statistical reliability claim. Provider and host load can affect elapsed time;
reported tokens are not dollar costs or interchangeable provider billing units.
The ChatGPT control uses the existing live connection to avoid copying OAuth
credentials; the GLM arms use an isolated benchmark database. Record any resulting
route limitations rather than substituting native Codex and calling it equivalent.

Prompt restrictions and hash checks are not OS read isolation. Tool receipts can
show observed out-of-scope reads but cannot prove none occurred through subprocesses.
No performance speedup is claimed from this experiment. The full app regression
suite completed before the corrected model-generation runs began.

## Post-hoc serialization check

Source inspection of baseline task 3 found that `JSON.stringify` exceptions are
wrapped in a new `TypeError`. The requested original-error propagation is therefore
not preserved for that failure path. The frozen serialization group tests rejection
and unchanged disk, but not exception identity. A supplemental check passes a value
whose `toJSON` throws a sentinel error and an injected `io` that records any access;
it checks rejection with that exact error and no I/O. This check is applied equally to delivered arms and reported separately from the
frozen 33-group score.

## Repository verification

Before edits: 673 tests, 672 passed, one existing skip, 126550 ms.
After the module support fix and evaluation additions: 678 tests, 677 passed,
one existing skip, 128722 ms. These timings are receipts, not a performance claim.

Commands:

```sh
PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH node --test --test-concurrency=1 tests/*.test.js
PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH node --test tests/engineering-evaluation.test.js
PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH node --test tests/local-runtime.test.js
PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH SMOKE_PORT=4174 node --env-file=.env scripts/smoke-test.js
git diff --check
```

All passed. Logs: `/tmp/ai-chat-senior-baseline-tests.log`,
`/tmp/ai-chat-engineering-final-tests.log`,
`/tmp/ai-chat-engineering-oracle-tests.log`,
`/tmp/ai-chat-module-extensions-tests.log`, and
`/tmp/ai-chat-engineering-smoke.log`. The live smoke checks covered health,
provider catalog, state and fixture chat. No dependency changes were needed.

## Oracle execution-completion correction

During the baseline, controller inspection identified that a worker process can
exit zero while an assertion awaits a Promise that never resolves. The original
verifier checked process status without an explicit assertion-completion receipt.
The original generation assets were retained throughout those runs. Afterward,
the verifier gained a per-case completion receipt, rejects silent early exits and
unresolved Promises, and contains worker temporary files under controller-owned
directories. Every original arm was regraded without changing any candidate.
Deliberate unresolved-Promise and early-exit-zero controls pass. Original and
corrected results remain separate; this is a measurement correction, not a model
implementation repair. The repaired frontier control freezes the corrected oracle.

The initial frozen grader also required task 6 errors to contain **only** an
`error` key. Its prompt requires one JSON error object, but does not prohibit
additional diagnostic fields. Baseline's `{error, code}` was therefore a grader
false rejection, not a demonstrated model contract failure. The corrected task 6 checks
allow extra fields while retaining exit 1, empty stdout, valid object JSON and a
nonempty error string. Task 2's explicitly exact error shape stays strict. This correction was calibrated and applied identically to all arms; retain the original
31/33 baseline result only as an invalidly strict historical measurement.

A second post-hoc fault injection fails the first `close()` attempt **before**
closing its real file handle. Baseline retries cleanup and closes it; the guided
implementation makes only one attempt and leaves that handle open. Both preserve
the destination bytes and original close error. The controller closes the handle
after observation. This is an injected failure, not an observed OS close incident.
It tests the explicit no-open-handles requirement and contrasts with the guided
mock, which sets its `closed` flag before throwing. Reproduce both supplemental
checks with `node scripts/verify-engineering-failure-edges.js PATH/03/store.cjs`.
Positive and negative controls live in `tests/engineering-failure-edges.test.js`.
These two post-hoc checks remain separate from the frozen 33 groups.

## Original GLM comparison

| Arm | Delivered | Corrected independent checks | Supplemental failure checks | Reported tokens | Tool calls | Elapsed sum |
| --- | --- | --- | --- | ---: | ---: | ---: |
| GLM baseline | 6/6 | 33/33 | 1/2 | 7,354,610 | 301 | 1,792.062 s |
| GLM decision guidance | 6/6 | 33/33 | 1/2 | 2,857,523 | 136 | 1,683.483 s |
| Original GPT-5.5 control, invalid adapter | 0/6 | Seed-only; excluded | Not applicable | 96,882 | 0 | 86.781 s |

Usage totals include repeated input across provider rounds, not unique context size.
All original arm usage records report complete accounting, but the units are not
comparable dollar prices across providers. The corrected completion-receipt oracle
did not lower either GLM score. The historical baseline 31/33 is superseded by
33/33 because two error-shape rejections exceeded the written contract.

The GLM total-token difference is dominated by baseline task 6: 5,051,230 tokens
and 194 calls, including 81 reads each of two unchanged, complete files. Guided
task 6 used 228,099 tokens and 22 calls. Excluding that single outlier, baseline
used 2,303,380 tokens and 107 calls; guidance used 2,629,424 tokens and 114 calls.
Thus this run does **not** demonstrate a general guidance efficiency improvement.
No AI Chat result omission/compaction was observed in the repeated-read trace;
why the model/provider repeated the reads is unresolved.

### Source quality, separate from test passing

The unblinded controller rubric is anchored 0–4, with equal weight for
maintainability, integration, failure handling and judgment. Baseline averages
**2.958/4**; guidance **3.042/4**. The 0.083-point difference is small, subjective,
and not evidence of a change in professional level. Do not convert it into a
precise seniority or frontier-parity claim.

| Task | Baseline finding | Guidance finding |
| --- | --- | --- |
| Config | Small compatible fix; unchanged real consumer | Production code byte-identical; better decision record |
| Kujo CLI | Reuses validator; bounded sum extension | Similar implementation; repairs its own malformed test fixture |
| Atomic save | Preserves I/O errors but wraps serialization exception | Preserves serialization exception but leaks handle under injected close failure |
| Subprocess | Normal cancellation/overflow pass; ignores pipe errors | Better readiness tests, but stream-error path can reject without reaping child |
| Counter | Correct queue and persistence-before-publish | More explicit synchronization in tests; useful concrete improvement |
| Cleanup | Conservative preview; pairwise comparisons and long read loop | Canonical keys with Map; no read loop in this sample |

Both are useful builders for bounded, specified tasks. Neither deserves unattended
production approval from these results. All baseline same-model reviews passed,
including code with the supplemental defects: self-review is not an independent
quality gate. Detailed anchored observations are retained in the companion JSON.

## ChatGPT control transport defect and repair

The initial six control failures were AI Chat integration failures, not usable
measurements of GPT-5.5 coding quality. A safe direct request through AI Chat's
supported credential lease and official Responses endpoint reproduced the shape:
`response.output_item.done` contained a function call, while `response.completed`
reported an empty output array. AI Chat previously ignored the done-item event,
so it dropped the call and eventually reported `empty_final_response`.

The adapter now retains bounded completed items in output-index order and uses
them when the successful terminal envelope omits output. It still waits for
`response.completed` before authorizing any tool, validates call IDs/namespaces,
rejects invalid/repeated indexes, retains opaque reasoning for replay, and enforces
aggregate bounds. A populated final output remains authoritative and is not
concatenated into duplicate calls. Failed/incomplete/interrupted streams never
execute retained calls. Regression tests cover these paths. No credential routing,
provider selection, permissions or account profiles changed.

This follows the official [Responses streaming event contract](https://developers.openai.com/api/reference/resources/responses/streaming-events),
which defines completed output-item events separately from response completion.
Local structural probe artifacts contain event types/field names/lengths only,
not tokens or model reasoning. The app was restored after the probe and restarted
with the fix. The original failed arm remains preserved and excluded from quality
comparison; the fresh repaired control is reported separately below.

## Promotion decision

Keep the existing qualified local defaults. Do not add the generic decision guide
to every production request: this experiment shows mixed failure-path tradeoffs,
small subjective quality movement, and higher cost on the five non-outlier tasks.
Retain the guide as an explicit benchmark treatment. Keep the independently
verified module-file support, bounded unchanged-read diagnostic, corrected oracle,
and ChatGPT stream fix. These repair demonstrated harness problems without
claiming to raise model intelligence or professional seniority.

## Final regression receipt

Before the final transport-diagnostics patch, the serial suite passed 685/686
with one existing skip. After that patch, the full serial suite passed:
**688 tests, 687 passed, one existing skip, zero failures**, 144894 ms.
This is a verification duration, not a claimed speed improvement. The final local
smoke passed health, 11-provider catalog, state and fixture chat after restart.
Logs: `/tmp/ai-chat-engineering-release-tests.log` and
`/tmp/ai-chat-engineering-release-smoke.log`. Focused adapter/routes tests: 27/27; corrected
oracle plus supplemental fixture tests: 8/8. No dependencies, stored profile schema,
HTTP request format or permission settings were changed. Error codes now distinguish
known ChatGPT network failures; existing generic failures remain supported. All
seven provider profiles match the pre-run snapshot. The isolated benchmark server
was stopped and the live app was gracefully restarted with final code.

## Bounded unchanged-read follow-up

One fresh unguided cleanup task ran on patched runtime `83e70ed`: delivered,
**5/5 checks**, 383,401 reported tokens, 33 model tool calls, 17 provider rounds,
218.828 seconds. It performed eight file reads and its persisted diagnostic-notice
list was empty. It did **not** exercise the new advisory in a live model run.
Therefore its lower cost than baseline task 6 is not evidence that the advisory
caused improvement. Saved baseline receipts deterministically trigger the new
advisory after receipt 10; unit tests verify bounded detection, changed-content
reset, phase gating and resume deduplication. This is a diagnostic safeguard,
not a demonstrated cure for every loop. No second follow-up was attempted.

## Repaired frontier control

The fresh GPT-5.5 control on runtime `83e70ed` delivered tasks 1, 2, 3 and 6:
**4/6 deliveries, 22/22 independent groups on delivered work**. Running the full
oracle yields 24/33 because two checks pass against untouched counter seed code;
those two are not credited as delivered work. Tasks 4 and 5 failed before any
model tool call with `chatgpt_provider_error`. Their saved errors did not preserve
the underlying transport cause. Both failed after about 11 seconds, but timing
alone does not prove a timeout diagnosis. A later unauthenticated connectivity
probe reached the official endpoint (HTTP 401); it cannot diagnose those past
failures. Task 6 then completed. No retries were used to manufacture 6/6.

The repaired run reports **626,415 tokens, 83 tool calls, 25 input repairs and
677.675 seconds**. Usage is complete for the four deliveries and unavailable for
the two early failures; this is a lower-bound run total, not a full cost comparison.
The provider budget differs as documented above. The original failed adapter run
used another 96,882 reported tokens; its cost is not erased by the repair.

Source review of the four deliveries averages **3.0625/4**. On those same four
tasks, each GLM arm averages **3.000/4**. This small unblinded difference, with two
missing frontier tasks, does not establish a general frontier advantage or parity.
Configuration and Kujo extension are similar across arms. Frontier persistence
passes both supplemental failure probes, a concrete advantage on that task.

However, frontier cleanup has a distinct correctness gap. A post-hoc actual CLI
probe with `[{"n":1e400},{"n":null}]` returns `{"duplicates":[1]}` instead of
`{"duplicates":[]}`. Parsing produces a numeric Infinity for the first value;
its JSON-stringification-based canonical key turns that into null, conflating two
different parsed values. Both GLM arms and the focused follow-up preserve the
distinction. This is a separate post-hoc check, not a retroactive change to the
frozen 33 groups. Reproduce by writing those literal bytes to an owned temporary
file and running each candidate's `node cleanup.cjs FILE`; do not create the input
with `JSON.stringify`, which would already lose the distinction.

The frontier control is therefore **incomplete and inconclusive as a full model
ranking**. It does demonstrate that the adapter fix enables real agentic work and
that frontier outputs still need independent adversarial checks.

### Better failure evidence for future requests

A separate patch after generation classifies known nested Fetch transport causes
into safe connection-timeout, DNS, network-timeout and connection-error codes.
These codes persist in execution receipts without leaking endpoint addresses,
credentials or raw upstream messages. Unknown causes retain the generic error.
No automatic replay, longer timeout or provider fallback was added. Fixture tests
prove single-dispatch behavior, error persistence, bounded cause traversal and
redaction. This improves future diagnosis; it does not retroactively identify or
claim to fix the two unknown request failures.

## Evidence audit and remaining work

Observed file-read receipts stayed within each assigned task directory; this is
not a claim of OS-level isolation. Review verdicts: baseline 6 pass; guided 5 pass
and task 4 inconclusive; repaired frontier 4 pass and 2 not requested; follow-up
pass. The frontier cleanup defect therefore also survived its same-model review.
No source answers were repaired by the controller. Source hashes, per-task usage,
execution IDs, independent groups and anchored ratings are in
[the companion JSON](engineering-judgment-2026-10-05.json).

Remaining uncertainty is narrow and explicit: the repeated-read provider/model
cause, live advisory effectiveness, the two unclassified request failures, and
transfer to larger unfamiliar repositories. The guidance treatment is not promoted.
A future comparison should use new held-out engineering tasks, the improved
transport diagnostics, and independent failure checks, rather than tuning prompts
to pass this suite. No sibling repository needs changing for these fixes.

SignalBox records only the unresolved loop-cost finding:
`cap_4ff0fd82-a7f2-4684-9627-5a4b10373ff0` /
`sig_98880f28-8e05-4b8d-8092-7fd0915204ae`. Exact and concept retrieval succeeded.
Two targeted deduplication searches found no equivalent; resolved fixes, routine
verification and generated-candidate defects were not stored as separate Signals.
The existing benchmark-isolation finding was not duplicated.

## Durable handoff

Strata consolidation saved and retrieved the transport lesson
`8d71258a-c4bb-4f3d-913f-c5314bbd5a80`, the guidance-promotion decision
`deecb95a-a5d2-4b5c-9e06-4df0c147263d`, and the session handoff
`e03f24a3-63b4-48f2-adf5-9971af113e34`. The existing project hub was updated to revision 27 with a
current-state/timeline pointer rather than duplicating prior benchmark history.

The study contains six distinct tasks, four six-task arms (including the invalid
original control) and one focused follow-up: 25 scheduled task attempts, 17 terminal
deliveries and eight failures. The excluded module-format setup pilot is additional.
These mixed model/harness counts are an execution ledger, not a model success rate.
