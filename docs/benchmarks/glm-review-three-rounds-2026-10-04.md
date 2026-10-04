# GLM-5.3 Flash with independent review: full comparison

**Accepted: 4/6, 6/6, 6/6 — 16/18 (88.9%), compared with 17/18 (94.4%) in the previous batch. The added review did not demonstrate a broad quality improvement.** It produced three passes, thirteen inconclusive outcomes, and no repair cycles. Two tasks failed before review: one exceeded the unchanged 20-minute benchmark deadline; one was interrupted by a provider stream error.

There are useful narrow improvements: one CSV implementation rejects accumulated integer overflow, and two discount implementations pass the supplementary rounding oracle. All three generated APIs still expose unsaved state after a failed disk write. Professional grades remain **7/10 overall capability, 6.5/10 delivered code quality, 8/10 supervised usefulness, and 4/10 independent production judgment**. These artifacts remain useful with supervision; they do not establish senior-level reliability.

[Machine-readable evidence](glm-review-three-rounds-2026-10-04.json) · [Previous guidance batch](glm-quality-three-rounds-2026-10-03.md) · [Review intervention](development-review-intervention-2026-10-03.md)

## Every GLM round

| Configuration / round | Accepted | Responses completed | Suite elapsed | Reported tokens | Tool receipts | Provider rounds |
|---|---:|---:|---:|---:|---:|---:|
| Original 65K — 1 | 5/6 | 5/6 | 8m 18.222s | 1,614,709 | 181 | 135 |
| Original 65K — 2 | 5/6 | 5/6 | 17m 22.505s | 1,315,515 | 164 | 111 |
| Original 65K — 3 | 5/6 | 6/6 | 7m 13.363s | 1,295,841 | 162 | 114 |
| Original 65K — 4 | 4/6 | 4/6 | 21m 11.551s | 3,277,177 | 350 | 248 |
| Corrected 1M — 1 | 5/6 | 6/6 | 12m 36.282s | 2,624,622 | 192 | 108 |
| Corrected 1M — 2 | 6/6 | 6/6 | 14m 22.724s | 5,493,813 | 215 | 164 |
| Corrected 1M — 3 | 6/6 | 6/6 | 13m 35.735s | 5,769,061 | 228 | 156 |
| Engineering guidance — 1 | 6/6 | 6/6 | 19m 58.734s | 3,758,321 | 175 | 119 |
| Engineering guidance — 2 | 6/6 | 6/6 | 15m 14.712s | 3,942,999 | 181 | 143 |
| Engineering guidance — 3 | 5/6 | 5/6 | 29m 7.678s | 7,802,304 | 247 | 204 |
| Independent review — 1 (overall 11) | **4/6** | 4/6 | 27m 9.699s | **≥5,626,962** | 222 | 149 |
| Independent review — 2 (overall 12) | **6/6** | 6/6 | 18m 14.579s | 3,254,538 | 256 | 146 |
| Independent review — 3 (overall 13) | **6/6** | 6/6 | 22m 42.180s | 5,942,515 | 249 | 154 |

| Batch | Accepted tasks | Fully accepted suites | Elapsed total | Reported tokens |
|---|---:|---:|---:|---:|
| Original 65K, four rounds | 19/24 (79.2%) | 0/4 | 54m 5.641s | 7,503,242 |
| Corrected context, three rounds | 17/18 (94.4%) | 2/3 | 40m 34.741s | 13,887,496 |
| Engineering guidance, three rounds | 17/18 (94.4%) | 2/3 | 64m 21.124s | 15,503,624 |
| Independent review, three rounds | **16/18 (88.9%)** | **2/3** | **68m 6.458s** | **≥14,824,015** |

GLM history now comprises **13 full rounds, 78 tasks, 69 accepted tasks (88.5%), and six fully accepted suites**. The isolated review smoke tests are excluded. DeepSeek's separate historical result remains 73/94 over 19 runs; it is not pooled with GLM.

New suite elapsed increased **5.8%** versus the immediately preceding batch. Reported tokens are 4.4% lower, but one interrupted provider round has incomplete usage, so **this is not a verified token saving**. Provider rounds fell from 466 to 449; receipts rose from 603 to 727. Review adds read calls, but these totals also include varying worker behavior. No paired/randomized review-off control was run, so the difference cannot be attributed solely to review. Host load, runtime choices, and model variability remain confounders.

## Strict acceptance versus artifact quality

Acceptance retains the original six tasks and requirements. A response marked `ok` is only transport completion. Supplementary production-quality probes do not silently become new strict acceptance gates. Conversely, a later passing source probe cannot rescue an unfinished task.

| Task | Round 1 | Round 2 | Round 3 | Independent evidence |
|---|---|---|---|---|
| CSV program | Pass | Pass | Pass | Correct normal/quoted totals; generated suites pass. Overflow fails in 1/2, rejected in 3. |
| Kujo/Go timing | **Fail** | Pass | Pass | Round 1 cancelled before final report; all saved sources pass boundary checks. Rounds 2/3 have five formal trials and verified medians. |
| Discount repair | Pass | Pass | Pass | Receipts demonstrate failing regression before minimal fix and passing tests after it. |
| Persistent HTTP API | Pass | Pass | Pass | CRUD, malformed/null JSON, real process restart pass; failed-write state consistency fails in all three. |
| Timeout recovery | Pass | Pass | Pass | Each reaches the 1,000ms timeout and then exactly one successful 10,000ms retry. Round 2 first had a wrong-path launch, corrected before that sequence. |
| Go duplicate CLI | **Fail** | Pass | Pass | Round 1 stream interrupted before verification; independent suite subsequently finds three failures. Rounds 2/3 final tests, builds, fixture runs and permission restoration are recorded. |

Independent generated-test reruns: **128 passing tests/subtests and three failures** (39 passing in round 1, 51 in round 2, 38 in round 3). Eleven of twelve test-suite invocations pass. The previous batch had 140 passing tests/subtests; counts differ with test structure and are not a quality score.

### CSV arithmetic

The unchanged quality fixture supplies 9,500 individually valid `9999999999999.99` rows for one customer. Rounds 1/2 exit successfully and print a wrapped negative total (`-89467440737095611.16`, with a currency marker in round 2). Round 3 rejects overflow with exit 1 at line 9225.

All three reject or explicitly skip nonfinite, out-of-range, and integer-scaling-overflow inputs. Their documented invalid-row policies differ: rounds 1/3 fail fast, while round 2 skips invalid rows with a stderr count and allows headerless input. That policy difference is not itself a defect. The normal comparison uses only valid rows so a documented fail-fast policy is not incorrectly penalized. Quoted customer `A,B` is preserved in all three.

### API persistence

Each independent probe starts an isolated child server, creates two tasks, updates one, deletes the other, stops the process, starts a new process against the same temporary file, and verifies the surviving update. All three pass. `POST` of JSON `null` promptly returns 400 in all three.

Next, making only the probe's own data file/directory unwritable causes a 500 while the process stays alive and disk contents remain unchanged. **All three nevertheless return two tasks on GET instead of the one persisted task.** Each mutates its in-memory collection before saving; atomic file rename does not make that memory transition atomic. Review did not repair this. Round 2 also exposes the underlying filesystem error/path in its 500 response.

The prior guidance batch had the same 3/3 state-consistency failure. These are generated prototype defects, not changes to AI Chat's own persistence implementation.

### Discount and CLI

The supplementary exact half-up oracle checks 101,101 inputs per artifact (cents 0–1000, percent 0–100). Round 1: zero mismatches. Round 2: zero. Round 3: 314. The previous batch was 314/0/314. The original discount contract does not specify tie handling, so this remains a separately labeled quality probe rather than a retroactive strict failure.

Freshly built CLIs all identify the same two duplicate groups/four members in a five-file fixture, with correct SHA-256 hashes, sizes, path ordering and repeat output. Missing roots produce errors. Round 3 intentionally returns 1 when duplicates exist; the verifier honors that documented contract. Round 1 uses a `sha256:` prefix in JSON; the verifier normalizes the prefix rather than treating it as a hash defect.

The incomplete round-1 CLI suite has two permission-fixture cleanup failures and a deterministic-report test panic (indexing an empty slice). It was never presented as a completed/verified response. Independent verification removed only its two newly created failed-test temporary roots; no generated benchmark source or original fixture permissions were repaired. Rounds 2/3 restore the permission fixtures and pass final recursive tests.

### Prime correctness and timing

All **48 fresh-source boundary invocations** pass: both languages, all three artifacts, limits 0, 1, 2, 3, 4, 10, 49, and 1000. The verifier respects round 2's inclusive bound and rounds 1/3's exclusive bound.

Round 2's five formal million-input trials have compute medians 59,952.843404ms Kujo and 443ms Go; round 3's are 67,819.394733ms and 446.346ms. Their delivered rounded medians match actual receipts; Go compilation is separate. Round 3 also verifies five trials at 100,000 (medians 3,352.472247ms and 21.306ms). These numbers validate the agents' reporting, not a controlled language-performance claim: algorithms and Kujo versions differ.

## Failure attribution

1. **Round 1 Kujo: worker workload planning plus a harness deadline-awareness gap.** Execution `a44c02db-cc16-4b71-a5c6-34888fbec54e` first spends 600,034ms timing a million-input sieve and 120,014ms on a smaller interpreter call; both time out. It fixes repeated array growth, successfully gathers smaller trials, but later starts a ten-million-input trial despite the remaining suite budget. The unchanged external 1,200,000ms deadline cancels it. Context estimate is 311,468 against a 1,042,576 input allowance, with no compaction. This is not evidence of context exhaustion or a 15-second tool limit. Review never starts; its five-minute budget is irrelevant to this failure. Round 3 instead explicitly declines the ten-million workload.
2. **Round 1 CLI: provider stream failure before review.** Execution `798f6e17-fa87-4a43-80da-533d85a71aee` ends `interrupted`, `provider_error`, “Provider stream error,” at 66,334ms. Nine of ten rounds report usage. The recorded context is 112,308, below allowance. The journal does not establish whether the origin was Ollama, Watchdog, or another upstream stream boundary; do not label it a proven model reasoning failure or an AI Chat timeout. The resulting unfinished tests have defects, but the provider interruption prevented the normal test/fix cycle.
3. **Review protocol/budget: separate AI Chat integration limitation.** Of 16 tasks that reach review, 3 pass, 10 end with “Review did not provide a valid evidence-backed verdict,” and 3 exhaust the bounded rounds. No `revise` verdict or repair occurs. The three bounded cases complete their entire tasks in under 300 seconds, ruling out the review wall deadline: the four-round limit is binding. `lib/engineering-review.js` continues offering read tools on the fourth round and then finishes inconclusively before another verdict round. The prompt asks the model to reserve its last round, but the harness does not enforce that. The generic invalid-verdict message does not preserve a field-specific rejection diagnosis, so the exact cause of each of those ten invalid submissions remains unknown.

A review pass also missed round 2 CSV's unchecked aggregation. Valid evidence references and passing tests are useful, but they do not establish coverage of the requested failure invariants. This is why reviewer pass counts are not used as the benchmark grade.

## Accounting and provenance

Starting clean `main`: `9f3f9432bdac4b88d033cd2b5758dec8e3d5fec8`. Source/configuration, profiles, prompts, permissions and toolchain were frozen throughout the three suites. No restarts, model substitutions, discarded attempts, whole-task retries, or manual artifact fixes.

Runs: `dev-2026-10-04-review-reviewglm1`, `reviewglm2`, `reviewglm3` (same full prefix). Eighteen fresh chats/directories; one attempt each, concurrency one, Watchdog / Ollama Cloud, `glm-5.3-flash:cloud`, local-dev, 6,000 output-token request, 1,048,576 context window, 1,200,000ms per-response deadline. Prompts match the previous batch after directory normalization. All execution checkpoints contain the engineering guidance once. Review is enabled with four rounds/review, twelve rounds/repair, at most three reviews/two repairs and a shared five-minute review/repair budget.

Default Go 1.27.1 (`6890cf02fb958fc15a043022d5f29e2a2206ab08a73581eddc3f33c7c681a730`) and Kujo 1.5.0 (`3e1e475ea165c8b4a714495596fe8661ad970b27119ad44f1db4d9779f7f05d4`) match the previous batch and remain unchanged before/after each suite. Round 3 chooses the separate Kujo 1.7.0 release (`2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`), fingerprinted during this batch's first CSV task, before any prime task. No JIT timing is used. Existing JIT concerns from the previous report are not reclassified or resolved here.

The raw runner total is 10,290,650 tokens. It omits the cancelled Kujo execution's **4,533,365 tokens and 69 provider rounds**, recovered from its journal with `usage_complete: true`. The report includes those values. The interrupted CLI retains 141,981 reported tokens but has `usage_complete: false`; thus the batch's **14,824,015 is a lower bound**, not exact total consumption. Tokens include repeated input across calls; they are not unique context size or a dollar charge. Older four-round totals retain their historical accounting and were not retrospectively reconciled.

All generated-file write receipts target their assigned case directories (receipt audit, not an OS sandbox guarantee). Independent builds/probes ran after all timed suites. Before/after hashes and modes of existing generated artifacts match. Raw checkpoint/response evidence remains local under ignored `data/benchmark-runs/`; only sanitized metrics are committed.

## Professional assessment and next experiment

| Dimension | Previous | Current | Interpretation |
|---|---:|---:|---|
| Overall development capability | 7/10 | **7/10** | Useful implementations and recovery; variable execution reliability |
| Delivered code quality | 6.5/10 | **6.5/10** | Small arithmetic gains, persistent failed-write defects, one unfinished failing suite |
| Supervised usefulness | 8/10 | **8/10** | Strong starting artifacts when a developer reviews and tests them |
| Independent production judgment | 4/10 | **4/10** | Inconsistent workload bounds, defensive state handling, and verification completeness |

These are professional judgments, not calibrated measurements or a mathematical conversion from pass rate. The sample supports **mid-level implementation ability on bounded tasks, with junior-level inconsistency in production judgment**. It does not support an upgrade to senior autonomy. The isolated review smoke test did not predict performance on the full task set.

Before another paid batch, the justified next work is to make the review protocol reliably terminate: reserve a verdict-only final round within the existing budget, add bounded field-specific rejection diagnostics, and test evidence selection/submission under six-call batching. Then verify that concrete invariant failures can produce a supported `revise` and a tested repair. Keep the reviewer advisory and retain read-only permissions; do not force “pass,” relax evidence validation, or raise limits merely to improve scores. Run the same frozen benchmark afterward, preferably with a paired review-off control to isolate the intervention.

Separately, expose remaining external task deadline to the worker and reconcile cancelled-run usage in the benchmark runner. Existing usage-accounting and Kujo JIT follow-ups remain open. These recommendations were **not implemented during this comparison**.

## Verification receipt

Local orchestration and verifier scripts are preserved under `data/benchmark-runs/reviewglm-scripts/` (ignored), with raw executions and logs beside them. The timed runner command is:

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-04-review-reviewglmN/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' --model glm-5.3-flash:cloud \
  --tool-preset local-dev --require-instance-role any \
  --title-prefix REVIEW20261004REVIEWGLMN \
  --run-id dev-2026-10-04-review-reviewglmN \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

`N` is 1, 2, or 3. The API credential was loaded privately from `.env`.

Executed verification:

- `python3 data/benchmark-runs/reviewglm-scripts/tests.py reviewglmN`: Go `test -json -count=1 ./...` (round-1 CSV explicitly names its two files because no module is required), Node `--test`. Eleven suites pass; round-1 CLI fails as detailed above.
- `csv.py reviewglmN`: fresh Go build, seven input fixtures each; two aggregate-overflow defects, one rejection.
- `api.py reviewglm1 reviewglm2 reviewglm3`: three real restarts/null checks pass; three failed-write consistency probes fail. Owned child processes and probe files cleaned.
- `primes.py`: 48/48 boundary invocations pass, fresh Go builds.
- `cli.py`: 3/3 fresh-build independent fixtures, deterministic repeats and missing-path checks pass. Harness adapted to documented hash prefixes/exit codes; generated code unchanged.
- Node exact-integer discount oracle: 303,303 inputs total; mismatches 0/0/314, supplementary only.
- `timing.py reviewglm1 reviewglm2 reviewglm3` plus median audit: completed rounds' reported medians match receipts.
- `metadata.py`, `report.py`, artifact hash/mode checks, prompt normalization, toolchain checks, receipt scope audit, report arithmetic/JSON and `git diff --check`: report verification.

This is a report-only change. AI Chat's source suite was not rerun for it; the intervention's earlier 582-pass/one-platform-skip result is historical, not a new result from this task. Benchmark failures remain honestly recorded rather than repaired or rerun into passes.

Post-run authenticated health: healthy, zero active streams, zero queued benchmark requests; review remains enabled. Separate Kujo release hash remains unchanged. No server restart was necessary.

Durable follow-up: SignalBox project `ai-chat`, Capture `cap_6124545b-10d2-4d4a-89b6-bacdeb5505b6`, Signal `sig_b581af8b-ea27-4e71-800b-ec6bb88bbe82` (review verdict reliability). Both verified by exact ID and concept `verdict-only`. Existing cancelled-usage/JIT findings were not duplicated. Routine benchmark summaries and generated prototype defects were excluded from new SignalBox captures; the full comparison belongs in the report and Strata handoff.
