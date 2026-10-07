# GLM builder → OpenAI reviewer: full repeat, October 6, 2026

**Both workflows delivered 6/6, but the hybrid still used more total resources and did not demonstrate better code quality.** Review used 45.2% fewer reported frontier tokens, including cached input; uncached frontier input fell 20.4%. Combined hybrid tokens were 2.71× direct and aggregate model-stage time was 2.56×. This is useful evidence for selectively shifting frontier work, not proof of lower cost or senior-level autonomy.

[Detailed results and artifact grades](kujo-hybrid-repeat-2026-10-06.json) · [Previous pilot](kujo-hybrid-2026-10-06.md) · [Protocol](../../benchmarks/kujo-hybrid-protocol.md)

## Scope and validity

- Builder: `glm-5.3-flash:cloud`, Watchdog / Ollama Cloud.
- Direct implementer and reviewer: `gpt-5.6-sol`, Watchdog / Codex native harness.
- Measured commit: `160711784893932c1241b5add808eaaa65212173`, in a detached checkout. No production-code changes were made for this repeat.
- Same six tasks, alternating order, fresh chats, no stage retries, 900-second limits, and pinned Kujo 1.7.0 SHA-256 `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
- Native runtime inheritance correction `d46184f` is active; the original pilot preceded it.
- Completed 18 stages, October 6 22:52:51–October 7 00:10:18 UTC (October 6 local time), 77.4 minutes.
- Evidence: `data/kujo-hybrid-repeat-checkout/data/kujo-hybrid-round-6/`. Raw execution reasoning and credentials remain unpublished in ignored local evidence.
- All source/harness assets stayed frozen during this run. The owned server exited; live settings were not changed.

The initial shared-checkout attempt (`data/kujo-hybrid-round-5/`) was **invalidated**, not scored as a full round. Concurrent staged application changes modified `lib/local-runtime.js`; the acceptance guard stopped after four completed task pairs and the next direct execution. There is no evidence that this was a model-generated production edit. The isolated rerun starts from the original commit, not the concurrently upgraded application.

The invalid attempt consumed **11,751,283 reported tokens** across 13 stage requests. This includes 520,101 tokens for the final execution that completed but failed benchmark integrity; that usage was not included in its partially populated aggregate rows. These costs are preserved separately and are not silently erased or mixed into the valid result. Current-session measured usage is therefore **26,277,190 tokens** across the invalid and valid attempts. Earlier pilot/setup costs are separate.

## Completion and resource comparison

| Measure | Prior direct | Prior hybrid | Repeat direct | Repeat hybrid |
|---|---:|---:|---:|---:|
| Delivered and independently verified | 6/6 | 5/6 | **6/6** | **6/6** |
| Final-artifact correctness groups | 72/72 | 60/60; one undelivered | 72/72 | 72/72 |
| Frontier tokens, including cached input | 4,585,342 | 1,408,022 (five reviews) | 3,912,338 | 2,145,414 |
| Builder tokens | — | ≥17,361,800 | — | 8,468,155 |
| Combined tokens | 4,585,342 | ≥18,769,822 | 3,912,338 | 10,613,569 |
| Aggregate stage time | 25.4 min | 59.4 min | 21.6 min | 55.3 min |
| App-reported tool calls | 135 | 387 | 142 | 297 |

All repeat usage records are marked complete. Native attempt counts are not comparable to GLM provider-inference counts. Shared machine/provider load limits interpretation of elapsed times.

The repeat completed inventory rather than timing out in the previous repeated-guide loop. This is an observed recovery, **not proof that the unresolved loop has been fixed**: the loop-specific production code was not changed for this experiment. Removing that failed attempt improves the all-assigned resource total, but the successful hybrid remains expensive.

For the repeat's six matched tasks:

| Frontier usage | Direct | Reviewer |
|---|---:|---:|
| Input | 3,829,151 | 2,094,653 |
| Cached input | 3,607,040 | 1,917,952 |
| Uncached input | 222,111 | 176,701 |
| Output | 66,780 | 39,053 |
| Total reported | 3,912,338 | 2,145,414 |

The **45.2%** total frontier reduction is smaller than the previous five-pair **64.0%**, and uncached reduction is **20.4%**, versus **25.2%** previously. Different successful-task denominators matter. Token counters do not establish dollar savings, subscription-quota savings, or equal model reasoning effort; native totals can include accounting beyond displayed input/output sums.

## Artifact quality

Independent source and assertion review uses the same four anchored 0–4 dimensions: compatibility, maintainability, failure handling, and test adequacy, converted to /10. These are subjective, non-blind grades, not statistical estimates or career-level certifications.

| Task | Direct tokens | GLM tokens | Review tokens | Direct quality | Draft quality | Reviewed quality |
|---|---:|---:|---:|---:|---:|---:|
| Configuration | 569,702 | 1,422,824 | 263,683 | 7.500 | 6.250 | 6.875 |
| Pagination | 423,060 | 1,123,996 | 361,178 | 6.875 | 5.625 | 6.875 |
| Inventory | 977,904 | 2,052,896 | 182,079 | 6.250 | 6.875 | 6.875 |
| Migration | 323,399 | 1,665,002 | 391,874 | 7.500 | 6.875 | 6.875 |
| Atomic settings | 859,879 | 929,840 | 559,442 | 7.500 | 6.875 | 6.875 |
| CSV | 758,394 | 1,273,597 | 387,158 | 6.875 | 6.250 | 6.875 |
| Six-task mean | | | | **7.083** | **6.458** | **6.875** |

Reviewed artifacts happen to land in the same aggregate rubric band; this does not mean their strengths and defects are identical. Per-dimension scores and concrete evidence are retained in the JSON.

For the **same five tasks 1, 2, 4, 5, 6** that had reviews in the prior pilot:

| Quality mean | Prior | Repeat |
|---|---:|---:|
| Direct | 7.000 | 7.250 |
| Draft | 6.750 | 6.375 |
| Reviewed | 7.250 | 6.875 |

There is **no demonstrated quality improvement** in the repeated hybrid output. Review improved its own drafts by 0.417 points on average, but finished 0.208 below direct on all six tasks. These small subjective differences should not be treated as precise model rankings. Both rounds still look like useful supervised, broadly mid-level work on bounded tasks rather than reliably senior production judgment.

All 18 sources passed independent development and holdout checks: **216/216 groups**. That does not mean every delivered test package worked:

- Pagination draft: its shell runner omitted `run`, so **0/42** saved shell cases passed. Its separate four-case Go boundary runner did pass. Review corrected invocation, target directory and assertions; **47 shell cases plus four Go cases passed**.
- CSV draft: **28/31** saved cases passed. Incorrect quote-only and maximum-row expected values, plus a no-argument invocation mismatch, caused the failures. Review repaired them and added cases; **36/36 passed**.
- All six direct and all six reviewed artifacts passed every supplied harness rerun. Sixteen of all eighteen artifact packages passed completely. Sources were not manually repaired to improve results.

Other review gains were real but limited: byte-exact configuration assertions, whole-response inventory comparisons, migration type/scale cases, and permission-denied persistence tests. All six executable implementations were preserved; task 5 changed comments only. Most improvement came from the **test and handoff quality**, not different Kujo algorithms.

Remaining weaknesses included broad catches labeling unrelated faults invalid JSON, tests that strip final newlines, permissive regular-expression error checks, absolute candidate paths, unchecked/unremoved temporary directories, and unproven runtime claims copied into review notes. For example, inventory's blanket claim that imports cannot work contradicts the executed imported-helper suite from the interrupted attempt. That candidate statement is not accepted as a verified Kujo limitation.

## Interpretation

A GLM-first workflow can shift work away from the frontier model, but this repeat does not justify enabling it universally. It took more than twice the aggregate time, used 171.3% more combined tokens, and still needed review to repair test delivery. It is plausible for bounded, independently verifiable work where frontier allocation matters more than latency; actual economic benefit requires provider pricing/cache/quota measurements, not token-count assumptions.

Across the **two valid full rounds**, 12 direct tasks and 12 hybrid task assignments were tested. Direct delivered 12/12; hybrid delivered 11/12. There were 35 executed stages in those rounds (17 plus 18), plus the separately invalidated 13-stage attempt this session. No claim of consistent 6/6, senior-level autonomy, or frontier parity follows from one successful repeat.

## Limitations and follow-up

- The GLM shell allowlist and native Codex sandbox/tooling differ. This measures the deployed workflows, not equal-harness base models.
- Detached source checkout prevents concurrent repository edits from changing acceptance assets. It does not seal native filesystem access, shared temporary files, environment, host load, or upstream provider behavior.
- Native commands inspected repository documentation and made scratch probes outside their candidate directory. No hidden-grader content read was observed in retained command inspection; that is not an isolation guarantee.
- Keep the prior repeated-guide-loop finding open: SignalBox `cap_89bc35dc-49e3-40ec-8abb-ef678792e2b7` / `sig_b5e0048a-125d-478b-a371-d7ddddcb9508`.
- Future comparisons should start from a dedicated immutable checkout. Do not rerun from the active development tree or combine scores across invalidated attempts.
- Future product work should prioritize reliable runnable test handoffs and bounded recovery from malformed verification arguments. This repeat did not change those mechanisms or tune hidden cases.

## Verification receipt

- Runtime qualification: exact binary hash, 16 examples / 32 checks passed.
- Live command from isolated checkout: `node scripts/run-hybrid-benchmark.js --config benchmarks/kujo-hybrid.example.json --kujo /Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/toolchains/kujo-2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0 --kujo-sha256 2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0 --run --root data/kujo-hybrid-round-6`: passed, 18 stages, no retries.
- Independent `verify(file, task, phase, pinnedBinary)` rerun for both phases of all 18 snapshots: 216/216 passed; `independent-regrade.json`.
- `python3 /tmp/verify-hybrid-repeat.py`: ran all saved harnesses with pinned `KUJO_BIN`; receipts, exact per-artifact commands, exits and logs in `independent-harnesses/`. Two expected draft harness failures retained; all direct/reviewed packages passed. Candidate source hashes unchanged.
- `KUJO_REFERENCE_BIN=PINNED_BINARY node --test --test-concurrency=4 --test-timeout=120000 tests/*.test.js` on Node 22.17.0: **728 tests, 727 passed, zero failed, one existing skip**, 74.7 seconds. Log: `/tmp/kujo-hybrid-repeat-full-tests.log`. Verification targets the measured commit, not concurrent v1.3.0 application changes made elsewhere during the run.
- `git diff --check`: passed. Owned benchmark process exited normally.
