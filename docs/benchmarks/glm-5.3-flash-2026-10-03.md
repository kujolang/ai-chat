# GLM-5.3 Flash development suite — October 3, 2026

Run `dev-2026-10-03-exhaustion-glm1` independently verified **5/6 (83.3%)**.
The five delivered artifacts/tasks meet the original bounded criteria; Kujo/Go
failed before creating programs. This is the first full GLM run in this series.

## Controls

Starting checkout `17f11465f48382b9fde9208cfe06f611e0493166` on main, clean;
production source remains `c7e001f`. Model `glm-5.3-flash:cloud`, profile
**Watchdog / Ollama Cloud**, preserving account routing. Six original tasks,
fresh assigned directories, original buggy discount seed, no prior-answer reads,
no added Kujo guide. Prompt text matches DeepSeek G byte-for-byte after replacing
the assigned directory. Local-dev tools, 6,000 requested output tokens, concurrency
one, one attempt, 1,200,000ms runner deadline. No generated artifact repairs by
the reviewer, no production/configuration edits or server restart.

**Comparison limitation:** current GLM setup uses `conservative_default` 65,536
context allowance (59,536 after output reservation), as verified in the first
execution's budget receipt. Recent DeepSeek E/F/G used its explicit 1,048,576
allowance. Ollama's public `/api/show` for `glm-5.3-flash:cloud` returned
`general.architecture=glm5_next` and `glm5_next.context_length=1048576` on October 3.
The app's smaller allowance is a configured application policy, not the model's
advertised capacity. This is an as-configured GLM suite; it is not a context-matched
model ranking. No configuration was silently changed during the run.

## Reproduction

Use `benchmarks/development-tasks.md`, replacing assigned directories with fresh
paths and seeding task 03 from `benchmarks/fixtures/discount`. Restrict reads of
previous generated benchmark answers as in the prior full runs. With configured
local auth and Node 22:

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-03-exhaustion-glm1/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model glm-5.3-flash:cloud --tool-preset local-dev \
  --require-instance-role any --title-prefix EXH20261003GLM1 \
  --run-id dev-2026-10-03-exhaustion-glm1 \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

Raw evidence stays in ignored `data/benchmark-runs/`; generated files in
`data/dev-benchmark-2026-10-03-exhaustion-glm1/`. No credentials or private reasoning
are included in committed evidence. Independent CPU-heavy checks wait until
model timing trials finish.

## Results and comparison

| Task | GLM result | Duration | Receipts | Independent evidence |
|---|---|---:|---:|---|
| CSV Go utility | Pass | 77.652 s | 15 | 5 tests; compiled fixture totals verified |
| Kujo/Go benchmark | **Fail** | 123.754 s | 91 | No source artifacts; terminal unadvertised tool name |
| Debug fixture | Pass | 60.693 s | 15 | 1 pass/5 fail before fix; 6 pass after and independently |
| Persistent HTTP API | Pass | 82.580 s | 21 | 26 tests; extra real-process restart passes |
| Intentional timeout recovery | Pass | 18.929 s | 9 | Correct short timeout/long retry after initial path mistake |
| Duplicate-file CLI | Pass | 107.062 s | 30 | 9 tests; repeated JSON and actual SHA-256/size/order checks |

Independent generated tests: **46 passing** (5 + 6 + 26 + 9). Model-authored
checks alone were not used as the acceptance decision. Extra quality probes below
do not retroactively change the original rubric; they limit production suitability.

| Full suite | Verified | Wall time | Reported tokens | Receipts | App context allowance |
|---|---:|---:|---:|---:|---:|
| DeepSeek E | 6/6 | 965.052 s | 2,586,064 | 174 | 1,048,576 |
| DeepSeek F | 6/6 | 393.980 s | 2,912,002 | 198 | 1,048,576 |
| DeepSeek G | 6/6 | 439.833 s | 2,751,433 | 174 | 1,048,576 |
| **GLM 1** | **5/6** | **498.222 s** | **1,614,709** | **181** | **65,536** |

GLM recorded 135 provider rounds, zero automatic whole-task retries and zero input
repair-counter events. Lower reported usage does not establish efficiency: one
task failed, context policies differ, and the generated implementations differ.
Reported tokens sum repeated inputs; they are not unique context or billed cost.
The whole-run duration includes setup/between-task overhead. Per-task durations
sum to 470.670 seconds.

[Prior DeepSeek comparison](development-repeat-g-2026-10-03.md).
[Prior model assessment and complete DeepSeek history](overall-assessment-2026-10-03.md).
This adds one GLM suite; it does not change DeepSeek's historical score or count
as a failed DeepSeek repeat.

## Kujo failure: exact boundary and uncertainty

Execution `59bd8064-44a1-4352-a834-3ffabc80a6a3` made 91 recorded calls,
including 24 `tool_result_read` calls, across 68 provider rounds. It wrote no
programs. It searched docs/examples and runtime source, encountering incorrect
shell arguments, unreadable source paths and invalid saved-result read arguments.
The final request invented **`tool_result_ref_read`**, which was not advertised or
connected. AI Chat returned **`tool_execution_unavailable`**, marked the execution
interrupted, and executed none of that invalid requested tool batch. This is not
a shell timeout, permission denial, output-continuation failure or proof of
invalid Kujo program syntax; no program reached the compiler.

Final recorded context estimate was 59,161 under the 59,536 input allowance. The
small default allowance and repeated evidence reads are relevant context, but the
immediate verified cause is the unavailable tool name. It is not established that
a larger window would prevent it. This task consumed 908,325 reported tokens,
about 56% of the suite total, without a deliverable.

Eight failed tool receipts exist across the suite: two unreadable paths, three
invalid saved-result read arguments, one file edit lacking the required prior read,
and two timeout receipts. The terminal unknown tool request is separately rejected
before a tool executes. Nonzero subprocess exits include expected negative tests
and genuine command mistakes; they are not all terminal app failures.

A fairer model comparison should add a verified GLM context entry and rerun the
same suite at a matched allowance, retaining this adverse as-configured result.
That configuration follow-up was not silently applied during this experiment.

## Quality assessment of delivered work

### CSV: useful fixture implementation, unsafe numeric edge cases

The program validates the `customer,amount` header, reads records incrementally,
reports invalid rows and prints sorted totals. The fixture independently prints:

```text
alice 45.97
bob 5.00
carol 7.25
```

However, it parses float64 then converts rounded cents to int64 without finite or
range checks. Independent `NaN`, `Inf` and `1e20` inputs each produce
`-92233720368547760.00` with exit 0 on this runtime. A wrong header correctly
returns exit 1. Accumulating integer cents does not eliminate unsafe conversion
or overflow. This is similar to weaknesses in prior DeepSeek artifacts.
The final narrative also says Bob's only row was skipped despite a valid Bob 5.00
row and output. Numeric execution evidence is stronger than that prose claim.

### Debugging: correct minimal repair

The model adds six regression cases and demonstrates five failing against the
original seed. It changes `percent` to `percent / 100` without changing the
interface. All six independently pass. This is a small seeded bug, not evidence
of large-codebase debugging ability.

### API: broad happy-path coverage, weak exceptional storage handling

Twenty-six tests pass, covering CRUD, validation, malformed JSON, body bounds,
HTTP status/method behavior and restart persistence. The generated restart test
closes/recreates server objects in one process. A reviewer separately spawned,
terminated and restarted real Node child processes: updated records persisted,
deleted records stayed absent, and all children were cleaned up.

Storage writes a temporary file then renames, but synchronous I/O blocks the
process and state is mutated before persistence succeeds. No multi-process or
power-loss durability was established. A controlled reviewer probe makes the
expected temporary-file path a directory, forcing EISDIR on save: the HTTP request
returns 500, then the server exits **1** because its error handler emits an
unhandled Server `error` event. The disk keeps the prior single record. This is a
verified flaw in the generated prototype, not a change to AI Chat's own server.
It needs correction before production use; the original task rubric did not
include storage-failure survival.

The model also corrected a Node test-directory invocation and performed a
4-second bounded startup smoke of the server (terminated by the tool deadline).
That timeout was not a failed API task; subsequent cleanup found no server process.

### Timeout recovery: passed with a repaired path mistake

The first invocation doubled the workspace-relative script path under an already
selected working directory and failed `MODULE_NOT_FOUND` before executing it.
After correcting the argument to `sleep5.js`, the 1,000ms request timed out after
1,025.438ms with `started`. Exactly one 10,000ms retry succeeded after 5,271.109ms
with `started` and `finished`. The script has only console output and a timer,
so this satisfies the requested harmless timeout/retry behavior. Three shell
invocations attempted the script; only two actually ran it.

### CLI: working deterministic tool

Nine tests pass. Streaming SHA-256 hashing handles empty/nested files, duplicate
contents, and unreadable paths with warnings or a strict failure mode. Fixture
permissions are restored. The compiled program's two JSON runs are identical:
seven files/71 bytes scanned, two duplicate groups of two files each, no warnings
once permissions are restored. Actual file bytes match all reported hashes and
sizes; group hashes and member paths are sorted. Empty-file duplicates are included.

The model recovered from invoking `go -l .` rather than the formatting command
and `go ./dupscan fixtures` rather than the compiled binary. Expected usage,
missing-root and strict unreadable-path exits were exercised. It hashes every
regular file rather than prefiltering by size; no performance claim was measured.

Overall: useful supervised prototypes, with a failed unfamiliar-language workflow
and meaningful review findings. One confounded run is insufficient to rank GLM
below DeepSeek as a general coding model.

## Verification receipt

- Case 01: `go test -json -count=1 ./...`, build reviewer binary, execute supplied
  fixture and extra numeric/header probes; five tests pass, weaknesses reproduced.
- Case 03: `node --test`; six pass. Original receipts prove five failures before fix.
- Case 04: `npm test`; 26 pass. Reviewer real-process restart and forced-write-failure
  probe; persistence passes, fault crashes child as described. No live app data touched.
- Case 05: inspect actual shell receipts and script; no unnecessary rerun of timeout.
- Case 06: `go test -json -count=1 ./...`; nine pass. `./dupscan -json fixtures`
  twice; exit 0, identical output, Python SHA-256/size/order assertions pass.
- Receipt scope audit: file-tool writes stay in assigned directories; no prior
  generated-answer file reads observed. This is not OS sandbox isolation proof.
- Authenticated `SMOKE_BASE_URL=http://127.0.0.1:4174 npm run smoke` under Node 22:
  health/providers/state/chat 200, eleven providers; `/tmp/glm1-smoke.log`.
- Comparison arithmetic, prompt equivalence and `git diff --check`: pass.

Independent logs/manifests: `data/benchmark-runs/glm1-independent-*` and
`glm1-cli-repeat.json`. The unchanged application's last full test result remains
540 pass/one Linux-only skip; that suite was not rerun for this benchmark-only change.

[Sanitized machine-readable results](glm-5.3-flash-2026-10-03.json).
