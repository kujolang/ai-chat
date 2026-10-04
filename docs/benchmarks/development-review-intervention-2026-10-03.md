# Independent engineering review intervention — 2026-10-03

## Reason for the change

The last GLM-5.3 Flash batch completed 17/18 tasks, matching the preceding batch,
while delivered code remained at 6.5/10 and independent production judgment at
4/10. Additional instructions did not eliminate aggregate overflow or failed-write
state divergence. See [the preceding comparison](glm-quality-three-rounds-2026-10-03.md).

This change implements a separately budgeted review and repair workflow rather
than adding another paragraph to the worker's permanent prompt. It is an
experimental intervention, not evidence of a higher model grade.

## Implementation

- `lib/engineering-review.js`: independent review packet, strict evidence-linked
  verdicts, three-review/two-repair state machine, read-only schema selection,
  explicit incomplete outcomes, and persisted counters/deadline.
- `lib/server-runtime.js`: same-provider integration into the existing streaming
  loop, per-phase authorization, saved-result reads, context/usage accounting,
  encrypted checkpoints, cancellation, and ordinary execution replay.
- `public/app.js`: concise review/repair status. Reviewer JSON and reasoning stay
  in separate streamed/journaled review records instead of cluttering the answer.
- `tests/engineering-review.test.js` and `tests/server-routes.test.js`: policy,
  budget, isolation, evidence provenance, repair, SSE, usage, cancellation, and
  resume regression coverage, including native Ollama and OpenAI-compatible HTTP.

The review sees original request context, system constraints, candidate completion,
artifact paths and saved-result references, then inspects authorized final source
and results. It has no shell, write, browser or adapter access. The original worker
handles supported findings within its existing permissions. The wrapper never
replays a command merely because the reviewer asks for evidence. It does not
introduce a new provider, require a second account, or change profiles/models.

Each review gets four provider rounds; each of at most two repairs gets twelve.
The shared five-minute review/repair deadline is checked between rounds. Existing
in-flight operation timeouts remain in force. Counts and deadline survive resume.
Malformed verdicts, invented evidence references, uninspected passes, truncated
request scope and exhausted budgets cannot produce an accepted review. A model's
`pass` remains advisory; reference validation cannot prove its interpretation is
correct. Unresolved/inconclusive findings are explicitly appended to the final
answer even if the worker forgets them.

The flag is `ENGINEERING_REVIEW_ENABLED=1`; repository default is off. Old saved
executions retain their prior workflow. Native Codex and JSON chat are unchanged.
The additive API event/fields and full operational limits are documented in
[API_CONTRACT.md](../API_CONTRACT.md#experimental-engineering-review-metadata) and
[LOCAL_AGENT_CAPABILITIES.md](../LOCAL_AGENT_CAPABILITIES.md#independent-engineering-review-experimental).

## Verification

Implementation commits: `4c23879` (workflow) and `4582cb4` (structured verdict control).

Starting repository commit: `59288c9a984dbd28acc6502af3c7fd86ee76c7d4` (`main`).
The preceding full-suite baseline was 560 passing, one platform skip. This session's
pre-edit targeted baseline was 7/7 tool-discovery tests.

Commands (Node 22.17.0):

- `node --test tests/tool-discovery.test.js`: baseline passed.
- `node --test tests/engineering-review.test.js`: bounded workflow unit coverage.
- `node --test --test-name-pattern='independent engineering review|review cannot bypass|interrupted independent|cancelling a reviewer' tests/server-routes.test.js`:
  eight initial focused integration tests passed; the final full suite also covers
  worker misuse and mixed-batch verdict submissions.
- `npm test`: **582 passed, one platform skip, zero failures** (583 tests).
- `node --check public/app.js`, `node --check lib/engineering-review.js`,
  `node --check lib/server-runtime.js`, `git diff --check`: passed.

Baseline log: `/tmp/review-baseline.log`. Final suite evidence is
`/tmp/engineering-review-full-final.log`; focused results are
`/tmp/engineering-review-unit.log` and `/tmp/engineering-review-routes.log`.
Logs and runtime credentials are not committed.

The positive transport fixtures verify exactly nine provider rounds, two worker
writes, two source reads and two saved-result reads for one repair cycle. Reported
fixture usage includes every round. These are deterministic contract assertions,
not measurements of real model cost, throughput or code quality.

## Local rollout and live protocol validation

Enabled `ENGINEERING_REVIEW_ENABLED=1` in the ignored local `.env`. Restarted the
idle `com.kujo.ai-chat` launch agent gracefully and verified a new process served
health with the feature enabled. Provider profiles were identical before/after.
Authenticated fixture/browser smoke passed; log:
`/tmp/engineering-review-live-smoke.log`.

The first held-out live task used GLM-5.3 Flash through Watchdog / Ollama Cloud:
`dev-2026-10-03-review-smoke`, execution
`a309f450-3932-4239-93cb-fc141c5b1c8d`. It created a built-in-only CommonJS duration
parser with strict input and safe-integer overflow contracts. The worker corrected
an erroneous test expectation and finished with 7/7 generated tests passing.
Independent checks passed all 6,121 tested inputs, including boundaries, leading
zeroes, whitespace, Unicode digits and invalid types. No generated source was
manually repaired.

That run exposed a protocol issue: the reviewer provided valid, evidence-linked
JSON **after prose**, so the strict parser correctly marked it inconclusive rather
than certifying arbitrary text. Runtime was 102,932 ms, 15 provider rounds,
221,646 tokens (complete reported usage). This result remains recorded as an
inconclusive review, despite passing artifact checks.

The follow-up fix advertises a review-only `engineering_review_submit` function
for structured verdict arguments. It cannot execute commands, is denied to the
worker, and mixed submission/executable batches are rejected without executing
additional work. Evidence references remain validated against actual reads.
Arbitrary prose is not parsed heuristically. Contract tests cover both transports.

The fresh post-fix run was `dev-2026-10-03-review-smoke3`, execution
`1ea39925-b18b-492c-8d32-e9b2fc628209`. It completed with **one structured `pass`
verdict and zero repair passes**, 55/55 generated checks, and 6,121/6,121 independent
input probes. Response latency was 95,789 ms, nine provider rounds, 102,080 tokens
(complete reported usage), and eleven executable tool calls. The protocol verdict
is not counted as an executable tool call. No old response/artifact was reused and
no generated code was repaired by the supervising agent.

Both real runs used the same prompt except for their isolated root. They used
6,000 output tokens, concurrency one, one attempt, and a 600,000 ms deadline;
these are standalone smoke runs, **not** additional rounds of the historical
six-task benchmark. An intermediate launcher attempt named `review-smoke2` reused
the first chat because its title prefix was not unique. It executed no fresh task
and is excluded from all validation/quality claims. The final run used a unique
prefix and its distinct chat/execution and artifact root were verified.

Local evidence:

- `data/benchmark-runs/review-smoke-metadata.json` and
  `review-smoke3-metadata.json`: selected execution/usage metadata.
- Matching `review-smoke*-receipts.json`: tool receipts, retained locally only.
- `data/benchmark-runs/review-smoke-independent-probe.cjs`: independent checker;
  invoke with `node .../review-smoke-independent-probe.cjs <path/to/duration.js>`.
- `review-smoke-independent-probes.json` and
  `review-smoke3-independent-probes.json`: the 6,121-case probe results.
- `/tmp/engineering-review-artifact-tests.log` and
  `/tmp/engineering-review-artifact3-tests.log`: post-run generated-test checks.
- `/tmp/engineering-review-live-benchmark3.log`: fresh final runner log.

The final deployment was healthy, review-enabled and idle. These observations
verify the live protocol and one task's behavior, not an overall quality or speed
improvement. The observed timings are not a controlled performance benchmark.

## Comparison still required

Do not change previous grades or repair previous generated artifacts. Run the same
six tasks with fresh roots, the same GLM profile/model, 6,000 output tokens,
concurrency one, one attempt and the same 20-minute runner deadline. Record review
outcomes and repair counts alongside independent artifact checks and quality
probes. Keep deadline failures in the denominator and reconcile cancelled usage
against the execution journal; the previously recorded runner-accounting finding
remains outside this intervention.

Add a separate held-out batch with predeclared acceptance checks (for example a
transactional configuration updater and an exact bounded-integer ledger), keeping
its denominator separate from the six-task historical suite. Compare independent
checks and delivered quality, elapsed time and total usage, not the model's own
review verdict. This session does not claim a live benchmark quality uplift.

Remaining limitations: the initial worker still lacks the external benchmark
runner's remaining time; the fixed review packet can omit older receipts and
cannot review a truncated original scope conclusively; the same model can miss the
same defect twice. These constraints are disclosed rather than hidden by more
retries, longer benchmark deadlines or easier acceptance criteria.
