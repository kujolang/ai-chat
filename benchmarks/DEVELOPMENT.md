# Development task benchmark

`development-tasks.md` contains six executable development tasks, not prose-only
questions. `local-dev` explicitly enables local read/write/shell and documentation
tools. Requires local tools, writes and shell enabled on the target server.

The checked-in prompts are the October 2, 2026 run snapshot. Before another run,
copy the suite and replace its `data/dev-benchmark-2026-10-02/NN` paths with a fresh
run directory relative to the configured workspace. Seed case 03 from
`benchmarks/fixtures/discount/`; it intentionally violates its documented contract.
Do not repair that seed before asking the model to debug it. Other cases start empty.
Use unique titles/run IDs to prevent the runner reusing prior responses.

Example (credentials supplied through API_AUTH_TOKEN, never command arguments):

```sh
npm run benchmark:run -- --tests benchmarks/development-tasks.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --concurrency 1 --max-attempts 1 \
  --stream-timeout-ms 1200000 --title-prefix 'DEV20261002 ' \
  --run-id dev-2026-10-02-deepseek
```

`any` intentionally targets the interactive instance with its real provider settings.
Prefer a dedicated benchmark instance when available. Paths constrain the prompt,
not the operating system: local shell is not sandboxed. Do not run untrusted suites.
The overall runner deadline is distinct from each shell command's deadline.

A successful stream is not proof of task success. Review saved execution receipts,
inspect generated files, rerun their tests, and check outputs against the prompt.
Keep raw responses and execution artifacts under ignored `data/`; record sanitized
results, limitations, chat IDs and reproduction steps in a report.

Runner reports `transport_completion_rate`; `task_completion_rate` is null until
independently graded. Explicit length/max_tokens endings and nonterminal EOF are
failures. Error-event usage and partial response evidence are retained. Tool-enabled
runs never automatically retry a whole request, even when max-attempts is greater
than one. At the runner deadline it requests server cancellation instead of merely
dropping the connection. A completed transport still needs artifact/test review.

## Engineering judgment comparison

The six-task `engineering-judgment-tasks.md` suite adds integration, resource
ownership and failure judgment. It contains five Node tasks and one Kujo task;
it is not a replacement for the Kujo collection/scaling suite.

Prepare separate fresh directories for baseline and guidance treatment:

```sh
node scripts/prepare-engineering-evaluation.js data/engineering-round/baseline
node scripts/prepare-engineering-evaluation.js data/engineering-round/guided --guidance
node --test tests/engineering-evaluation.test.js
```

Run each generated `suite.md` through `benchmark:run` using a dedicated instance,
`local-dev`, the same exact model/profile, 12000 response tokens, one attempt,
900000 ms stream deadline and concurrency 1. Pass an acceptance manifest covering
the generated suite, seeds, verifier, calibration fixtures and protocol. Freeze it
before generation; validate it again before invoking:

```sh
node scripts/verify-engineering-evaluation.js data/engineering-round/baseline /absolute/path/to/qualified/kujo
```

The verifier returns named check-group outcomes. It runs generated entry points in
bounded child processes, kills remaining process-group members on POSIX and uses
owned temporary state. It is not an OS sandbox for untrusted code. The independent
Kujo positive control is `tests/fixtures/engineering/main.kujo`; qualify its six
case groups against the selected binary before a live comparison. Ordinary tests
exercise portable Node controls without requiring Kujo to be installed.

Keep oracle assets out of builder context. Separate successful delivery from file
correctness, and inspect final source/tests before assigning anchored qualitative
scores. See `engineering-evaluation-protocol.md` for the frozen decision rule,
limitations and guidance promotion criteria. A frontier comparison must use the
same tool harness; a native Codex run changes both the model and harness.

A verifier success requires an explicit per-case assertion-completion receipt;
a zero exit from an unresolved promise is not a pass. After generation, optional
supplemental resource-failure checks can be run with:

```sh
node scripts/verify-engineering-failure-edges.js data/engineering-round/baseline/03/store.cjs
```

Report these separately from the frozen 33 groups. The October 5 engineering
comparison and grading corrections are in
[`docs/benchmarks/engineering-judgment-2026-10-05.md`](../docs/benchmarks/engineering-judgment-2026-10-05.md).

## Kujo maintenance with independent repair feedback

The opt-in controller uses six Kujo maintenance fixtures and separate development
and holdout cases. It is an experiment workflow, not a global chat completion gate.
Only development failures reach a repair request. Holdouts remain controller-only;
the same-model review is still advisory. Read [the frozen protocol](kujo-maintenance-protocol.md).

Use an already configured **dedicated benchmark instance**, with the selected
provider profile, local tools and qualified Kujo executable available. Supply app
credentials through the environment. Use fresh directories for every model/arm:

```sh
node --env-file=.env scripts/run-kujo-maintenance-evaluation.js \
  --base-url http://127.0.0.1:4198 \
  --root data/maintenance-glm-baseline --mode baseline \
  --provider-profile 'Watchdog / Ollama Cloud' --model glm-5.3-flash:cloud \
  --kujo /absolute/path/to/qualified/kujo --kujo-sha256 QUALIFIED_SHA256
```

Repeat with another fresh root and `--mode feedback`. Its initial draft is the
pattern-guidance measurement; its final draft adds at most two development-driven
repair passes. This paired comparison does not count as two independent model runs.
`--mode patterns` is available when only the guidance treatment is wanted.
The 15-minute task budget limits further admission and remaining stream allowances;
setup, cancellation/reconciliation and controller teardown add wall-clock overhead.
Per-repair stream allowances are at most five minutes. Transport failures are not
retried. Reports include the cost of initial and repair requests separately; sum
both when comparing treatments. An incomplete initial delivery is never called a
successful task merely because some seed behavior passes.

The runner refuses a mismatching executable SHA and requalifies all examples before
model dispatch. Offline controls can be repeated with:

```sh
KUJO_REFERENCE_BIN=/absolute/path/to/qualified/kujo \
  node --test tests/verified-repair.test.js tests/kujo-maintenance-evaluation.test.js
```

Change only `--model`/`--provider-profile` and fresh roots for a later DeepSeek run;
there are no GLM-specific runtime branches. Preserve the same specs, checks, runtime
and settings. Prompt/hash boundaries are not an OS sandbox; use trusted candidates
and owned fixtures. Never point this evaluator at production data.
