# RND001 Model Evaluation: TST001–TST009

## Scope and method

This report evaluates the three stored responses in each AI Chat comparison from `RND001TST001` through `RND001TST009`. Each response is scored from 1–5 for correctness, instruction following, completeness, clarity, practical usefulness, and reasoning/judgment, for a maximum of 30.

Evidence came from the persisted chat content in `data/ai_chat.db`, provider-reported token usage, Watchdog latency telemetry where available, and direct execution of the Python scripts/tests in TST002 and TST003. TST001–TST003 predate the available Watchdog records, so per-model response time is not recoverable for those tests. Token counts include provider-reported reasoning tokens when the provider includes them.

The scoring reflects the response actually stored in AI Chat. In particular, the MiniMax response for TST007 ends mid-sentence and is scored as incomplete.

## Model metadata

| Model | Published size | Quantization | Hardware used |
|---|---:|---|---|
| `glm-5.2:cloud` | 756B parameters ([Ollama listing](https://ollama.com/library/glm-5.2%3Acloud)) | Not disclosed for the cloud deployment | Ollama Cloud; provider hardware not disclosed |
| `kimi-k2.7-code:cloud` | 1.04T parameters ([Ollama listing](https://ollama.com/library/kimi-k2.7-code%3Acloud)) | Not disclosed for the cloud deployment | Ollama Cloud; provider hardware not disclosed |
| `minimax-m3:cloud` | Not disclosed on the [Ollama listing](https://ollama.com/library/minimax-m3%3Acloud) | Not disclosed for the cloud deployment | Ollama Cloud; provider hardware not disclosed |

## Executive scorecard

| Test | GLM-5.2 | Kimi K2.7 Code | MiniMax M3 | Test winner |
|---|---:|---:|---:|---|
| TST001 — Python security review | 24 | 24 | 27 | MiniMax M3 |
| TST002 — SQLite task queue | 24 | 27 | 19 | Kimi K2.7 Code |
| TST003 — Rate limiter | 25 | 18 | 23 | GLM-5.2 |
| TST004 — Authentication review | 27 | 26 | 24 | GLM-5.2 |
| TST005 — Human decision system | 27 | 28 | 29 | MiniMax M3 |
| TST006 — Noisy issue investigation | 26 | 29 | 25 | Kimi K2.7 Code |
| TST007 — Connector PRD | 26 | 28 | 16 | Kimi K2.7 Code |
| TST008 — Kujo homepage copy | 21 | 25 | 22 | Kimi K2.7 Code |
| TST009 — Model routing recommendation | 28 | 27 | 29 | MiniMax M3 |
| **Total / 270** | **228** | **232** | **214** | **Kimi K2.7 Code** |
| **Average / 30** | **25.3** | **25.8** | **23.8** | **Kimi K2.7 Code** |

The aggregate gap between GLM and Kimi is small. Kimi is faster and more concise; GLM is more consistently thorough. MiniMax has several excellent planning/review responses, but its two executable-code failures and truncated TST007 response materially reduce its aggregate.

### Efficiency summary

| Model | Mean latency, TST004–TST009 | Provider-reported output tokens, all tests | Quality points per 1,000 output tokens |
|---|---:|---:|---:|
| GLM-5.2 | 47.0 seconds | 36,436 | 6.26 |
| Kimi K2.7 Code | 32.8 seconds | 34,477 | 6.73 |
| MiniMax M3 | 58.9 seconds | 80,554 | 2.66 |

Latency averages exclude TST001–TST003 because those calls have no retained Watchdog timing records. MiniMax token totals are especially affected by provider-reported reasoning tokens and should not be interpreted as visible-answer length alone.

---

## TST001 — Python code review and security fixes

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST001 — Python security review
- **Total response time:** Not captured
- **Approximate input tokens:** 641
- **Approximate output tokens:** 2,480
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **24/30**
- **Best part of the response:** Clearly identifies SQL injection, token leakage, SSRF, missing validation, cleanup, error handling, and unsafe debug deployment.
- **Most important weakness:** Presents a hostname blacklist as adequate SSRF protection and supplies tests that do not correctly patch the module-level database path.
- **Major factual or technical errors:** DNS names that resolve to private/link-local IPs remain allowed; redirects remain enabled; the test fixture changes `DATABASE` in the environment after module import, so the app still points to the original database.
- **Usable without major revision:** No
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Unsupervised security implementer
- **Additional notes:** Strong review narrative, but the replacement needs a true allowlist or post-resolution IP validation and corrected tests.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST001 — Python security review
- **Total response time:** Not captured
- **Approximate input tokens:** 463
- **Approximate output tokens:** 2,693
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **24/30**
- **Best part of the response:** Produces a compact, readable replacement and disables callback redirects.
- **Most important weakness:** Claims resource cleanup and SSRF protection that the code does not fully provide.
- **Major factual or technical errors:** A `sqlite3.Connection` context manager commits or rolls back but does not close the connection; with an empty callback allowlist, arbitrary public hostnames are accepted; DNS rebinding/private DNS resolution is not checked.
- **Usable without major revision:** No
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Unsupervised security implementer
- **Additional notes:** The added `init_db()` changes application behavior beyond the requested repair.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST001 — Python security review
- **Total response time:** Not captured
- **Approximate input tokens:** 901
- **Approximate output tokens:** 5,611
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **27/30**
- **Best part of the response:** Uses an explicit HTTPS hostname allowlist, blocks redirects, removes the token from both SELECT and output, and recognizes missing authentication.
- **Most important weakness:** Overstates automatic SQLite cleanup and is substantially more verbose than necessary.
- **Major factual or technical errors:** The connection context manager does not itself close the connection, despite the explanation saying it does.
- **Usable without major revision:** Yes, with a small cleanup fix and real allowlist configuration
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Best security judgment of the three for this test.

---

## TST002 — Lightweight SQLite task queue

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST002 — SQLite task queue
- **Total response time:** Not captured
- **Approximate input tokens:** 489
- **Approximate output tokens:** 4,295
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **24/30**
- **Best part of the response:** Implements atomic claiming with `BEGIN IMMEDIATE` and `UPDATE ... RETURNING`, plus meaningful retry and contention tests.
- **Most important weakness:** The delivered script does not pass its own full test suite on the evaluation machine.
- **Major factual or technical errors:** The process test defines its worker locally and fails under macOS `spawn` with `Can't pickle local object`; `mark_completed` does not require the task to be running; the demo's “first pass” exhausts all retries immediately.
- **Usable without major revision:** No
- **Likely best role:** Implementer
- **Likely unsuitable roles:** Unreviewed cross-platform test author
- **Additional notes:** Direct execution: 8 tests passed, 1 errored.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST002 — SQLite task queue
- **Total response time:** Not captured
- **Approximate input tokens:** 310
- **Approximate output tokens:** 8,769
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **27/30**
- **Best part of the response:** Clean state transitions, explicit retry semantics, and a script that runs successfully with all included tests passing.
- **Most important weakness:** The claimed “no double claim” coverage is sequential, not concurrent, while one shared connection is exposed across threads without a lock.
- **Major factual or technical errors:** `check_same_thread=False` does not make concurrent access to the same connection safe; the test does not exercise two simultaneous workers.
- **Usable without major revision:** Yes for single-threaded or one-connection-per-worker use; no for the stated shared-thread scenario
- **Likely best role:** Implementer
- **Likely unsuitable roles:** Concurrency reviewer without an independent test harness
- **Additional notes:** Direct execution: 7 tests passed.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST002 — SQLite task queue
- **Total response time:** Not captured
- **Approximate input tokens:** 2,321
- **Approximate output tokens:** 30,832
- **Correctness:** 2
- **Instruction following:** 4
- **Completeness:** 4
- **Clarity:** 4
- **Practical usefulness:** 2
- **Reasoning and judgment:** 3
- **Total quality score:** **19/30**
- **Best part of the response:** Sensible schema, attempt accounting, file-backed connection lifecycle, and clear multi-machine limitations.
- **Most important weakness:** The implementation fails the central no-double-claim contention requirement in its own test.
- **Major factual or technical errors:** Concurrent threads share the in-memory connection without synchronization, causing transaction-state errors and lost task processing.
- **Usable without major revision:** No
- **Likely best role:** Task Runner for prototypes
- **Likely unsuitable roles:** Production implementer for concurrent systems
- **Additional notes:** Direct execution: contention test failed with multiple SQLite transaction errors; 47 of 50 tasks were observed.

---

## TST003 — Enhanced rate limiter

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST003 — Rate limiter
- **Total response time:** Not captured
- **Approximate input tokens:** 547
- **Approximate output tokens:** 4,772
- **Correctness:** 4
- **Instruction following:** 4
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Periodic global cleanup actually removes inactive users, while per-action limits and injected time are well covered.
- **Most important weakness:** Uses `pytest` despite an otherwise standard-library solution and does not validate zero/negative limits or windows.
- **Major factual or technical errors:** The test named `test_limit_zero_raises` does not test zero; it only tests the missing-limit case. The prose calls `time.time` monotonic even though it is not.
- **Usable without major revision:** Yes, after input validation and test cleanup
- **Likely best role:** Implementer
- **Likely unsuitable roles:** Minimal-dependency task runner
- **Additional notes:** Tests are structured as a separate module and require `pytest` plus an importable `rate_limiter` module.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST003 — Rate limiter
- **Total response time:** Not captured
- **Approximate input tokens:** 366
- **Approximate output tokens:** 4,745
- **Correctness:** 2
- **Instruction following:** 4
- **Completeness:** 3
- **Clarity:** 4
- **Practical usefulness:** 2
- **Reasoning and judgment:** 3
- **Total quality score:** **18/30**
- **Best part of the response:** The result object preserves truthiness while exposing remaining capacity and retry time.
- **Most important weakness:** It explicitly leaves inactive users in memory forever, directly missing a required feature.
- **Major factual or technical errors:** The memory-cleanup test expects the map to be empty immediately after admitting a new request for that same user; the implementation correctly contains the new timestamp, so the included test fails.
- **Usable without major revision:** No
- **Likely best role:** Task Runner
- **Likely unsuitable roles:** Implementer for stateful/concurrent components
- **Additional notes:** Direct execution: 8 tests passed, 1 failed.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST003 — Rate limiter
- **Total response time:** Not captured
- **Approximate input tokens:** 1,655
- **Approximate output tokens:** 20,311
- **Correctness:** 3
- **Instruction following:** 4
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **23/30**
- **Best part of the response:** Preserves the original boolean return exactly, adds separate query methods, and makes mutation thread-safe.
- **Most important weakness:** Cleanup is disabled by default and requires an external caller, so simple legacy usage can still grow indefinitely.
- **Major factual or technical errors:** The `test_reset_single_action` test claims the untouched API bucket should be blocked without first consuming it; the test fails.
- **Usable without major revision:** No, because the supplied test suite fails and cleanup needs an operating policy
- **Likely best role:** Implementer with review
- **Likely unsuitable roles:** Autonomous test author
- **Additional notes:** Direct execution: 16 tests passed, 1 failed.

---

## TST004 — Authentication-flow security review

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST004 — Authentication review
- **Total response time:** 48.528 seconds
- **Approximate input tokens:** 548
- **Approximate output tokens:** 4,372
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **27/30**
- **Best part of the response:** Prioritizes plaintext passwords and predictable bearer tokens correctly, then supplies a complete safer flow with expiry, cookie flags, rate limiting, middleware, and logout.
- **Most important weakness:** The replacement has initialization and data-model details that are unsafe or incomplete as written.
- **Major factual or technical errors:** `DUMMY_HASH` is populated asynchronously and can be undefined during an early login; session tokens remain stored plaintext; account lockout update behavior depends on an unspecified database API.
- **Usable without major revision:** Yes as detailed pseudocode, not as drop-in code
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Unsupervised authentication implementer
- **Additional notes:** Thorough, but longer than needed for a prioritized executive review.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST004 — Authentication review
- **Total response time:** 23.952 seconds
- **Approximate input tokens:** 370
- **Approximate output tokens:** 2,837
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Efficiently covers credential storage, token entropy, cookies, user-object leakage, brute force, validation, expiry, and minimal response fields.
- **Most important weakness:** Overstates a NoSQL authentication-bypass scenario and uses a questionable dummy bcrypt hash.
- **Major factual or technical errors:** An object submitted as `password` is not strictly equal to a stored password string, so the shown `$ne` payload does not itself bypass the JavaScript comparison; the dummy hash may be rejected or processed differently rather than equalizing timing.
- **Usable without major revision:** Yes as a review; replacement requires correction
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Final authority on authentication code
- **Additional notes:** Best latency and best concision in this test.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST004 — Authentication review
- **Total response time:** 58.995 seconds
- **Approximate input tokens:** 809
- **Approximate output tokens:** 4,102
- **Correctness:** 2
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **24/30**
- **Best part of the response:** Broad threat coverage, strong prioritization, hashed session identifiers, human-readable fix order, and explicit human accountability.
- **Most important weakness:** The proposed JWT/session combination claims revocation but does not enforce the server-side session during authentication.
- **Major factual or technical errors:** Changing the user ID in a base64 token is not sufficient if the server validates the stored opaque token; the NoSQL password-object bypass is not supported by strict inequality; `requireAuth` verifies only the JWT and never checks the session row, so logout/session deletion does not revoke the JWT before expiry; the dummy bcrypt hash is not a valid known hash.
- **Usable without major revision:** No
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Authentication implementer
- **Additional notes:** Convincing presentation masks several important technical inconsistencies.

---

## TST005 — Human-in-the-loop decision system

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST005 — Human decision system plan
- **Total response time:** 66.226 seconds
- **Approximate input tokens:** 467
- **Approximate output tokens:** 6,077
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **27/30**
- **Best part of the response:** Excellent coverage of state transitions, idempotency, crash recovery, adapter boundaries, contracts, concurrency, failure modes, and phased delivery.
- **Most important weakness:** The architecture is larger than the “practical, composable” request requires for an initial system.
- **Major factual or technical errors:** A globally unique creation idempotency key should be scoped to tenant/caller; callback URLs introduce SSRF risk but are not addressed; “store both racing responses” needs a carefully specified transaction order to avoid recording an unauthorized losing decision as equivalent audit evidence.
- **Usable without major revision:** Yes as an architecture reference; trim for MVP
- **Likely best role:** Planner / Orchestrator
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Strongest on exhaustive architecture, weakest on economy.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST005 — Human decision system plan
- **Total response time:** 58.300 seconds
- **Approximate input tokens:** 283
- **Approximate output tokens:** 5,024
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **28/30**
- **Best part of the response:** Keeps `changes_requested` immutable by creating a linked follow-up request and uses the transactional outbox plus compare-and-set updates correctly.
- **Most important weakness:** The API contract lets the request body carry `submitted_by` and `channel`, values that should be derived from the authenticated adapter identity.
- **Major factual or technical errors:** A proposed “partial unique index on terminal states” is not the primary race-prevention mechanism described; the conditional update is. Identity/channel provenance must not be trusted from client JSON.
- **Usable without major revision:** Yes
- **Likely best role:** Planner / Product Thinker
- **Likely unsuitable roles:** None for this task, provided security review follows
- **Additional notes:** Best balance of completeness and composability.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST005 — Human decision system plan
- **Total response time:** 64.779 seconds
- **Approximate input tokens:** 721
- **Approximate output tokens:** 4,676
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **29/30**
- **Best part of the response:** Centers the design on one durable decision primitive and correctly identifies the conditional database update as the core concurrency guarantee.
- **Most important weakness:** The MVP still takes on password authentication and an email outbox consumer, which add operational/security scope before Slack/Discord adapters are proven.
- **Major factual or technical errors:** None material; a few endpoint and MVP choices need product-specific validation.
- **Usable without major revision:** Yes
- **Likely best role:** Orchestrator / Planner
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Strongest system-design answer in the suite.

---

## TST006 — Investigation of noisy issue generation

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST006 — One-week investigation plan
- **Total response time:** 68.434 seconds
- **Approximate input tokens:** 495
- **Approximate output tokens:** 6,036
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Provides explicit hypothesis tests, thresholds, stop conditions, high-value retention protection, and harden/replace/remove criteria.
- **Most important weakness:** It is overly long and prescribes a seven-day calendar including weekend implementation before measurement quality and staffing are known.
- **Major factual or technical errors:** None material, though “any known high-value loss” as an immediate bypass stop is stricter than its later recall thresholds and can make controlled ablation inconclusive.
- **Usable without major revision:** Yes, after reducing scope and assigning realistic owners/capacity
- **Likely best role:** Planner
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Excellent structure, but operationally heavy for one week.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST006 — One-week investigation plan
- **Total response time:** 52.969 seconds
- **Approximate input tokens:** 313
- **Approximate output tokens:** 5,153
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **29/30**
- **Best part of the response:** Separates facts, assumptions, and recommendations consistently while testing causal, input-quality, duplication, and labeling hypotheses.
- **Most important weakness:** The experiment set is ambitious for one week and relies on expert labeling and alternative-reviewer capacity that may not exist.
- **Major factual or technical errors:** None material.
- **Usable without major revision:** Yes
- **Likely best role:** Planner / Reviewer
- **Likely unsuitable roles:** None for this task
- **Additional notes:** Best investigation plan and best balance of evidence and restraint.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST006 — One-week investigation plan
- **Total response time:** 62.273 seconds
- **Approximate input tokens:** 750
- **Approximate output tokens:** 3,989
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 3
- **Total quality score:** **25/30**
- **Best part of the response:** Strong hypothesis table, attention to label reliability, and conservative removal criteria.
- **Most important weakness:** Contains a visible arithmetic error and an internally inconsistent experiment schedule.
- **Major factual or technical errors:** States that about 4,200 issues per day were not high-value; the correct figure is about 600 per day or 8,400 total. It proposes a seven-day shadow sample of at least 4,000 findings while also using results for decisions within the same one-week plan.
- **Usable without major revision:** Yes after correcting the baseline and experiment timing
- **Likely best role:** Planner
- **Likely unsuitable roles:** Executive analyst without fact checking
- **Additional notes:** Strong form, weaker numerical discipline.

---

## TST007 — WordPress connector PRD

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST007 — Connector recovery/modularization PRD
- **Total response time:** 34.698 seconds
- **Approximate input tokens:** 474
- **Approximate output tokens:** 2,871
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Clean separation between incident recovery and modularization, with measurable acceptance criteria and operator controls.
- **Most important weakness:** It is not concise and invents several current-state details and future technical capabilities not supplied in the prompt.
- **Major factual or technical errors:** Labels records “unrecoverable,” asserts specific partial/duplicate state categories, and supplies an outdated `2025-01-17` document date without evidence. Capturing a prior database state does not guarantee rollback of remote WordPress side effects.
- **Usable without major revision:** Yes as a draft requiring stakeholder correction
- **Likely best role:** Product Thinker / Planner
- **Likely unsuitable roles:** Concise executive writer
- **Additional notes:** Most thorough PRD, but scope and assumptions need pruning.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST007 — Connector recovery/modularization PRD
- **Total response time:** 17.048 seconds
- **Approximate input tokens:** 293
- **Approximate output tokens:** 1,686
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 5
- **Reasoning and judgment:** 4
- **Total quality score:** **28/30**
- **Best part of the response:** Concise, complete, clearly phased, and immediately useful for stakeholder review.
- **Most important weakness:** Rollback language assumes database snapshots and per-record state snapshots can safely reverse external side effects.
- **Major factual or technical errors:** “Provider abstraction” expands beyond the stated WordPress connector without evidence that other website backends are in scope; remote rollback semantics remain unspecified.
- **Usable without major revision:** Yes
- **Likely best role:** Product Thinker
- **Likely unsuitable roles:** None for this task
- **Additional notes:** Best PRD response and fastest completion.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST007 — Connector recovery/modularization PRD
- **Total response time:** 51.706 seconds
- **Approximate input tokens:** 729
- **Approximate output tokens:** 3,369 (Watchdog telemetry)
- **Correctness:** 4
- **Instruction following:** 2
- **Completeness:** 1
- **Clarity:** 4
- **Practical usefulness:** 2
- **Reasoning and judgment:** 3
- **Total quality score:** **16/30**
- **Best part of the response:** Strong opening principle—“audit first, mutate second”—and useful idempotency/recovery safeguards.
- **Most important weakness:** The persisted response ends abruptly in the security section and omits the remaining requested sections.
- **Major factual or technical errors:** No major error before truncation; the artifact itself is incomplete.
- **Usable without major revision:** No
- **Likely best role:** Planner when output completion is guaranteed
- **Likely unsuitable roles:** Task Runner requiring a complete deliverable
- **Additional notes:** Stored content ends mid-sentence; scoring reflects the available response, not presumed upstream content.

---

## TST008 — Kujo homepage copy

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST008 — Homepage copy
- **Total response time:** 12.077 seconds
- **Approximate input tokens:** 469
- **Approximate output tokens:** 812
- **Correctness:** 2
- **Instruction following:** 4
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 2
- **Total quality score:** **21/30**
- **Best part of the response:** Memorable hero line and clean page structure.
- **Most important weakness:** Invents a large technical feature set and converts positioning into unsupported product claims.
- **Major factual or technical errors:** Claims module/function permissions, structured rationales, dependency impact summaries, contract annotations, effect tracking, machine-readable proof bundles, and CI integrations without supplied evidence; “If it compiles, you know what it does” is an especially unsafe overclaim.
- **Usable without major revision:** No
- **Likely best role:** Marketing and Communication Model after fact grounding
- **Likely unsuitable roles:** Unsupervised product marketing
- **Additional notes:** Strong language, weak claim discipline.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST008 — Homepage copy
- **Total response time:** 7.628 seconds
- **Approximate input tokens:** 295
- **Approximate output tokens:** 616
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Short, direct, cohesive copy that uses the requested tagline naturally and avoids most generic AI language.
- **Most important weakness:** Still invents technical mechanisms rather than keeping claims at the supplied positioning level.
- **Major factual or technical errors:** Asserts built-in contracts, effects, invariants, property tests, evidence trails, and reversible authority without provided product evidence.
- **Usable without major revision:** Yes after a factual claims pass
- **Likely best role:** Marketing and Communication Model
- **Likely unsuitable roles:** Final technical fact checker
- **Additional notes:** Best marketing response and lowest latency in the suite.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST008 — Homepage copy
- **Total response time:** 46.293 seconds
- **Approximate input tokens:** 724
- **Approximate output tokens:** 3,499
- **Correctness:** 2
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 2
- **Total quality score:** **22/30**
- **Best part of the response:** Excellent headline hierarchy and audience-oriented phrasing.
- **Most important weakness:** Makes the most aggressive unsupported proof and platform claims.
- **Major factual or technical errors:** Claims deterministic builds, signed replayable evidence bundles, open-source implementation, prompt/human attribution, policy-as-code, and proof-carrying releases without supplied evidence.
- **Usable without major revision:** No
- **Likely best role:** Marketing and Communication Model after strict grounding
- **Likely unsuitable roles:** Final product claims owner
- **Additional notes:** Polished but high hallucination risk in marketing copy.

---

## TST009 — Executive model-routing recommendation

### GLM-5.2

- **Model:** `glm-5.2:cloud`
- **Model size:** 756B parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST009 — Model routing recommendation
- **Total response time:** 52.033 seconds
- **Approximate input tokens:** 500
- **Approximate output tokens:** 4,721
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **28/30**
- **Best part of the response:** Comprehensive role definitions, consequence-based routing, measurable evaluation criteria, escalation rules, human gates, and a concrete pilot.
- **Most important weakness:** Far too long for an executive recommendation and risks burying the decision in implementation detail.
- **Major factual or technical errors:** None material.
- **Usable without major revision:** Yes after executive condensation
- **Likely best role:** Orchestrator / Planner
- **Likely unsuitable roles:** Concise task runner
- **Additional notes:** Strong operating model; weakest dimension is economy.

### Kimi K2.7 Code

- **Model:** `kimi-k2.7-code:cloud`
- **Model size:** 1.04T parameters
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST009 — Model routing recommendation
- **Total response time:** 36.956 seconds
- **Approximate input tokens:** 322
- **Approximate output tokens:** 2,954
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **27/30**
- **Best part of the response:** Concise, executive-friendly role portfolio and a straightforward 30-day evidence-gathering pilot.
- **Most important weakness:** Routing relies on model “confidence,” which is not inherently calibrated, and lacks role-specific promotion/stop thresholds.
- **Major factual or technical errors:** Model self-confidence should not be used as a primary escalation signal unless it has been empirically calibrated against task outcomes.
- **Usable without major revision:** Yes
- **Likely best role:** Product Thinker / Planner
- **Likely unsuitable roles:** Final model-risk authority
- **Additional notes:** Best executive concision of the three.

### MiniMax M3

- **Model:** `minimax-m3:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST009 — Model routing recommendation
- **Total response time:** 69.399 seconds
- **Approximate input tokens:** 759
- **Approximate output tokens:** 4,165
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 5
- **Reasoning and judgment:** 5
- **Total quality score:** **29/30**
- **Best part of the response:** Treats roles as stable abstractions and models as replaceable implementations, with auditable routing, human gates, frozen evaluation sets, and explicit organizational decisions.
- **Most important weakness:** Recommends using the same model with a high-temperature critic prompt as a possible reviewer, which weakens independence and reproducibility.
- **Major factual or technical errors:** Higher temperature is not a reliability control and should not be presented as a substitute for producer-reviewer diversity.
- **Usable without major revision:** Yes
- **Likely best role:** Orchestrator
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Best executive operating model, though also the slowest response.

---

## Final role classification

### GLM-5.2

- **Primary classification:** Planner
- **Strong secondary roles:** Reviewer, Orchestrator
- **Conditional roles:** Implementer when tests are executed independently; Product Thinker when verbosity is constrained
- **Likely unsuitable roles:** Fast/economical Task Runner; unsupervised Marketing and Communication Model
- **Why:** It is consistently thorough, risk-aware, and strong at architecture and review. Its main costs are verbosity, slower responses, scope expansion, and occasional implementation/test defects.

### Kimi K2.7 Code

- **Primary classification:** Product Thinker
- **Strong secondary roles:** Planner, Task Runner, Implementer for bounded work, Marketing and Communication Model
- **Conditional roles:** Reviewer with mandatory technical verification
- **Likely unsuitable roles:** Sole authority for security/concurrency/stateful implementations
- **Why:** It achieved the highest aggregate score, was generally the fastest model, and produced the best concise PRD, investigation plan, and homepage draft. Its main weakness is that polished, concise answers sometimes conceal missed state/concurrency requirements or overconfident security details.

### MiniMax M3

- **Primary classification:** Orchestrator
- **Strong secondary roles:** Planner, Reviewer
- **Conditional roles:** Product Thinker when output completion is monitored
- **Likely unsuitable roles:** Production Implementer, fast Task Runner, final Marketing and Communication Model
- **Why:** Its best responses show excellent systems judgment, role separation, and governance thinking. However, it was usually slowest, produced very high token counts, failed both executable coding tests, made several confident technical overclaims, and had one truncated persisted response.

## Recommended deployment posture

1. Use **Kimi** as the default for bounded drafting, PRDs, investigation plans, and communication tasks, with automated or human correctness checks.
2. Use **GLM** for deep planning and structured review where thoroughness is worth the latency/token cost.
3. Use **MiniMax** for orchestrator and operating-model work, but not as the default implementation model until code execution reliability improves.
4. Require deterministic test execution for all generated code; none of the models earned unconditional implementer status.
5. Require a human fact/claims pass for marketing and security outputs.
6. Keep per-role evaluation sets and re-score after model/version, prompt, or routing changes.
