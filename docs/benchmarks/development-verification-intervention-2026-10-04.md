# Development verification intervention — October 4, 2026

This intervention addresses the measured failures in the
[three-round comparison](glm-review-three-rounds-2026-10-04.md). It does not claim
higher model scores before a fresh evaluation.

## Changes

- Review's final existing round offers only the verdict tool. Rejection reasons
  identify invalid JSON, oversized collections, invalid fields or uninspected
  references without logging their values. Review has the same four-round and
  five-minute limits; writes/shell remain unavailable to reviewers.
- A bounded receipt inventory prioritizes final code writes and checks. If code
  changed after a recorded successful check, a passing advisory verdict triggers
  a bounded repair request. This does not pretend to detect shell edits or prove
  dependency coverage.
- The benchmark's existing deadline is exposed to the generic worker on every
  provider round and retained on resume. Cancellation still belongs to the caller.
- Optional `local_kujo` wraps existing authorized shell execution with explicit
  guide/check/run/test/benchmark operations, runtime detection, source fingerprints,
  and bounded pure-workload calibration. It neither bypasses permissions nor
  automatically scales/retries scripts. Kujo uses PATH, distinct from KUJO_BIN
  used by AI Chat's bridge.
- Cancelled/interrupted benchmark results inspect the execution journal for
  consumed usage and preserve incomplete accounting. They remain failed results.

The four reference examples were checked and executed on installed Kujo 1.5.0
and 1.7.0 (eight checks per runtime). Initial execution caught a 1.5-only conflict
with the name `values`; the collection example uses `samples` and passes both.
Other versions receive no claimed verified example. File/error/testing APIs
still require matching runtime docs; four examples are not a complete language
manual. JIT verification is outside this intervention.

## Evaluation protocol

Keep `benchmarks/development-tasks.md` unchanged for continuity. The new
`benchmarks/kujo-quality-tasks.md` supplies three separate transfer tasks: bounded
duration parsing, atomic inventory transfers, and persistent counter failure
handling. Prepare a fresh RUN_ROOT for each run; do not expose/read the independent
verifier during generation. Score with:

```sh
KUJO_REFERENCE_BIN=/path/to/selected/kujo node scripts/verify-kujo-reference.js
KUJO_REFERENCE_BIN=/path/to/selected/kujo node scripts/verify-kujo-quality.js RUN_ROOT
```

The independent verifier has 31 process-level checks. It checks ordinary outputs,
invalid input, conservation, persistence across processes, and controlled write
failure. It creates and removes only its own fault-injection files. Crashes and
timeouts are failures, not valid rejection. Tests run as a normal user; a host
that ignores permission bits cannot establish the write-failure check. The
verifier and prompts share a workspace, so instruction-based exclusion is not a
security boundary; use a separate evaluator workspace for stricter holdout.

For the next experiment, select exact installed/catalog model identifiers and
record them; do not assume aliases identify an unchanged model. Use separate
benchmark server instances for review-on/off controls, identical tools, runtime
versions, prompts, output limits and deadlines. Run each cell three times and
alternate order. Compare GLM, DeepSeek, and an explicitly selected frontier
reference with the same harness; report provider-specific limitations. Do not
pool the three new tasks into historical six-task scores.

Report strict completion, independent check counts, failure invariants, final
source verification, review/repair outcomes, elapsed time, and complete versus
partial usage. Preserve every failed attempt. Keep professional grades separate
from numerical acceptance. No new paid model batch or frontier comparison was
run as part of this implementation; local fixture validation precedes that cost.

## Verification record

Initial baseline: 541 passed, 39 failed, three skipped. Failures were attributable
to the missing Playwright Chromium executable. Installed the repository's pinned
Playwright browser with `npx playwright install chromium`; no dependency or
lockfile changes. The first post-change full run had one new compatibility
failure: older test servers lacked `local_kujo`. Fixed local-dev discovery to
include this optional tool only when advertised, preserving required existing
tools. Focused verification then passed 82 tests. Final receipt follows below.

Additional verification receipts:

- `node --test tests/kujo-quality-verifier.test.js tests/kujo-development.test.js`:
  nine passed, including grader negative controls (crashes/timeouts cannot count
  as valid rejection). These are verifier tests, not new model scores.
- `KUJO_REFERENCE_BIN=... node scripts/verify-kujo-reference.js`: four examples,
  eight checks each on PATH Kujo 1.5.0 and checkout Kujo 1.7.0.
- A real local-runtime fixture performed guide/check/run and three benchmark
  trials on `print(42)` successfully, with unchanged source fingerprints.
- Two final `npm test` runs each reported 599 passed, two failed, one skipped.
  Both failures were the existing five-second fatal-startup tests; isolated
  `node --test tests/startup-port.test.js` passed all eight. Several unrelated
  Rust/C compiler processes were using substantial CPU during these runs.
  Host contention is the likely explanation, not a proven runtime regression.
  No assertions or timeouts were weakened. Full serial verification is recorded
  below separately rather than relabeling the failed runs as passes.
- Restarted the idle `com.kujo.ai-chat` service. Authenticated health confirms
  `local_kujo` is available and independent review remains enabled. All seven
  provider profiles matched their pre-restart fingerprint.
- `BROWSER_EXPECTED=1 SMOKE_BASE_URL=http://127.0.0.1:4174 node scripts/smoke-test.js`
  with the existing private API token: health, provider catalog, state, browser
  availability and offline chat fixture passed. No paid model request.
- `git diff --check`: passed.

Final full-suite receipt: Node 22.17.0,
`node --test --test-concurrency=1 tests/*.test.js`: **601 passed, zero failed,
one skipped** (602 tests, 197133.774758 ms). The existing startup failure tests
passed with unchanged five-second deadlines. This is serial verification; the
concurrent-run failures above remain part of the record. Runtime implementation
commit: `52a59fd`.
