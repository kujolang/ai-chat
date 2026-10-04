# Engineering judgment upgrade

Starting point: `b4f6270`, `main`, 2026-10-04. This is an ongoing implementation
record, not a completed quality-improvement claim.

## Objective and completion evidence

The requested scope is the complete follow-up to the GLM verification assessment:

| Requirement | Evidence required | Current state |
|---|---|---|
| Qualify and pin the agent runtime/backend independently of the bridge | Real runtime probes, explicit configuration, permission tests, live tool receipt | Qualified stable local 1.7.0 executable pinned; permission tests, configured tool receipt and restarted server verified |
| Define task failure invariants before implementation | Structured task-scoped contract consumed by worker/reviewer | Pending |
| Turn invariants into executable independent checks | Trusted checks, deliberate defective controls, final-source evidence | Pending |
| Supply focused runtime-verified examples | JSON, errors, files/persistence examples checked on selected runtime | Pending |
| Escape repeated debugging loops with minimal reproduction/runtime comparison | Bounded diagnostic behavior with no automatic replay of consequential work | Pending |
| Require concrete completion evidence | Final artifacts, checks and unresolved gaps linked to the task contract | Pending |
| Make review feedback actionable with bounded repair | Validation diagnostics, inspected references, checkpoint and provider integration tests | Implemented bounded submission correction; semantic repair improvements pending |
| Evaluate on fresh tasks | Frozen tasks/oracles, fresh directories, controls, quality and completion comparison | Pending; no new model benchmark run yet |

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
(`/tmp/ai-chat-runtime-pin-live.json`). No model benchmark has run on this change.
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
