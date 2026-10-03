# Development benchmark recovery and comparison — October 2, 2026

## Scope and controls

Starting commit: `5c059a9`, branch `main`. Provider: **Watchdog / Ollama Cloud**;
model: **deepseek-v4.1-flash:cloud**. Sequential, one attempt, six original prompts,
6,000 requested output tokens per provider round, 20-minute overall runner deadline.
Same saved runtime presets (13 advertised schemas including evidence retrieval).
Fresh isolated work directories and the original deliberately buggy discount seed.
Only the work-directory suffix changed in the prompts. No provider, profile, or
permission settings changed. Local server restarted to load each runtime revision.

The October 2 EDT runs extend into October 3 UTC. The baseline was operator-stopped
in its stalled second case; later runs reached explicit terminal conditions. This
is a small, uncontrolled live sample with model variability, not a causal estimate
or a comparison of models. Repository tests ran concurrently during parts of the
session; elapsed times are observed workflow latency, not performance benchmarks.

## Full-run results

| Task | Baseline | Intermediate | Final full run | Independent evidence |
|---|---|---|---|---|
| CSV Go program | Pass (54.8s) | Pass (62.8s) | Pass (53.4s) | 10 Go tests pass; actual program output checked |
| Kujo/Go benchmark | Fail (333.2s) | Fail (228.1s) | Fail (66.4s) | Failed context budget after 106 calls; no programs |
| Debug fixture | Pass (17.0s) | Pass (31.4s) | Pass (21.5s) | 5 tests failed before fix; 6 pass after and independently |
| Persistent HTTP API | Fail (27.0s) | Fail (46.6s) | Pass (109.7s) | 12 integration tests pass independently, including restart/persistence |
| Intentional timeout | Pass (15.7s) | Pass (20.0s) | Pass (17.5s) | 1s timeout retained started; exactly one 10s retry exited 0 with finished |
| Duplicate-file CLI | Fail (13.5s) | Fail (54.1s) | Pass (124.9s) | 12 Go tests pass independently; compiled CLI produces identical groups in two runs |

| Whole-run measure | Baseline | Intermediate | Final full run |
|---|---:|---:|---:|
| Verified tasks | 3/6 (50%) | 3/6 (50%) | **5/6 (83.3%)** |
| Wall time | 476.319s | 447.998s | 405.510s |
| Saved tool receipts | 187 | 196 | 208 |
| Provider-reported cumulative tokens | 814,711 | 1,205,772 | 942,912 |

Final full run: **two additional accepted tasks**, 70.809s less wall time, but
**128,201 more reported tokens (+15.7%)**. This is improved observed completion,
not a token-efficiency win. Usage includes repeated context across rounds; it is
not billed cost, unique input size or cache-adjusted usage. Cache details were
unavailable. The corrected final runner call count (208) matches all six journals;
baseline/intermediate runner call counts undercounted errors. Manual grading lives
in `development-2026-10-02-comparison.json`; raw task scores remain null.

Baseline run: `dev-2026-10-02-deepseek`. Intermediate:
`dev-2026-10-02-deepseek-upgraded` (runtime `105eadf`; runner changes from `8536bf5`,
except its later deadline-cancellation catch, which was not exercised). Final full
run: `dev-2026-10-02-deepseek-final` (runtime and runner `c487533`).

A first launch of the final runner occurred before restarted health was ready and
failed before creating cases or making model requests. It was restarted after a
successful health check; it is not an omitted failed model attempt.

The final API and CLI are useful small working deliverables. The API uses bounded
request bodies, validation, atomic JSON-file replacement, and built-in modules.
It remains a single-process demo, not a multi-writer database. The CLI streams file
hashing, sorts groups and paths, handles empty files and warns on unreadable paths.
These checks do not certify either artifact for production deployment.

## Confirmed defects fixed

| Change | Evidence and correction | Verification |
|---|---|---|
| Recoverable file setup | go.mod/go.sum were excluded; failed open with missing parent was treated as possible mutation. Permit metadata extensions and mark only known pre-open failures as non-execution; preserve uncertain partial writes. | Missing-parent failure followed by mkdir-assisted successful write. |
| Nested evidence retrieval | Baseline case 2 had 40 retrievals returning retrieval envelopes. Resolve references to original source results with cycle/depth protection; compacted retrieval receipts retain source and page coordinates. | Ten nested reads return original content; cycle test; intermediate run: 0 nested results in 52 retrievals, versus baseline 40 in 68. |
| Truncated output mistaken for completion | Baseline API response ended with length, but runner called it successful. Tool-enabled runtime now allows at most two same-execution continuations; exhaustion is non-retryable and distinct from connection failure. | Successful continuation and bounded exhaustion route tests. |
| Shrinking output allowance | Old budgeting reduced output before compacting history. Intermediate failed cases ended at a 1,024-token allowance despite requesting 6,000. Compact history first, reduce only if protected input cannot fit. | Context-pressure regression preserves 6,000 tokens and newest request; oversized protected-input fallback tests still pass. |
| Repeated receipt envelopes | A later case exhausted context after 106 calls. Adjacent compacted receipt groups now share their instruction envelope, retaining every ordered record. | Exact saved-context replay: before throws context_budget_exceeded; after fits 59,457 byte-upper-bound units under a 59,536 allowance with 6,000 output reserved. All 30 synthetic receipt identities/page coordinates preserved. These are byte-based estimates, not tokenizer counts. |
| Failure accounting | Runner discarded failure usage and confused transport with task completion; runtime error events omitted attempted tool counts. Keep terminal/error evidence, mark task score ungraded, count failed-run calls, reject length/EOF as success. | Runner and route regressions including failed tool continuation metrics. |
| Unsafe benchmark replay | Automatic whole-prompt retry can repeat completed tools. Disable it for tool-enabled presets; request server cancellation on runner deadline. | Existing runner lifecycle suite and failure classification tests. |

Implementation commits: `105eadf`, `8536bf5`, `c487533`, `bf6a492`.
No API-key/provider settings, user profiles, stored chats, or model selections were
removed. Error events gain additive metrics; output exhaustion now has the explicit
`output_continuation_limit` code. Runner consumers must use
`transport_completion_rate`; `task_completion_rate` is null until independently
graded. Existing baseline files are not rewritten.

## Interpretation

Successful generated code must still be reviewed. The CSV programs use float64,
accept nonfinite amounts, and print customer names without CSV escaping. Those are
prototype limitations even when requested fixture tests pass. The discount fixture
is tiny; fixing it does not demonstrate large-repository debugging. The timeout
case is deliberately harmless and proves only that particular recovery path.

An implementation can advance substantially and still fail its acceptance criteria:
the intermediate Kujo/Go case produced both programs, matching counts, repeated
trials and build measurements, but never delivered the requested final comparison.
It remains incomplete. The intermediate API wrote files but no working test suite.
Neither was upgraded to a pass based on prose or partial artifacts.

## Evidence locations

- Baseline report: `docs/benchmarks/development-2026-10-02.md`.
- Original prompts: `benchmarks/development-tasks.md`.
- Seed and run instructions: `benchmarks/fixtures/discount/`, `benchmarks/DEVELOPMENT.md`.
- Ignored raw run JSON: `data/benchmark-runs/dev-2026-10-02-deepseek{,-upgraded,-final}.json`.
- Ignored workspaces: `data/dev-benchmark-2026-10-02{,-upgraded,-final}/`.
- Per-case receipts are saved separately under `data/benchmark-runs/`.
- Test logs: `/tmp/dev-upgrade-final-full.log`, `/tmp/dev-upgrade-envelope-full.log`,
  `/tmp/dev-upgrade-budget-tests.log`, `/tmp/dev-receipt-envelope-tests.log`.

Raw transcripts stay in ignored local artifacts. This report contains sanitized
results and evidence references, not model private reasoning.

## Targeted follow-up and remaining work

After `bf6a492`, only case 2 was rerun in a fresh `-receipts/02` directory with the
same prompt and settings. Run `dev-2026-10-02-deepseek-receipts` failed in 110.971s
(response latency; 117.185s whole runner), after 162 calls and 469,745 reported
tokens. It made 122 evidence reads, zero nested-envelope returns, and no file writes.
It again reached `context_budget_exceeded`: receipt-envelope consolidation fixes
the demonstrated earlier overflow but cannot make unbounded repeated retrieval fit.
Chat `bb63d298-6cd8-4db4-abd4-338fe81b1cbd`, execution
`a243e273-0aa5-4257-998b-d5d31fed5ecc`.

**This does not change the 5/6 full-run score.** Do not combine successful cases
from different runs into a fictitious 6/6. All three post-baseline experiments
consumed 2,618,429 provider-reported cumulative tokens. The targeted retry did not
show improved task quality and further retries were stopped.

Remaining P1: long documentation/retrieval workflows still need a controlled
comparison of models and context-retention strategies. Distinguish repeated reads
of the same original evidence from useful pagination, retain small actionable
outcomes, and test a bounded task-state representation against real journals before
changing recovery semantics. Do not discard execution identity, invent summaries,
raise limits indefinitely, or automatically replay consequential commands. This is
an unresolved interaction between agent behavior and finite context retention;
there is no evidence that increasing the shell timeout would solve it.

Remaining P2: task-specific automated graders. The runner now honestly reports
transport success separately; this suite still requires the documented independent
artifact review. A successful final response alone remains insufficient.

No sibling repository change is required by the implemented fixes. No unsupported
claim of overall production readiness or model ranking is made.

## Verification receipt

All commands ran with Node v22.17.0 at the repository root unless noted.

- `npm test`: **504 passed, 1 platform skip, 0 failed** (505 total), final revision;
  `/tmp/dev-upgrade-envelope-full.log`.
- `node --test --test-name-pattern='failed tool continuation preserves|output-limit continuation|context budgeting compacts' tests/server-routes.test.js`:
  5 passed; `/tmp/dev-upgrade-budget-tests.log`.
- `node --test tests/context-budget.test.js tests/tool-evidence.test.js`: passed;
  `/tmp/dev-receipt-envelope-tests.log`.
- `go test -count=1 -v ./...` in final case 01: 10 passed;
  `/tmp/dev-final-artifact01.log`.
- `node --test data/dev-benchmark-2026-10-02-final/03/discount.test.js`: 6 passed;
  `/tmp/dev-final-artifact03.log`.
- `npm test` in final case 04: 12 integration tests passed;
  `/tmp/dev-final-artifact04.log`.
- `go test -count=1 -v ./...` in final case 06: 12 passed;
  `/tmp/dev-final-artifact06.log`.
- Compiled `06/dupefind -json 06/fixtures/clean` twice: both exit 0, identical
  output, two duplicate groups with three paths each. Missing/unreadable paths and
  nested/empty files are covered by generated tests and saved execution receipts.
- CSV extra probe: `go run 01/main.go <temporary CSV>` returned exit 0 with NaN,
  +Inf and unescaped comma-containing customer, confirming the stated quality caveat.
- Saved case 05 receipts verify timeout_ms=1000 followed once by timeout_ms=10000,
  retained partial output and successful final exit.
- `git diff --check`: passed.

Full-run invocation (substitute the named suffix/run ID for each recorded run):

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-02-final/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --title-prefix DEV20261002C \
  --run-id dev-2026-10-02-deepseek-final \
  --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

The targeted follow-up used a suite containing only the original TEST 2, with its
fresh work-directory suffix. No failed journal or generated program was manually
repaired to improve a task score. Final server loads `bf6a492` and retains the user's
existing Watchdog routing, profiles and permission settings.

Authenticated `npm run smoke` passed against port 4174: health, providers, state
and offline chat all returned 200 (`/tmp/dev-upgrade-final-smoke-auth.log`). The
first invocation without exported API_AUTH_TOKEN failed authentication setup;
loading the existing environment privately resolved it without changing credentials.

SignalBox: added evidence capture `cap_c90004d8-942f-4877-a581-c3b803703f2d` for the
remaining loop, related to existing signal
`sig_47d24d80-ec87-45ae-95a5-38d55d5e645e`. Exact-ID and concept retrieval passed.
No duplicate signal was created; completed fixes and routine verification were
rejected as captures and belong in the Strata handoff.
