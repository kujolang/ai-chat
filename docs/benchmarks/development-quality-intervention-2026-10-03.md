# Development quality intervention — 2026-10-03

## Baseline and scope

Starting commit: `cb3a6b7ee4494ce905f095d2c9824fafa7854d90` on `main`.
The preceding [three-round comparison](glm-context-three-rounds-2026-10-03.md)
remains the frozen baseline: GLM-5.3 Flash through Watchdog / Ollama Cloud,
17/18 strict acceptances, all 18 functional artifact checks completed. Review
rated delivered code quality 6.5/10, supervised usefulness 8/10 and independent
production judgment 4/10. These are professional assessments, not percentages
calculated from acceptance counts.

The remaining artifact defects were numeric conversion/aggregate overflow,
unescaped structured output, memory/disk divergence after failed writes, a JSON
null request that never finished, and permission fixtures left behind after tests.
These are defects in generated prototypes, not evidence that AI Chat's own
persistence or numeric handling has those defects. Larger context fixed much of
the completion problem but did not ensure defensive programming.

## Intervention

`lib/tool-discovery.js` now supplies a bounded engineering workflow for requests
with local write or shell capabilities. It asks the agent to:

- establish acceptance criteria and contracts, consult focused docs and execute a
  minimal check before relying on unfamiliar syntax;
- test relevant boundaries, including numeric accumulation, structured values and
  output escaping;
- preserve state consistency on persistence failure and verify restart behavior
  when relevant, using isolated test data;
- review final changes, cover found bugs, restore test fixtures and rerun normal
  project checks after cleanup;
- report verified results and limitations without equating a passing happy path
  with production readiness.

`lib/server-runtime.js` passes the complete authorized catalog for this decision,
while still advertising only loaded schemas. Guidance remains present when write
or shell tools are deferred. No model names, benchmark case answers, known probe
values or special-case task detection are embedded. The instructions only apply
to requested implementation work, not every use of a shell tool.

The engineering addition is **1,905 characters / UTF-8 bytes** and has a
2,400-character regression ceiling. This is a measured character size, not a
measured token count. Base `SYSTEM_PROMPT.md` is unchanged. No extra model call,
automatic review loop, permission, dependency, timeout or public API was added.
More thorough agent-chosen tests may cost additional time/tokens; measure those
in the next experiment. Guidance is not enforcement and cannot guarantee a
quality increase. Saved executions retain their original prompts. Native Codex
and non-tool JSON execution are unchanged.

## Startup verification repair

While investigating the prior full-suite failures, an independent code defect
was reproduced: the health probe classified a timed-out response as a free port,
even after a TCP connection succeeded. A trickling or silent occupied listener
therefore triggered full runtime initialization, including creation of a database,
before failing to bind. `server.js` now treats a connected listener as occupied
on timeout/error. Connection refusal retains the existing normal-start path.
The existing wall-clock timeout is unchanged.

Both new assertions (trickled and silent listener must not create the database)
failed against the old implementation and pass with the fix. Oversized, aborted,
valid-AI-Chat and other-service responses retain their checks. This fixes a proven
startup side effect; it does not prove that every earlier timing failure had the
same cause or that model-generated code is now better.

## Next three-round comparison protocol

Do not change the six task prompts, acceptance gates, selected profile/model,
6,000 output-token reservation, verified context policy, concurrency of one,
maximum of one whole-task attempt, or per-response deadline. Use three fresh
workspace roots and new executions; record the code SHA, prompt hashes, model
and toolchain versions, context receipts and runtime settings. Do not repair
model artifacts between execution and grading. Keep old artifacts unchanged.

Report strict acceptance separately from these reviewer checks on final source:

| Dimension | Evidence required |
|---|---|
| Functional correctness | Original task contracts and independent executable checks; final source rebuilt, not a previous binary |
| Defensive correctness | Applicable invalid/edge inputs, numeric conversion and accumulation, escaped output, null/type cases and failure responses |
| State and resource safety | Failed writes keep visible and durable state consistent; restart checks; fixtures, modes and processes cleaned up |
| Maintainability | Read the delivered implementation and tests; assess complexity, conventional APIs, useful errors and compatibility |
| Completion honesty | Final claims matched to tool receipts and final artifacts; distinguish self-detected fixes from reviewer-discovered defects |

Use the same supplementary probes on the old and new artifacts. Preserve original
acceptance scores even when supplementary probes expose a defect. Record pass,
fail or not-applicable with a reason per probe; a reviewer timeout is a failure
to meet that probe, not automatic proof of a provider failure. Run fault injection
only in disposable copies/temporary storage and restore modes and stop owned
children in finally/cleanup paths. Do not run unrelated benchmarks in parallel.

Retain the previous 1–10 professional assessment scale, with explicit evidence
for any grade change. Passing extra tests supports a narrower robustness claim;
it does not alone establish senior-level judgment. Grade independent production
judgment by whether the agent anticipated material risks, tested them without
reviewer intervention, and accurately reported limitations. Report per-round and
aggregate acceptance, defect categories, quality assessment, wall time, provider
rounds and reported tokens. Distinguish generation fixes from harness fixes and
provider/environment failures. These three rounds have **not** been run as part
of this intervention; no new model-quality grade is claimed.

## Verification

- Baseline: `node --test tests/tool-discovery.test.js tests/startup-port.test.js`
  — 11/11 pass, log `/tmp/quality-baseline.log`.
- Reproduction against old server: `node --test --test-name-pattern='trickled|silent' tests/startup-port.test.js`
  — both fail on database creation, log `/tmp/quality-startup-red.log`.
- After fix: same two focused files — 15/15 pass, log `/tmp/quality-focused.log`.
- Streaming integration checks cover Ollama and OpenAI-compatible transports,
  full authorized catalog versus deferred callable schemas, guidance scope,
  preserved final output and no added provider calls.
- `node --test --test-name-pattern='engineering guidance' tests/server-routes.test.js`
  — 4/4 pass, log `/tmp/quality-routes.log`.
- First full `npm test` attempt — 519 pass, 39 fail, 3 skip. Missing Playwright
  Chromium and headless-shell executables caused the browser-related failures;
  log `/tmp/quality-full-tests.log`. Restored the documented local prerequisite
  with `npm run browser:install`; no dependency versions or test limits changed.
- `node --test tests/server-runtime.helpers.test.js tests/tool-activity-reliability.test.js tests/weekly-tool-audit.test.js`
  — 54/54 pass, log `/tmp/quality-contract-tests.log`.
- Full `npm test` after installing Chromium — **560 pass, zero fail, one
  Linux-only skip** (561 tests), log `/tmp/quality-full-tests-final.log`.
  Existing startup/fatal-error and browser timing tests pass without relaxed
  deadlines. The earlier shared-host timing failures are not all causally
  explained by the occupied-port fix.
- Local launchagent restarted gracefully only after health reported zero active
  streams and zero active/queued benchmark work. New process is healthy;
  authenticated `SMOKE_BASE_URL=http://127.0.0.1:4174 npm run smoke` passes,
  log `/tmp/quality-live-smoke.log`. Credentials loaded privately from local
  configuration. No profiles or saved chats were changed by the implementation.
- `git diff --check` passes. Startup repair committed separately as `c65ea53`.
