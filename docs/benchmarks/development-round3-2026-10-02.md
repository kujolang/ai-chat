# Development benchmark: three engineering rounds

## Result: verified 5/6, not the requested 6/6

The latest full run is `dev-2026-10-02-deepseek-round3f`, runtime `5141b3a`.
Concrete app defects were fixed and verified, but end-to-end completion did not
improve over round 2. Kujo/Go still failed with `output_continuation_limit` after
146 calls (87 saved-result reads), despite working programs and real timings.
There is no clean 6/6 claim, no stitched score and no general production-readiness claim.

| Engineering round | Completed | Rate | Total elapsed | Cumulative reported tokens | Tool receipts |
|---|---:|---:|---:|---:|---:|
| 1 — original | 3/6 | 50% | 476.319 s | 814,711 | 187 |
| 2 — previous final | 5/6 | 83.3% | 405.510 s | 942,912 | 208 |
| 3 — latest final | 5/6 | 83.3% | 610.783 s | 1,771,713 | 300 |

Median case durations: 22.035 s, 59.890 s, 55.369 s respectively. Short failures
can make a median look favorable; these numbers do not establish a speed improvement.
Different chosen workloads, model variation and one trial per revision prevent a
causal performance claim. Round 3 used more tokens and took longer than round 2.
All six candidate runs in this engineering round consumed **12,631,760** cumulative
reported tokens, including failures. These are not unique context size or billed cost.

| Task | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| CSV program | Pass | Pass | Pass |
| Kujo/Go benchmark | Fail | Fail | Fail |
| Debug fixture | Pass | Pass | Pass |
| Persistent HTTP API | Fail | Pass | Pass |
| Intentional timeout recovery | Pass | Pass | Pass |
| Duplicate-file CLI | Fail | Pass | Pass |

### Quality assessment

The outputs are useful small prototypes, not uniformly production-ready software.
Round 1 left three tasks incomplete. Round 2 delivered working API/CLI artifacts.
Round 3 preserves that breadth and fixes additional context/protocol defects, but
does not demonstrate greater completion reliability or lower resource usage.

- CSV: eight top-level Go tests pass; requested valid/empty/malformed cases work.
  An independent probe still prints `Alice: NaN` and `Bob: +Inf` with exit 0.
  Financial input validation and precision remain inadequate for production use.
- Debugging: five tests pass; receipts prove the regression test failed before the
  minimal fix. The unchanged fixture contract is preserved.
- API: 25 passing Node tests (including the parent test), covering CRUD, validation,
  malformed JSON, content type, payload bounds, and persistence/deletion across
  restarts. It is a local JSON-file demo, not a proven multi-process database.
- Timeout: exactly one 1000ms attempt returns partial `started`; exactly one 10000ms
  retry returns exit 0 and `started`/`finished`. No permission bypass or timeout
  setting change was needed for the result.
- CLI: 21 top-level Go tests pass. Two compiled CLI runs return identical JSON,
  exit 0 and two duplicate groups. Nested/empty files, unreadable paths and useful
  errors are exercised; this is stronger evidence than a prose claim of completion.
- Kujo/Go: matching counts at 1000/200000/500000 and real command timings exist,
  but the task did not finish its complete five-trial-per-program report. It spent
  346.841 seconds before the output-continuation guard stopped it. This is an
  unresolved model/context interaction, not a shell timeout or a permission block.

Machine-readable case scores, execution IDs, usage and all diagnostic candidates:
[`development-round3-2026-10-02.json`](development-round3-2026-10-02.json).


## Round definitions and grading

This report uses **round** to mean an engineering milestone, not every diagnostic
invocation. Round 1 is the original `dev-2026-10-02-deepseek` run (3/6). Round 2 is
the previous milestone's final full run, `dev-2026-10-02-deepseek-final` (5/6).
Its intermediate full run (3/6) and targeted Kujo/Go failure remain in
`development-2026-10-02-upgrade.md`; they have not been erased or relabeled passes.

Round 3 starts at commit `643344a`. It includes six candidate full runs as additional defects were reproduced and fixed. No
successful cases are stitched together across runs. Scores mean independently
verified task completion out of six, not an uncalibrated subjective code-quality
rating. A delivered response, model-authored passing tests, or unfinished source
file alone cannot establish task completion.

Controls: Watchdog / Ollama Cloud, `deepseek-v4.1-flash:cloud`, 6,000 requested
output tokens per provider round, one attempt, concurrency one, 20-minute runner
deadline, the six original prompts, and the original discount seed. Only assigned
work-directory paths change. No permission, routing, profile, model, or subscription
changes. Later automatic recovery stays inside the same execution, preserves
receipts, and does not restart the original request.

## Root causes addressed this round

1. **Receipts lost actionable evidence.** The preceding failed targeted run made
   122 evidence reads for only 40 distinct source/offset pages. Four workspace or
   runtime pages were read eight times each. Identity-only receipts required the
   model to recover facts it had already learned, without useful paths or outcomes
   to prioritize them. This is direct evidence of repeated retrieval, not proof that
   every model failure comes from compaction.
2. **Bounded factual outcomes now survive.** `lib/receipt-outcome.js` preserves
   small results verbatim and selected inputs, including paths and shell commands.
   Larger results retain explicitly marked excerpts and pagination fields. Full
   source results stay in the journal. No LLM summary or invented outcome is used.
   At severe pressure, the largest optional details are removed first, retaining
   all call IDs/references and allowing the old identity-only representation to fit.
   Tool-scoped guidance directs the model to use retained outcomes and recover only
   evidence needed for the next decision. Base SYSTEM_PROMPT.md remains unchanged.
3. **Earlier progress text masked an empty final turn.** Initial candidate cases 2
   and 6 ended with `stop` and no actual final answer, yet aggregate output contained
   earlier progress messages. The runtime reported success. It now allows at most
   two same-execution continuations for explicit empty stops, and returns a
   non-retryable `empty_final_response` when exhausted. Completed calls are retained,
   not replayed. This is distinct from the existing output-limit continuation.

Implementation commits: `92ba4f7` (receipt details), `7bebb42` (empty final turns),
`19218af` (API documentation). Public error metrics gain `empty_continuations`;
profiles, user data, authentication and tool permissions are unchanged.

## Initial round-3 candidate — retained adverse result

`dev-2026-10-02-deepseek-round3`, runtime `92ba4f7`, reported six successful streams
but verified completion was only **4/6**. Case 2 made no programs; case 6 left source
and an unfinished test fix without the requested successful build and CLI exercise.
Both ended with progress prose rather than a final result. This prompted the
empty-final-turn fix, not a change to the grading threshold.

Independent candidate checks: CSV tests passed; discount tests passed; HTTP API
passed 23 integration tests; timeout receipts show the required partial/successful
outputs. The last two files mentioned above were not repaired by the reviewer.
Raw candidate JSON, receipts and files remain under ignored `data/`.

## Verification

- First full suite caught an instruction-size regression. The new guidance was
  moved into tool-specific context; the base system prompt size gate was preserved.
- Receipt-only revision: `npm test` — 508 pass, one skip.
- Empty-final recovery revision: `npm test` — **510 pass, one platform skip, zero failures**;
  `/tmp/dev-round3-protocol-full.log`.
- `node --test tests/receipt-outcome.test.js tests/context-budget.test.js tests/tool-evidence.test.js`
  — 19 pass, `/tmp/dev-round3-receipts-tests.log`.
- `node --test --test-name-pattern='empty terminal tool turn' tests/server-routes.test.js`
  — 2 pass, `/tmp/dev-round3-empty-tests.log`. Fixtures verify progress text cannot
  mask an empty ending, exhaustion is bounded, and the completed clock call runs once.
- `git diff --check` — pass.

No production-readiness claim follows from this small suite. The score measures
these six local tasks; it does not establish large-repository debugging ability,
financial precision, multi-process persistence safety or unattended reliability.

## Additional candidate and protocol investigation

Candidate B (`dev-2026-10-02-deepseek-round3b`, runtime `7bebb42`) ended 4/6.
The prime-counting programs and trials existed, but repeated evidence reads again
exhausted context before a final deliverable. The CLI case exhausted its two output
continuations. This adverse result is retained; it is not silently replaced.

Two further changes followed:

- `fd06198` folds identical immutable saved-result pages by source, source tool,
  offset and next_offset; all retrieval IDs remain in `read_call_ids`. Live reads,
  commands, writes, failures and different pages remain separate. This avoids
  repeating the same page outcome without hiding action history.
- `8a6ba3c` preserves incoming OpenAI-compatible `reasoning`/`reasoning_content`
  strings through tool turns, bounded continuations and resume. Previously only
  native Ollama `thinking` survived. This is a protocol continuity defect supported
  by source inspection and deterministic round-trip tests, not proof of the exact
  causal share it had in each live failure.

Primary sources checked October 3 UTC: [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility),
[Ollama's official adapter source](https://github.com/ollama/ollama/blob/main/openai/openai.go)
(`Message.Reasoning` becomes `api.Message.Thinking`), and
[DeepSeek thinking-mode documentation](https://api-docs.deepseek.com/guides/thinking_mode/).
DeepSeek documents a reasoning-content replay requirement for tool sessions; its
API contract must not be assumed identical to Ollama's deployment. Unknown/encrypted
provider-specific reasoning formats are outside this change. Context remains
bounded and these fixes do not promise unlimited lossless reasoning history.

Routing clarification: the live Watchdog profile has `WATCHDOG_DIRECT_STREAMING`
enabled and resolves to native Ollama with Watchdog telemetry. Native tool turns
already preserved thinking; **native recovery turns did not**. The same change now
preserves thinking on those recovery turns. The additional OpenAI-compatible replay
fix is independently verified and relevant to other routes, but is not claimed as
the cause of improvements on this live native route. No routing setting changed.


## Candidate C and final retrieval corrections

Candidate C (`dev-2026-10-02-deepseek-round3c`, runtime `8a6ba3c`) completed
five responses. Case 6 was manually cancelled after 244.989 seconds: it had made
696 calls, including 609 saved-result reads, and had no final answer. The CLI itself
built and passed independent tests, but an unfinished execution is a failed task.
Total run time was 519.884 seconds, with 3,821,486 reported cumulative tokens and
874 receipts. This is an adverse result, not a timeout improvement.

The agent read the exact same successful CLI output page 32 times and its passing
Go test page 31 times. Repeated reads remained even with receipt coalescing, so
coalescing alone is not a demonstrated solution to model perseveration.

`4863bc3` additionally fixes two concrete retrieval behaviors:

- `local_file_read` previously returned empty content on alternate unchanged reads
  and asked the model to retry. It now consumes the same duplicate marker but
  immediately re-reads the bounded window. It retains the existing read-before-write
  ledger, path validation and stale-write protection without caching file bodies.
- The older tool-character compactor protected only the last recovered page. It
  now protects every page in the current retrieval batch, preserves canonical
  source/page coordinates and retains bounded outcomes for old results. The final
  model context budget still applies; this is not permission for unbounded context.

These are independently reproduced defects. The legacy character compactor has a
separate threshold from the byte-budget compactor, so it is not established that it
caused the live candidate-C loop. Native recovery fixtures cover both empty and
output-limited stops. Their initial full-suite failures were fixture host-allowlist
setup errors, corrected without weakening the assertions.

Candidate C quality notes: independently rerun CSV/discount/API/CLI tests passed.
The Kujo/Go counts and all ten designated trial values are backed by execution
receipts; medians recompute to 734697 and 2263 microseconds. However, it consulted
candidate B's source. This is not clean independent generation. Its report also
mislabels a second Go build as cold, and the file describes an inclusive range
although both programs use an exclusive bound. The final answer correctly says
internal timing excludes startup. API integration/restart tests pass, but an auxiliary
smoke script remained problematic after a timeout. These caveats prevent treating
completion as uniformly excellent code or reporting quality.

## Reproduction and evidence retention

All candidate suites use the original six prompts with only work-directory suffixes
changed (`round3`, `round3b`, `round3c`, `round3d`, `round3e`, `round3f`). Each starts from a fresh directory
and original discount seed. Existing prior artifacts remain readable in the broad
configured workspace; this limitation is disclosed rather than silently calling
these hermetically isolated trials. No generated artifact was patched by the reviewer.

```sh
node scripts/run-benchmark-suite.js \
  --tests data/dev-benchmark-2026-10-02-round3f/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --title-prefix DEV20261002R3F \
  --run-id dev-2026-10-02-deepseek-round3f \
  --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

Raw runs: `data/benchmark-runs/dev-2026-10-02-deepseek-<suffix>.json`.
Per-case journals: `data/benchmark-runs/dev-2026-10-02-<suffix>-case-N-receipts.json`.
Generated artifacts: `data/dev-benchmark-2026-10-02-<suffix>/NN/`.
These local ignored artifacts can contain model reasoning and are not published.
The committed comparison contains only grades, IDs and measured totals.

There is no cross-repository implementation dependency. Watchdog routing and
credentials remain unchanged; the server was restarted to load each tested revision.


## Candidate D: exact reproduction of a mixed-batch budget defect

Candidate D (`dev-2026-10-02-deepseek-round3d`, `4863bc3`) completed 4/6.
Case 2 exhausted two output-limit continuations after 87 calls and no programs.
Case 4 hit `context_budget_exceeded` after only 29 calls. This was not merely
model behavior: replaying its saved checkpoint reproduced the budget exception.
The latest native batch combined a saved-result read with a full `ps` process-list result containing
64,748 characters. The budgeter protected the entire batch because it contained a
fresh evidence read. It therefore could not compact the oversized shell sibling.

`b2f73d8` preserves every new retrieved page and the complete tool-call/result
protocol, while compacting unrelated oversized sibling results into bounded
outcomes with their journal references. Native and OpenAI-compatible regression
fixtures cover a read/shell/read batch. On the actual failing checkpoint, the
125,823-byte framing estimate now fits at 59,037 within its 59,536 input allowance,
without removing messages, raising the window or reducing the output reservation.
These are conservative context estimates, not tokenizer or billed-token counts.

Candidate D's passing CSV, discount and CLI artifacts were independently tested.
Its failure results remain failures even though candidate C passed those cases.

## Remaining review items

- P1: output-limit exhaustion and repeated evidence retrieval still occur with this
  model. Confirmed runtime bugs and model behavior can coexist. Do not equate this
  suite with a general guarantee of uninterrupted agentic completion.
- P2: enforce benchmark read isolation, not just fresh output directories. Candidate
  C read earlier benchmark source; controls do not prove independent generation.
- P2: task-specific external graders remain necessary. Stream success does not prove
  completed work, and passing generated tests does not establish production quality.

SignalBox adds capture `cap_5ab5ae00-2e58-4e7a-a5dd-147d770143f3` with the new
609-retrieval and prior-source-access evidence, related to existing review signal
`sig_47d24d80-ec87-45ae-95a5-38d55d5e645e`. Exact-ID and concept retrieval passed.
No duplicate signal was created. Completed fixes, test receipts and routine activity
were rejected as captures and belong in the Strata handoff.


## Mixed-batch revision verification

- `npm test` with Node 22.17.0: **522 passed, one platform skip, zero failures**
  (523 total), `/tmp/dev-round3-mixed-full.log`.
- `node --test tests/local-runtime.test.js`: 39 passed,
  `/tmp/dev-round3-read-tests.log`; stale/unseen overwrite guards remain tested.
- `node --test --test-name-pattern='native Ollama recovery' tests/server-routes.test.js`:
  both native recovery fixtures passed, `/tmp/dev-round3-native-tests.log`.
- Earlier full checkpoint before the final mixed-batch fix: 518 passed, two new
  fixture failures, one skip; those fixtures lacked the allowed mock provider host.
  Corrected fixture configuration and the final full suite establish the final result.
- `git diff --check`: passed.

Only the runtime, context/evidence handling, regression tests and affected API docs
changed. No provider credentials, model selections, permission controls, chat files
or user profile persistence formats changed. New optional receipt and metric fields
are additive; repeated reads now return content instead of an empty duplicate notice.


## Interpretation rules for the final comparison

The four diagnostic candidates consumed 8,053,926 cumulative provider-reported
tokens before candidate E. Failed work is included, not hidden. These counters
sum repeated provider inputs/outputs across rounds and are not unique context size
or a dollar-cost estimate; cache billing detail was not reported. The initial run's
814,711-token total comes from the previously corrected journal-backed comparison,
not the original runner file that omitted failed-run usage.

A final task pass means the requested artifacts, actual executions and deliverable
were verified. It does not certify extra adversarial requirements that were never
in the task. Quality caveats are listed separately instead of inventing a subjective
score out of ten. Completion rates from six tasks are descriptive, not confidence
intervals or a model ranking. Different model-chosen workloads and diagnostic
retries prevent a causal latency/performance claim.


## Candidate E: fresh file-read starvation

Candidate E (`dev-2026-10-02-deepseek-round3e`, `b2f73d8`) finished **4/6**.
The Kujo/Go task did create both programs and a report with actual five-trial
medians (Go 0.75 seconds; Kujo 110.20 seconds at one million inputs). It nevertheless
ended `empty_final_response` after two bounded continuations. The API artifact also
passed 14 independently rerun tests but failed to deliver its final answer. Neither
is awarded an end-to-end pass. No generated files were repaired by the reviewer.

The prime case took 797.478 seconds because its chosen workload included an initial
Kujo run of 108.58 seconds plus five Kujo trials of 110.57, 110.20, 114.45, 108.60 and
108.06 seconds. These are actual successful command receipts, not timeout errors.
The written report has real medians, but the lack of a final response remains a
user-visible failure. The tested programs produced matching counts 168, 17984 and
78498 at 1000, 200000 and 1000000 inputs. No prior benchmark file reads were found
in that case's local_file_read receipts; that does not establish enforced isolation.

A second saved-checkpoint replay exposed why recent report reads could disappear:
only `tool_result_read` pages were protected, so the latest `local_file_read` was
compacted before the model consumed it. On the actual failed checkpoint, the old
policy replaced the new 2,849-character tool message with a receipt. `5141b3a`
protects fresh bounded local/skill file reads too. Old optional receipt details are
reduced first. The same checkpoint now fits at 58,692 of 59,536 estimated input
bytes with its exact fresh tool content preserved and no message deletion.
Both compaction layers apply the same fresh-read protection. Full journal evidence,
read/write protections and output reservations remain intact.

Final implementation verification: **523 passed, one platform skip, zero failures**
(524 total), `npm test`, `/tmp/dev-round3-protected-full.log`. The fresh-file regression
requires exact content delivery and retention of old journal references under pressure.
The preceding 522-pass result was the mixed-batch revision, not this latest revision.

Candidate E quality checks: CSV uses decimal-to-integer cents and rejects NaN/Inf,
but an independent overflow probe printed `Big,-1.00` for amount
`9223372036854775807`, and comma names remain unescaped. Thus its passing requested
examples do not establish production finance correctness. Discount tests passed;
CLI tests and two deterministic fixture executions passed. API tests passed but the
failed execution remains failed. This separates artifact quality from chat completion.


## Latest artifact verification receipt and handoff

All commands completed using the existing Node 22.17.0/Go installation. Artifacts
were reviewed and tested without editing generated source to improve scores.

- `go test -count=1 -v ./...` in final `01`: 8 top-level tests pass;
  `/tmp/dev-round3f-01.log`.
- `npm test` in final `03`: 5 tests pass; `/tmp/dev-round3f-03.log`.
- `npm test` in final `04`: 25 tests pass; `/tmp/dev-round3f-04.log`.
- `go test -count=1 -v ./...` in final `06`: 21 top-level tests pass;
  `/tmp/dev-round3f-06.log`.
- `06/dupefinder -json 06/fixtures/root` twice: exit 0, identical JSON, two groups;
  `/tmp/dev-round3f-cli-probe.log` (commands used absolute artifact paths).
- `go run main.go <temporary CSV with NaN/Inf>` in final `01`: exit 0, accepts
  non-finite values; `/tmp/dev-round3f-csv-probe.log`. This is an observed quality
  limitation, not silently converted into a passing adversarial test.
- Final `05` saved receipts verify exact partial/success outputs and retry counts.
- Authenticated `npm run smoke` with `SMOKE_BASE_URL=http://127.0.0.1:4174`:
  health/providers/state/offline chat all 200; `/tmp/dev-round3-final-smoke.log`.
- Final `npm test`: 523 pass / 1 platform skip / 0 fail;
  `/tmp/dev-round3-protected-full.log`. Runtime revision `5141b3a` is running.
- `git diff --check`: pass.

Starting commit: `643344a0859a599fabed55dc316435394fa67d5b`, branch `main`.
Implementation commits: `92ba4f7`, `7bebb42`, `fd06198`, `8a6ba3c`, `4863bc3`,
`b2f73d8`, `5141b3a`; API documentation commit `19218af`.
The report is committed separately. No sibling repository modifications are required.

Next investigation should use saved journals to test a bounded task-state retention
strategy and a controlled model/harness comparison before more expensive live runs.
Fresh-read preservation is verified, but does not by itself solve every retrieval
loop. Enforce benchmark read isolation and add external task graders before using
these runs as independent model-quality rankings. Do not raise limits indefinitely,
replay consequential work, or label an incomplete chat as a completed task.
