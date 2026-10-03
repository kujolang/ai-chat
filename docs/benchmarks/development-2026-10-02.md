# Development benchmark — October 2, 2026

Run `dev-2026-10-02-deepseek`; Watchdog / Ollama Cloud,
`deepseek-v4.1-flash:cloud`; one lane, sequential, one attempt per task.
Started 12:30:59 EDT, finished 12:38:55 EDT (7m56s). Starting commit `5f2fc1f`.
Used the existing benchmark runner against interactive port 4174 intentionally;
no provider settings changed. Writes were directed to separate ignored task
folders under `data/dev-benchmark-2026-10-02/`. The debugger fixture was seeded.
The prompt paths are not an OS sandbox. No live API deployment was requested.

## Results

| Task | Seconds | Saved receipts | Verified outcome | Chat ID |
|---|---:|---:|---|---|
| CSV Go program | 54.8 | 19 | Pass: program/fixtures, eight tests; independent rerun passed | `55ba0a64-d091-4166-bd7c-bb0d38a992a8` |
| Kujo/Go benchmark | 333.2 | 135 | Incomplete: operator stopped documentation/retrieval loop; no scripts | `c21bda61-ee1e-405c-af01-da852e5751bd` |
| Debug unfamiliar code | 17.0 | 14 | Pass: four failing assertions before fix, five passing tests after; independent rerun passed | `fddb2350-74de-4394-a6a8-4b1e8458b358` |
| Persistent HTTP API | 27.0 | 5 | Fail: introductory sentence only, no task directory/artifacts | `b9702157-860b-49f5-8aff-f7ef66d9f281` |
| Intentional timeout | 15.7 | 8 | Pass: 1s timeout retained started output; one subsequent 10s run returned started/finished with exit 0 | `fb3c57d1-f255-4db4-96a9-c55ce3564322` |
| Duplicate-file Go CLI | 13.5 | 6 | Fail: missing parent directory became fatal reconciliation | `0c1a9674-a926-433d-a839-830db6db0d79` |

Verified task completion: **3/6**, versus runner transport completion **4/6**.
These are a single run of one model, not comparative model rankings. No retries
or prompt corrections were used to improve the score. Case 2 was manually stopped
at 135 calls instead of waiting for the configured 20-minute request deadline;
it must not be represented as a natural provider timeout. Concurrent repository
verification and a browser dependency download mean these are observed latencies,
not controlled language performance measurements.

## Actionable findings

1. **Agent stalled on documentation/evidence retrieval.** Case 2 made 68
   `tool_result_read` calls, six documentation queries and broad filesystem
   searches without producing scripts. Documentation results existed and retrieval
   returned content. One filesystem search exceeded the 120s command limit and
   correctly returned a recoverable timeout. Attribution between model behavior
   and context compaction needs a controlled replay; no root cause claimed yet.
2. **False completion and incomplete failure accounting in runner.** The runner
   accepts any nonempty final content, so case 4 passes despite only saying it will
   inspect the environment. Its summary records 46 executed calls while the six
   journals contain 187 receipts (including failures and retrievals); failed runs'
   metrics are discarded in the catch path. Reported 214299 tokens is not a
   reliable whole-run usage total. Add task-specific artifact/command assertions
   and preserve failure metrics before using this harness as a quality gate.
3. **Missing-directory write incorrectly classified as unknown mutation.** In
   case 6, writing go.mod with create_dirs was blocked by extension policy. The
   next main.go write omitted create_dirs; open failed ENOENT before creating a
   file, but its generic filesystem error lacked execution_started=false and
   stopped the chat. Source: lib/local-runtime.js writeFile open catch and
   mapFsError; lib/server-runtime.js uncertain-receipt handler. This is distinct
   from the earlier read-ledger preflight fix. Reproduce failed open before adding
   a narrow non-execution classification; do not blanket-whitelist write errors.

Also: `.mod` is excluded by the write-tool extension list. Case 1 recovered using
`go mod init`; case 6 did not. Consider explicit Go-project onboarding guidance.
Generated CSV code uses float64 and accepts special numeric values; its passing
fixture tests are not proof of production-grade monetary parsing.

## Evidence and reproduction

- Suite: `benchmarks/development-tasks.md`; setup: `benchmarks/DEVELOPMENT.md`.
- Seed: `benchmarks/fixtures/discount/` (intentionally buggy).
- Runner output: `data/benchmark-runs/dev-2026-10-02-deepseek.json`.
- Per-case receipts: `data/benchmark-runs/dev-2026-10-02-case-N-receipts.json`.
- CLI log: `/tmp/ai-chat-dev-benchmark.log`.
- Independent checks: `go test -count=1 -v ./...` in case 01; `node --test` in
  case 03. Timeout evidence checked directly in case 05's saved receipts.
- No user prompts or consequential actions were replayed. No failed journal was
  rewritten to make a benchmark pass. Case 6 remains interrupted for inspection.

Added the explicit local-dev preset and runner regression coverage (11 tests
passed). Current runner behavior still includes saved runtime presets for non-none
presets: the live requests advertised 13 schemas, not just the six local-dev names.
This run therefore represents the current app configuration, not strict tool
isolation. Keep that condition fixed in comparisons or add an explicit isolation
option before comparing restricted tool sets.

Repository verification: initial npm test had 39 browser-related failures because
Playwright Chromium was absent. `npm run browser:install` restored the declared
runtime dependency; rerun npm test passed 495 of 496 tests with one platform skip
and no failures (`/tmp/ai-chat-dev-full-tests-browser.log`). No assertions were
weakened. git diff --check passed.

## Quality and attribution follow-up

Reinspection of terminal journal results identifies case 4's finish_reason as
`length`, not `stop`. The benchmark reserves up to 6000 output tokens per provider
request. This API task reached an output limit before delivering implementation;
its aggregate usage across three rounds was 6277 output tokens. Do not characterize
this as a proven voluntary model refusal or normal early stop. The benchmark runner
failed to classify truncation and did not continue it. No context compaction was
recorded in that final request, so context exhaustion is not supported as its cause.

Summing all six saved execution results (each usage_complete=true) yields 780143
reported input tokens + 34568 reported output tokens = **814711 reported tokens**.
This is cumulative provider-reported usage across rounds, not unique prompt size,
billed cost or cache-adjusted consumption. Cache details were unavailable. Case 2
accounts for 583985 tokens (71.7%) and 135/187 receipts (72.2%), producing no scripts.
The runner's 214299 total omitted both failed cases (600412 reported tokens).

Quality assessment: CSV and debugging met their explicit small-task requirements;
timeout recovery met its exact behavioral test. CSV is prototype-quality, not
production finance code. An independent input probe with NaN, Inf and a quoted
comma-containing customer returned exit 0, accepted nonfinite amounts, and emitted
an unescaped customer comma. Its eight self-authored tests do not cover those cases.
Debugging correctly reproduced the documented percentage bug before a one-line fix;
five tests passed independently. The fixture is deliberately tiny, not evidence of
large-repository debugging ability. Timeout recovery confirms one happy recovery
path, not arbitrary idempotent retry safety. No usable deliverable exists for the
other three tasks; generated-but-unwritten code is not a completed CLI.

Attribution: case 6 combines a model input omission (missing create_dirs) with an
AI Chat recovery defect that should have allowed correction. Case 4 combines output
budget exhaustion with a benchmark completion/continuation defect. Case 2 remains
unattributed between model behavior and context/evidence handling; final request
shows compaction but that alone does not establish causality. One model, one trial,
manual stall cancellation and self-authored tests prevent broad model ranking or
claims of production readiness. As a user-facing workflow this run is unreliable,
even though individual successful tasks were useful.
