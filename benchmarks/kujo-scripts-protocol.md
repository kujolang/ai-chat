# Kujo script generation benchmark

Ten pure CLI tasks measure single-draft Kujo code generation, including invalid
input handling. They do not measure autonomous repository work or repair with
tools. Every model receives the same Kujo 1.7.0 syntax guide and task contract.
No grader, calibration implementation or acceptance cases enter model context.

Use `scripts/run-benchmark-suite.js` with `benchmarks/kujo-scripts.md`, explicit
provider profile/model selection, `--tool-preset none`, one attempt, 6000 output
tokens, a 240000 ms deadline and concurrency 1. Use fresh chat titles/run IDs.
The October 10 Hermes run intentionally uses the interactive instance so all ten
comparison chats remain available in AI Chat. No app settings are changed.

Before dispatch, inspect the authenticated Hermes model catalog. Run only profile
entries whose exact IDs are present and whose prompt and completion prices are
explicitly zero. Record absent/nonfree entries as unavailable, not coding failures.
Do not silently substitute newer models.

Pin the agent Kujo binary (not the older bridge executable), record its SHA-256,
and qualify it with `scripts/qualify-kujo-runtime.js`. Then calibrate the grader:

```sh
node scripts/verify-kujo-scripts.js calibrate RUN_ROOT/calibration KUJO_BINARY
```

All ten known-good controls must pass every case; constant-null controls must fail.
Freeze SHA-256 hashes of the suite, this protocol, `lib/kujo-script-benchmark.js`,
`scripts/verify-kujo-scripts.js`, tests, calibration receipt and runtime in
`RUN_ROOT/acceptance.json`, using `lib/acceptance-integrity.js`. Supply it to the
existing runner with `--acceptance-manifest`.

Copy the completed runner JSON to `RUN_ROOT/run.json`, then grade saved responses:

```sh
node --env-file=.env scripts/verify-kujo-scripts.js grade RUN_ROOT KUJO_BINARY
```

The grader saves raw chat evidence and extracted scripts under ignored `data/`.
It requires exactly one source block and runs each script on fresh processes,
bounded to 2.5 seconds and 64 KiB output. On macOS the process sandbox denies
networking, file writes, and reads under `/Users` and `/private/tmp` except the
exact runtime and candidate files. The child environment contains no credentials.
There is no unsandboxed fallback. This is a pure-script test harness, not a general
hostile-code isolation certification.

Every task includes positive, boundary, type/shape rejection, malformed JSON and
CLI argument-count checks plus ten deterministic extra inputs. Grading validates
exit status, JSON stdout, stderr and exact result semantics. A full task pass
requires all checks. A timeout fails remaining cases. Transport failure, missing
source and code failure remain separate report fields. Report both full tasks
passed out of ten and check totals; never equate transport completion with coding
success. Latency and token usage describe the sampled run, not general performance.

Keep acceptance assets unchanged after generation. Fixes require a new named run.
One sample per task/model is exploratory; do not claim a stable model ranking or
whole-language proficiency. The fixed 6000-token budget may truncate reasoning
models; retain and label that evidence without silently retrying them.
