# Engineering judgment upgrade

Starting point: `b4f6270`, `main`, 2026-10-04. Implementation and bounded evaluation are complete. See the
[final comparison](glm-engineering-judgment-three-rounds-2026-10-04.md) for results
and limitations; this record preserves the implementation history.

## Objective and completion evidence

The requested scope is the complete follow-up to the GLM verification assessment:

| Requirement | Evidence required | Current state |
|---|---|---|
| Qualify and pin the agent runtime/backend independently of the bridge | Real runtime probes, explicit configuration, permission tests, live tool receipt | Qualified stable local 1.7.0 executable pinned; permission tests, configured tool receipt and restarted server verified |
| Define task failure invariants before implementation | Structured task-scoped contract consumed by worker/reviewer | Implemented optional immutable engineering_contract; protocol and checkpoint tests pass |
| Turn invariants into executable independent checks | Trusted checks, deliberate defective controls, final-source evidence | Fresh transfer oracle calibrated against reference behavior and arithmetic/memory mutants; three rounds finished at frozen 690a028; 135/135 frozen checks; supplemental defect exposed |
| Supply focused runtime-verified examples | JSON, errors, files/persistence examples checked on selected runtime | Added json/errors/persistence topics; all eight qualification probes pass on selected 1.7.0 runtime |
| Escape repeated debugging loops with minimal reproduction/runtime comparison | Bounded diagnostic behavior with no automatic replay of consequential work | Two failures trigger at most three typed reminders; no tool execution or runtime switch; checkpoint tests pass |
| Require concrete completion evidence | Final artifacts, checks and unresolved gaps linked to the task contract | Receipt links required per invariant; stale/missing/failed evidence blocks advisory pass |
| Make review feedback actionable with bounded repair | Validation diagnostics, inspected references, checkpoint and provider integration tests | Implemented bounded submission correction, invariant gap repair, and explicit semantic test inspection guidance |
| Evaluate on fresh tasks | Frozen tasks/oracles, fresh directories, controls, quality and completion comparison | Complete: 9/9 frozen task passes; 8/9 after supplemental partial-write probe; comparison and confounds recorded |

## Review submission correction

Previously a malformed verdict immediately ended review as inconclusive. One
correction is now permitted per review only while its existing four-round and
five-minute budgets have room. Feedback includes a diagnostic and the exact
inspected reference choices, never rejected payload content. Another invalid
submission fails closed. Checkpoints retain the correction count. Permissions,
verdict validation, source freshness checks and repair limits are unchanged.

Tests cover valid correction, forged references, failed reads, repeated rejection,
time/round exhaustion, checkpoint resume, and OpenAI/Ollama protocol integration.
Provider integration tests also verify usage accounting and no repeated writes.

## Runtime qualification

`scripts/qualify-kujo-runtime.js [executable] [default|interpreter]` runs trusted
repository probes in a temporary directory, records the resolved executable and
SHA-256, checks compiler status and exact expected output, and exits nonzero on
failure. It neither installs nor switches runtimes. Hashes are verified again at
completion; this is a diagnostic, not a race-proof execution sandbox.

`tests/fixtures/kujo-runtime/nested-arithmetic.kujo` is a small arithmetic
reproducer derived from the observed benchmark failure, with no benchmark answer
or task-specific parsing contract included. On the installed 1.5.0 default VM it
fails with `bool * int`; unchanged source prints `12` on 1.5.0 interpreter and
1.7.0 default backend. The compiler/register root cause remains unisolated.

| Actual runtime | Probes passing | Qualification |
|---|---:|---|
| 1.5.0 default VM | 4/5 | Failed |
| 1.5.0 interpreter | 5/5 | Passed |
| 1.7.0 default VM | 5/5 | Passed |

Passing these probes does not certify all language behavior. The local instance
now pins a repository-local copy under ignored `data/toolchains/` using
`AI_CHAT_AGENT_KUJO_BIN`, `AI_CHAT_AGENT_KUJO_SHA256`, and backend `default`.
The bridge is unchanged. Agent shell commands named exactly `kujo` use the pin;
explicit other executable paths retain their original behavior. The SHA is
checked before each invocation after permission validation. Backend selection
applies to structured run/benchmark; shell arguments stay literal.

The configured local tool ran the regression source and returned `12` on 1.7.0,
with pinned executable metadata (`/tmp/ai-chat-pinned-tool-receipt.json`). Server
restart health passed; all seven profile IDs remain, streams/queue idle
(`/tmp/ai-chat-runtime-pin-live.json`). At this checkpoint no model benchmark had yet run on this change.
The qualification report is `/tmp/ai-chat-pinned-qualification.json`.

Runtime integration checks: 52/52 focused local/tool tests; full serial suite
611 passed, 0 failed, 1 skipped (`/tmp/ai-chat-runtime-pin-full.log`). The later
guide-warning test passed with its 8-test module separately. A test path assertion
was corrected to compare canonical realpaths on macOS. The first health request
was made before server readiness; the subsequent request succeeded. The profile
check initially compared absent JSON fields against undefined JS properties;
corrected to verify the seven actual profile IDs, not claim model-field coverage.

## Verification receipts

- Baseline: Node 22.17.0 `node --test --test-concurrency=1 tests/*.test.js`:
  601 passed, 0 failed, 1 skipped (`/tmp/ai-chat-judgment-baseline.log`).
- `node --test tests/engineering-review.test.js`: 17/17 passed.
- `node --test --test-name-pattern='review corrects|review verdict control' tests/server-routes.test.js`:
  4/4 passed (`/tmp/ai-chat-review-correction-tests.log`).
- `node --test tests/kujo-runtime-qualification.test.js`: 4/4 passed, including
  wrong-output, compiler-error, signal, timeout and executable-change negative controls.
- Real qualification JSON: `/tmp/ai-chat-kujo-15-default.json`,
  `/tmp/ai-chat-kujo-15-interpreter.json`, `/tmp/ai-chat-kujo-17-default.json`.
- Post-change full serial suite: 608 passed, 0 failed, 1 skipped
  (`/tmp/ai-chat-judgment-milestone-full.log`). The additional executable-change
  test was added after that file loaded; its final 4-test suite passed separately.
- The first post-change run exposed one expected contract assertion needing an
  update: interrupted review now gets its one correction call. The updated test
  asserts round 3/4, diagnostic feedback, no writable tools, no replayed writes,
  and no calls after terminal replay. No assertion was disabled.

No model-quality increase is claimed from fixture tests or runtime probes.

## Contract, diagnostics and fresh evaluation preparation

`ENGINEERING_CONTRACT_ENABLED=1` adds immutable task invariants and real executable
evidence links to the opt-in generic engineering review loop. Receipt completeness
is enforced, not semantic correctness: the reviewer still inspects code and test
assertions. Plan/evidence protocol grants no execution rights; mixed batches run
nothing. Late plans are disclosed. Checkpoints preserve plans and diagnostic
notification limits. Old checkpoints retain their previous behavior.

`benchmarks/judgment-transfer-tasks.md` freezes three new transfer tasks: exact
decimal batch totals, atomic score batches, and a persistent HTTP entry service.
`scripts/verify-judgment-transfer.js` independently tests process output, strict
rejections, boundaries, disk preservation, visible-state preservation after failed
writes, recovery, concurrent updates, restart and corrupt-state refusal. Reference
fixtures are test-only and never supplied as model context. Negative controls
prove arithmetic errors and memory-before-commit mutations are detected; process
crashes/timeouts cannot count as proper validation.

Verification: contract/review/diagnostics module tests passed; three OpenAI/Ollama
protocol tests passed; fresh verifier calibration tests 3/3 passed. Full serial
application suite 622 passed, 0 failed, 1 skipped before adding the standalone
verifier tests (which passed separately). Expanded real reference examples passed
on 1.5.0 default, 1.5.0 interpreter and pinned 1.7.0 default. The full 1.5.0 VM
qualification still intentionally fails the nested-arithmetic regression.

At this checkpoint fresh evaluation was pending. Final measured results are in the comparison report.

## Failed live preflight and transport correction

The first fresh live attempt at `cfa8d50` exposed an application regression before
meaningful implementation: contract tool replies were constructed in OpenAI wire
format even for Ollama-native requests. The next provider request returned HTTP
400. Three first-round responses and two second-round responses failed; the
remaining second-round request was cancelled, and the orchestrator was stopped.
Artifacts remain under `data/benchmark-runs/judgmentglm*`. These are infrastructure
failures, not model reasoning grades; no generated artifact was repaired.

The handler now calls the existing providerToolCallMessage/providerToolResultMessage
helpers, preserving native argument objects, tool_name and reasoning fields.
Regression coverage now configures an actual custom Ollama-native endpoint and
asserts request message shapes. The earlier fixture returned Ollama responses
while using an OpenAI request configuration, which failed to catch the defect.
The corrected native/OpenAI protocol tests pass. Invariant IDs now accept
uppercase labels and publish the same pattern the validator enforces.

The replacement evaluation used fresh IDs/directories, one attempt per task,
and 12,000 output tokens versus the historical 6,000. This and the new tasks/
runtime prevent attributing score changes solely to improved reasoning guidance.

Transport correction verification: full serial suite 626 passed, 0 failed, 1 skipped (`/tmp/ai-chat-contract-wire-full.log`). The replacement task text explicitly states no extra top-level persisted service fields, matching the prewritten oracle; this clarification precedes the replacement run.

## Follow-up fixes isolated during the frozen evaluation

The evaluation source stays at `690a028`. The following fixes were prepared in an
isolated worktree and were not part of that batch's model results, and were merged after generation finished:

- `fc06a80`: direct Kujo calls used the qualified pin, but Node/Go child processes
  still found 1.5.0 through sanitized PATH. Local commands now inherit a private
  `kujo` alias and KUJO_BIN for the qualified executable. Hash/alias validation
  occurs after permission checks; missing/replaced pins fail closed. Runtime
  close and process exit clean the alias. Real before/after probes demonstrated
  direct/nested versions 1.7/1.5 becoming 1.7/1.7. The bridge stays independent.
- `fc9cc68`: review freshness previously recognized `node --test` but missed a
  contract-linked `node test.js`. Inventory now includes declared executable
  receipts, order, bounded stdout/stderr tails and truncation flags. Later writes
  still invalidate freshness; exit zero is still not semantic coverage proof.
- `90471c8`: round 2 task 1 and round 3 task 2 completed on the server, but large terminal
  events exceeded the 262,144-byte pending-output cap (306,018 and 313,046
  attempted buffered bytes). Audit logged a slow
  consumer detach even though a single large result caused it. Terminal delivery
  now writes bounded chunks with backpressure and no heartbeat interleaving;
  fields, UTF-8 bytes, journal persistence and ordinary queue limits remain.
  Failed benchmark delivery remains failed; journal status is recorded separately.
- `a0a34cd`: reviewers sometimes invented citation IDs or exceeded verdict arrays.
  The review schema now lists only successfully inspected reference choices and
  the prompt repeats its existing 12-item bound. Validation and correction/repair
  budgets remain unchanged; this does not guarantee model compliance.

Candidate checks: 633 passed, 0 failed, 1 skipped before the final citation-schema
change; the latter passed 21 focused module tests and seven protocol tests.
The initial isolated run lacked a worktree-local node_modules path, breaking two
browser/static-asset tests. Restoring the dependency link resolved both without
changing their assertions/timeouts. Tests overlapped live generation, so host load
is uncontrolled and latency is descriptive rather than a causal speed claim.

Benchmark artifacts and later full verification are recorded in the final
comparison report; no generated benchmark source is repaired by the evaluator.

## Final verification and handoff

The complete application suite passed **636 tests, 0 failed, 1 skipped** using
Node 22.17.0 (`node --test --test-concurrency=1 tests/*.test.js`, log
`/tmp/ai-chat-judgment-complete-full.log`). Server restart, seven unchanged provider
configurations, and intact replay of both previously failed results passed;
zero tools were repeated and peak buffered output was 65,560 bytes.

The frozen independent oracle passed 135/135 checks, but a calibrated supplemental
partial-write probe demonstrated one generated service falsely acknowledging a
corrupt disk write. Broader acceptance is therefore 8/9. The probe and two
calibration controls are committed; generated benchmark artifacts remain unchanged.

Remaining work is model/workflow qualification, not a hidden test regression:
measure matched-task token efficiency and reviewer reliability after the follow-up
fixes. No frontier comparison or production-readiness claim is established.
The pre-existing Kujo 1.5 VM root cause remains outside this repository's scope.
