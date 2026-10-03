# GLM-5.3 Flash after context corrections: three rounds

**Strict acceptance: 17/18 (94.4%), with rounds of 5/6, 6/6 and 6/6.**
All 18 streams completed and all 18 functional artifact checks passed. The
first CLI left a mode-000 fixture directory behind, breaking the final recursive
Go test command. That is retained as a failed verification gate, not repaired or
rounded up to three clean 6/6 rounds.

The largest improvement is Kujo/Go: **3/3 independently verified completions,
versus 0/4 before**. No new attempt ended with context exhaustion, unavailable
tools or output-continuation exhaustion. There were still intermediate command,
syntax, path and permission errors, plus the expected timeout exercises; the
agents recovered without reviewer intervention.

## Full comparison

| Configuration / round | Accepted | Transport | Suite elapsed | Reported tokens | Tool receipts | Provider rounds |
|---|---:|---:|---:|---:|---:|---:|
| Old 65K — 1 | 5/6 | 5/6 | 8m 18.222s | 1,614,709 | 181 | 135 |
| Old 65K — 2 | 5/6 | 5/6 | 17m 22.505s | 1,315,515 | 164 | 111 |
| Old 65K — 3 | 5/6 | 6/6 | 7m 13.363s | 1,295,841 | 162 | 114 |
| Old 65K — 4 | 4/6 | 4/6 | 21m 11.551s | 3,277,177 | 350 | 248 |
| Corrected 1M — 1 (overall 5) | **5/6** | 6/6 | 12m 36.282s | 2,624,622 | 192 | 108 |
| Corrected 1M — 2 (overall 6) | **6/6** | 6/6 | 14m 22.724s | 5,493,813 | 215 | 164 |
| Corrected 1M — 3 (overall 7) | **6/6** | 6/6 | 13m 35.735s | 5,769,061 | 228 | 156 |

| Measure | Four old rounds | Three corrected rounds |
|---|---:|---:|
| Accepted tasks | 19/24 (79.2%) | **17/18 (94.4%)** |
| Completely accepted suites | 0/4 | **2/3** |
| Kujo/Go tasks | 0/4 | **3/3** |
| Other tasks | 19/20 | 14/15 |
| Transport completions | 20/24 | **18/18** |
| Total suite elapsed | 54m 5.641s | 40m 34.741s |
| Mean suite elapsed | 13m 31.410s | 13m 31.580s |
| Reported tokens, total | 7,503,242 | 13,887,496 |
| Reported tokens, mean per suite | 1,875,811 | 4,629,165 |

Acceptance improved by **15.3 percentage points**, but reported token use per
suite grew approximately **2.47×**. Average elapsed time was essentially unchanged.
This is better completion at materially higher context/usage volume, not a
measured speed or cost optimization. Usage includes repeatedly supplied inputs;
it is neither unique context size nor a monetary bill. Failing old runs also
stopped work early, making efficiency-per-success comparisons especially fragile.

All GLM history now totals **36/42 strict acceptances (85.7%) across seven full
rounds**, with two completely accepted suites. Preserve the original four-round
baseline rather than replacing it with the better configuration. DeepSeek totals
are unchanged. [Old baseline](glm-four-rounds-2026-10-03.md).
[Sanitized machine-readable evidence](glm-context-three-rounds-2026-10-03.json).

## Controls and scope

Starting checkout: `03753c138b25d19925ab6e2018e83e8d775dfa60`, clean `main`.
Production implementation: `3a492d8f4d68da0c047328ad12ab0b9e09c76d46`.
No runtime, prompt, profile, configuration or generated-source edits by the
reviewer during these runs. No server restart, added Kujo guide, manual repairs,
whole-task retries, model substitutions or discarded attempts.

All runs used Watchdog / Ollama Cloud, `glm-5.3-flash:cloud`, local-dev tools,
6,000 requested output tokens, concurrency one, one attempt per case and a
1,200,000ms per-response runner deadline. Fresh output roots and original buggy
discount fixtures were supplied. All three prompt sets match the baseline after
normalizing directory names. The runner created 18 new chats.

All 18 final budget receipts show a known **1,048,576** context allowance with
**1,042,576** reserved for input and 6,000 for output. The context correction also
changed tool-evidence retention and local ingress limits; the system prompt now
asks for revalidation after final edits. This before/after experiment tests that
combined configuration, not one isolated variable. UTF-8 byte budgeting remains
a conservative estimate, not vendor tokenization.

Go 1.27.1 and the default Kujo 1.5.0 binaries had unchanged hashes before and after
each suite. Round 1 selected the separately installed Kujo 1.7.0 release VM;
rounds 2/3 selected Kujo 1.5.0 interpreter mode. The 1.7.0 binary hash also remained
unchanged between a round-1 checkpoint and final review. The old baseline included
an external Go 1.25.3→1.27.1 transition. This shared host is not a hermetic timing
environment. Independent compiler/runtime checks ran after all timed suites.

Receipts were audited for file-tool write scope and foreign benchmark references;
no successful prior-answer reads or out-of-scope file-tool writes were observed.
Prompt restrictions and receipt audits are not an OS sandbox guarantee.

## Per-task verification

| Task | Corrected 1 | Corrected 2 | Corrected 3 | Evidence |
|---|---|---|---|---|
| CSV Go program | Pass | Pass | Pass | Final tests, builds, independently supplied valid/invalid CSV totals |
| Kujo + Go | Pass | Pass | Pass | Final sources rebuilt, 48 boundary invocations, real five-trial receipts and checked medians |
| Debug fixture | Pass | Pass | Pass | Failing tests before minimal fix; final tests independently pass |
| HTTP API | Pass | Pass | Pass | Final tests; separate child-process restart preserves updates and deletions |
| Intentional timeout | Pass | Pass | Pass | Actual partial `started`, then exactly one successful long retry |
| Duplicate CLI | **Verification fail** | Pass | Pass | All source builds and independent hash/order fixtures pass; first recursive test discovery fails |

There are **109 passing model-authored tests**, including subtests: 35, 45 and 29
per round. This is not a coverage or code-quality score. Round 1's CLI package
passes its 12 tests but the recursive command returns failure; the passing count
does not hide that setup failure. All three reviewer CLI fixtures independently
verify five files, two duplicate groups, four duplicate members, exact SHA-256
hashes, sizes, sorted paths and identical repeated output.

### The remaining acceptance failure

Round 1's CLI ran its tests and build successfully, then chmodded
`fixtures/locked.txt` and `fixtures/lockeddir` to `000` for its unreadable-path
exercise. It did not restore them. On the final tree:

```text
go test -json -count=1 ./...
pattern ./...: open fixtures/lockeddir: permission denied
FAIL ./... [setup failed]
```

This command exits 1. `go test -json -count=1 .` passes all 12 tests, and a fresh
build plus independent CLI fixture succeeds without changing any source or
permissions. The implementation works; workspace cleanup and final recursive
verification are incomplete. Unlike the old fourth-round CLI failure, this is
not a compile regression or context termination. Neither outcome is silently
converted into a clean pass. The original artifacts remain untouched.

### Kujo/Go recovery and evidence

All three final implementations agree with independent prime counts at
0, 1, 2, 3, 4, 10, 49 and 1,000. Round 2 deliberately counts inclusively; rounds
1/3 count strictly below N, and each pair agrees with its documented contract.
Go was compiled before trials, with compilation measured separately.

Largest shared workload with five recorded trials per language:

| Round | Mode / workload | Kujo compute median | Go compute median |
|---|---|---:|---:|
| 1 | Kujo 1.7 VM, trial division, N=100,000 | 5,036.370 ms | 13.976 ms |
| 2 | Kujo 1.5 interpreter, sieve, N=999,999 | 15,287.908 ms | 49.030 ms |
| 3 | Kujo 1.5 interpreter, sieve, N=1,000,000 | 9,176.346 ms | 55.012 ms |

These are verified generated benchmark results, not general language rankings.
Algorithms, runtime versions/modes and shared-host load differ. Round 1 ran 40
measurement trials, round 2 ran 35 and round 3 ran 30, excluding probes/warmups.
The medians agree with receipts. No unmatched claimed receipt IDs were found in
these 18 responses; this narrow check does not validate every narrative claim.

Round 2 spent a full 120-second timeout on a large array-building probe before
changing strategy. Rounds 2/3 encountered errors in default Kujo 1.5 VM execution,
then completed using interpreter mode. Round 3 also repaired a genuine off-by-one
in both programs. The recorded errors support recovery ability; the model's more
specific explanations of compiler internals were not independently established.
No current Kujo release bug or fix is inferred from an older runtime's failure.

## Quality beyond the original acceptance rubric

These probes are reported separately, as in the old baseline; the benchmark's
six-task score is not a claim of production robustness.

- **Numeric safety remains weak.** All three CSV implementations overflow the
  accumulated total for 9,500 individually accepted `9999999999999.99` rows and
  exit 0 with a negative result. Round 2 also accepts `1e20` into an invalid negative
  int64 total. Round 3 overflows decimal-to-cents multiplication on
  `92233720368547758.08`, printing `A --92233720368547758.-8` with exit 0.
  All three reject NaN/Infinity. Round 1's comma-separated output does not escape
  a comma-containing customer, producing `A,B,1.00`; other rounds use text output.
- **Persistence failures are not transactional.** Each API returned 500 when its
  temporary-write path was made a directory, remained alive, but exposed two
  tasks from memory while only one existed on disk. The failed creation mutated
  state before persistence succeeded. Normal process-restart checks still pass.
- **Round 2 has a null-body hang.** `POST /tasks` with JSON `null` exceeded the
  independent two-second client deadline. `readJsonBody` uses null both for an
  error sentinel and a valid JSON value, then the handler returns without sending
  a response. Rounds 1/3 correctly return 400. This is generated API code, not
  AI Chat's own request handling.

The practical assessment is substantially stronger supervised development and
recovery after the context corrections. The model now finishes the unfamiliar
language task instead of repeatedly losing completion. It still needs independent
review for cleanup, numeric boundaries, transactional persistence and validation.
Three rounds cannot prove universal reliability or isolate model training quality.

## Verification receipt

Three sequential runner invocations, N=1,2,3:

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-03-exhaustion-ctxglmN/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' --model glm-5.3-flash:cloud \
  --tool-preset local-dev --require-instance-role any \
  --title-prefix 'EXH20261003CTXGLMN ' \
  --run-id dev-2026-10-03-exhaustion-ctxglmN \
  --max-tokens 6000 --max-attempts 1 \
  --stream-timeout-ms 1200000 --concurrency 1
```

Authentication was loaded privately; no credentials or private reasoning are
committed. Raw runs and exported receipts are in ignored `data/benchmark-runs/`;
generated artifacts are under `data/dev-benchmark-2026-10-03-exhaustion-ctxglmN/`.

Independent commands and evidence:

- Each CSV/CLI: `go test -json -count=1 ./...`; all pass except the documented
  round-1 discovery failure. Its targeted `go test -json -count=1 .` passes.
- Each debug/API project: `node --test`; all pass. API reviewer process checks
  additionally spawn, terminate and restart actual Node children with temporary
  storage; all children are cleaned up.
- Final Go sources rebuilt with `go build -o <temporary-binary> .` or the prime
  source filename. No previous model-built binary substitutes for final source.
- Prime boundary checks, CLI deterministic/hash checks, numeric probes, null-body
  and forced-write-failure probes saved as `ctxglm*-*.json` and logs in the ignored
  benchmark directory. Test summaries are `ctxglmN-independent-tests.json`.
- All prompts match after path normalization; all 18 final context receipts use
  the verified 1M policy. No whole-task retries. Toolchain fingerprint checks pass.
- Live authenticated `SMOKE_BASE_URL=http://127.0.0.1:4174 npm run smoke` passes;
  log `/tmp/ctxglm-live-smoke.log`.
- Initial app `npm test`: 551 pass, one fail, one skip. The trickled occupied-port
  startup test exceeded its five-second child-process deadline. Its unchanged
  file passes a focused seven-test rerun. Initial log `/tmp/ctxglm-app-tests.log`;
  focused log `/tmp/ctxglm-startup-recheck.log`. A second unchanged full run
  returned 549 pass, two fail, one cancelled, one skip: the trickled startup and
  fatal-rejection child checks exceeded five seconds, and Chromium containment
  exceeded 20 seconds. Log `/tmp/ctxglm-app-tests-recheck.log`. Do not describe
  this session's app-wide verification as green. Multiple unrelated `rustc`
  processes were observed each using roughly 70% CPU during final investigation;
  shared-host contention is plausible but not an isolated causal finding. The
  benchmark agents and reviewer did not start or stop those builds. No assertions,
  timeouts or production code were changed. Recheck on a controlled host before
  deciding whether startup performance or test scheduling needs a fix. The unchanged
  focused Chromium file also passed (three pass, one Linux-only skip), log
  `/tmp/ctxglm-browser-recheck.log`.

No application fixes were made during this experiment. Follow-up candidates are
cleanup-aware final verification and stronger generated-artifact quality gates.
The existing SignalBox final-verification finding
`cap_e5d01314-57e4-43c7-b56e-4bd66016fad8` covers that workflow gap; no duplicate Capture was created for it. A separate
Capture `cap_26ed7c87-0d33-4262-a507-6a1af15cc6cc` records the newly observed
unresolved app-wide timing-test failures; exact and concept retrieval passed.
No new Signal was created. Generated prototype defects stay in this assessment,
not in AI Chat's production bug count. Strata retains the comparison and handoff.

`git diff --check` and report arithmetic/JSON validation passed. Only this report
and its sanitized JSON changed; production source and model configuration are unchanged.
