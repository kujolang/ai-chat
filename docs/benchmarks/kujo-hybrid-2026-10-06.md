# GLM builder → OpenAI reviewer: live pilot, October 6, 2026

**The workflow reduced frontier work on successful tasks, but did not improve overall efficiency or reliability.** OpenAI-only delivered 6/6; GLM followed by OpenAI delivered 5/6. On five matched successful tasks, review used 64.0% fewer reported frontier tokens, including cached input. Uncached frontier input fell only 25.2%. Reviewed artifacts were modestly better in this subjective assessment, not demonstrably senior-level or frontier-equivalent.

[Machine-readable results and per-artifact evidence](kujo-hybrid-2026-10-06.json) · [Protocol](../../benchmarks/kujo-hybrid-protocol.md)

## Experiment

- Repository: AI Chat, branch `main`; continuation started at `a3b4dfc`.
- Measured implementation: `2ae802947d3d7dadb35882a8800156135b288338`.
- Builder: `glm-5.3-flash:cloud`, Watchdog / Ollama Cloud.
- Direct implementer and reviewer: `gpt-5.6-sol`, Watchdog / Codex, native Codex CLI.
- Six existing Kujo maintenance tasks; alternating arm order; fresh chats and workspaces; no transport retries; 15-minute stage limits. Failed builders do not receive an upgrade.
- Runtime: qualified Kujo 1.7.0, SHA-256 `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
- Measurement: 19:56:59–21:22:27 UTC, approximately 85.5 minutes; 17 stages executed, one upgrade skipped.
- Evidence: ignored `data/kujo-hybrid-round-4/`; immutable source snapshots, execution receipts, checks, usage, and independent review. Raw reasoning and credentials are not published.
- The owned benchmark server stopped. The live app and its provider settings were not modified.

## Completion and resource use

| Measure | OpenAI-only | GLM → OpenAI |
|---|---:|---:|
| Delivered and independently verified tasks | 6/6 | 5/6 |
| Independent checks on delivered final artifacts | 72/72 | 60/60; remaining task undelivered |
| Reported frontier tokens | 4,585,342 | 1,408,022, for five reviews |
| Builder tokens | — | ≥17,361,800 |
| Combined tokens | 4,585,342 | ≥18,769,822 |
| Aggregate model-stage elapsed time | 25.4 min | 59.4 min |
| Tool calls reported by app | 135 | 387 |

Combined hybrid usage was **at least 4.09×** direct usage, and aggregate elapsed time **2.34×**, while delivering one fewer task. These are workflow figures, not pricing or subscription-allowance estimates. Builder accounting is incomplete for the cancelled stage; totals are lower bounds. Native Codex harness attempts are not comparable to GLM inference-round counts.

For matched tasks **1, 2, 4, 5, 6**:

| Measure | Direct | Hybrid |
|---|---:|---:|
| Frontier total tokens, including cached input | 3,913,796 | 1,408,022 |
| Frontier input / cached input | 3,846,980 / 3,627,136 | 1,366,399 / 1,202,048 |
| Frontier uncached input | 219,844 | 164,351 |
| Frontier output | 52,296 | 34,001 |
| All-model tokens | 3,913,796 | 5,883,163 |
| Model-stage elapsed time | 21.0 min | 44.4 min |

Even excluding the failed builder, hybrid used **50.3% more total tokens** and approximately **2.11× the time**. The 64.0% frontier-token reduction must not be presented as a 64.0% bill or quota reduction. Reported total counters can include additional reasoning accounting beyond the displayed output counter.

## Task comparison

Token columns include cached input; all attempted work remains counted.

| Task | Direct tokens | Builder tokens | Review tokens | Direct / draft / reviewed checks |
|---|---:|---:|---:|---|
| 1 Configuration | 789,785 | 1,358,566 | 322,162 | 13/13 · 13/13 · 13/13 |
| 2 Pagination | 680,423 | 495,503 | 232,374 | 12/12 · 12/12 · 12/12 |
| 3 Inventory | 671,546 | ≥12,886,659 | Not run | 12/12 · 10/12 partial · undelivered |
| 4 Migration | 690,318 | 496,280 | 138,822 | 12/12 · 12/12 · 12/12 |
| 5 Atomic settings | 1,290,347 | 1,438,283 | 307,928 | 11/11 · 11/11 · 11/11 |
| 6 CSV | 462,923 | 686,509 | 406,736 | 12/12 · 12/12 · 12/12 |

Task 3 failed delivery after 900 seconds. Its record contains **70 identical `local_kujo` guide requests for `staged_validation`**, 178 provider rounds, and 177 reported tool calls. The partial source left JSON parsing uncaught and had no saved regression harness. Independent failures were malformed JSON and missing argument. This was repeated agent/tool activity, not a blocked shell permission or server restart. The underlying model/context cause has not been isolated; existing progress protections did not stop this specific loop before the deadline.

## Independent quality assessment

Each artifact was inspected for compatibility, maintainability, failure handling, and test adequacy. Each dimension uses the protocol's anchored 0–4 scale, converted to /10. Scores are subjective, not blinded, and not calibrated across reviewers. Passing checks did not determine the grade.

| Task | Direct | GLM draft | Reviewed |
|---|---:|---:|---:|
| Configuration | 6.875 | 6.875 | 7.500 |
| Pagination | 6.250 | 6.875 | 6.875 |
| Inventory | 6.250 | 3.750, partial | — |
| Migration | 7.500 | 6.250 | 6.875 |
| Atomic settings | 7.500 | 6.875 | 7.500 |
| CSV | 6.875 | 6.875 | 7.500 |
| Matched successful-task mean | **7.000** | **6.750** | **7.250** |

All six direct artifacts average 6.875. All builder artifacts, including the partial failure, average 6.250; do not compare that denominator with five reviewed deliveries without the completion figures.

Concrete review improvements:

- Configuration: preserved source; replaced newline-stripping assertions with byte comparisons and strengthened Unicode coverage.
- Pagination: corrected the Go harness target and enforced single JSON values/exact keys. It retained an absolute candidate path and a shell runtime override; its source-defect explanation was confounded by that override.
- Migration: preserved source; fixed a harness that fabricated empty stderr after successful `execFileSync`, then added missing type cases.
- Atomic settings: preserved source; added a one-command suite for CLI cases, unwritable destination, and file-byte preservation.
- CSV: preserved source; fixed the wrong candidate path and expanded three retained cases to 23, including quoting, controls, Unicode, and errors.

Four of five reviewed `main.kujo` files were unchanged. Most gains were **verification quality and repeatability**, not better core algorithms. Direct output also had weaknesses: double-executed shell cases, generic diagnostics, weak JSON-pattern assertions, and a CSV harness accepting any nonzero exit rather than exactly 1. An independent conflict probe confirmed that the direct persistence implementation's thrown error works on the pinned runtime; it was not graded as an undefined-function defect.

Professional assessment: useful supervised implementation work, broadly strong mid-level on these bounded tasks. The review stage caught real gaps and usually avoided needless rewrites. The +0.25 matched advantage over direct is small and cannot establish general superiority or senior-level autonomy from one five-pair sample.

## Setup defects, repairs, and limitations

Three earlier attempts were invalid setup attempts, not successful comparison rounds:

| Attempt | Reason stopped | Reported tokens |
|---|---|---:|
| `kujo-hybrid-round-1` | Native Codex inherited read-only sandbox; native usage-completeness metadata was missing | ≥650,691 |
| `kujo-hybrid-round-2` | Personal AGENTS/skill instructions triggered unrelated Strata work | Unknown; cancellation returned no usage |
| `kujo-hybrid-round-3` | Existing chat-title reuse substituted the direct answer for the upgrade; no actual upgrade call occurred | 1,311,672 |

Setup overhead is **at least 1,962,363 reported tokens plus unknown attempt-2 usage**. The reused answer's tokens are not counted twice.

Repairs committed during preparation: explicit benchmark workspace-write, honest missing/resumed native usage metadata, benchmark-only personal-instruction isolation, fresh stage chats, unique titles, and rejection of reused evidence. Normal interactive Codex behavior and ordinary benchmark resumability remain intact. Instruction overrides use the [official Codex configuration schema](https://learn.chatgpt.com/docs/config-schema.json).

The measured pilot still had a runtime-inheritance caveat: task 2's generated shell harness honored inherited `KUJO_BIN`, which selected the app's bridge binary rather than the qualified agent binary. Its reviewer attributed that runtime's failure to the source. Independent grading always used the pinned binary; the original draft also passed a direct pinned-runtime probe. All post-run harness checks explicitly set the pinned environment. Commit `d46184f` fixes future isolated native subprocess inheritance without changing the bridge or interactive environment. **These measurements predate that fix; no rerun is claimed.**

Filesystem boundaries were instructions, not sealed OS isolation. Native temporary probes strayed outside candidate directories, and two supplied harnesses initially referenced draft paths. Retained command review found no hidden-grader content reads, but this is not a guarantee against all contamination. Harness differences, cached input, one realization per task, and subjective review limit generalization.

## Recommendation and remaining work

Use builder → reviewer selectively for bounded work with a validated handoff, not as an unattended default. The successful pairs support reduced frontier effort, but this pilot does not establish lower total cost or equal reliability.

Before another comparative run:

1. Diagnose and bound repeated guide calls without cutting off legitimate research. Add a regression reproducing this exact successful-but-unproductive guide sequence, preserving useful results and failed-run costs.
2. Use the corrected native runtime environment and require generated harnesses to resolve their own candidate. Preserve real command provenance before accepting runtime-defect claims.
3. Repeat the same comparison with independent budget and quality criteria. Keep timeout failures in all-assigned totals; report cached/uncached input separately. Do not optimize the grade by changing hidden checks or silently replaying failed work.

No production profiles, models, chats, provider routing, or personal Codex settings were changed by this experiment.

## Verification receipt

- Runtime qualification: 16 examples / 32 checks passed, exact binary hash verified.
- `node --test tests/benchmark-selection.test.js tests/hybrid-benchmark.test.js`: 22 passed.
- `node --test --test-name-pattern='unknown native' tests/server-routes.test.js`: six passed, including isolation opt-in/off and interactive compatibility plus runtime inheritance.
- `KUJO_REFERENCE_BIN=PINNED_BINARY node --test --test-concurrency=4 --test-timeout=120000 tests/*.test.js`: **728 tests, 727 passed, zero failed, one existing skip** after final code change. Node 22.17.0. Log: `/tmp/hybrid-postrun-full-tests.log`.
- Live invocation: `node scripts/run-hybrid-benchmark.js --config benchmarks/kujo-hybrid.example.json --kujo data/toolchains/kujo-2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0 --kujo-sha256 2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0 --run --root data/kujo-hybrid-round-4`: completed.
- Independent rerun of both grader phases for every saved source: **202/204 checks passed**; only the two known partial-draft failures. Receipt: `data/kujo-hybrid-round-4/independent-regrade.json`.
- Saved harness reruns: **all 16 delivered artifacts passed**, with pinned `KUJO_BIN`; task 5 draft's documented table/fixture sequence was orchestrated independently. Exact per-artifact commands and logs: `data/kujo-hybrid-round-4/independent-harnesses/receipt.json`. Candidate source hashes stayed unchanged.
- `git diff --check`: passed. Owned benchmark process exited; live app health checked after completion.

## Durable follow-up

SignalBox project `ai-chat`: capture `cap_89bc35dc-49e3-40ec-8abb-ef678792e2b7`,
signal `sig_b5e0048a-125d-478b-a371-d7ddddcb9508` track the unresolved repeated-guide
loop. Exact-ID and concept retrieval passed. No duplicate was found; an unrelated
Dispatch tool-loop signal was excluded. Completed setup repairs and routine test
results were not captured as open findings.
