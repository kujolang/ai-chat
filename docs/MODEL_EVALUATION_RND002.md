# RND002 Model Evaluation: TST001–TST009

## Scope and method

This report evaluates the three stored responses in each AI Chat comparison from `RND002TST001` through `RND002TST009`. Each response is scored from 1–5 for correctness, instruction following, completeness, clarity, practical usefulness, and reasoning/judgment, for a maximum of 30.

Evidence came from persisted chat content in `data/ai_chat.db`, provider-reported token usage, Watchdog latency telemetry, and direct execution of the delivered Python scripts/tests for TST002 and TST003. TST001 predates the retained Watchdog request records, so its response times are not recoverable. TST002 exists twice: the first comparison contains two provider-error placeholders, so this report uses the later complete rerun (`chat_id=pnprbrdb1avsq`) and records the first run as excluded evidence.

The tests use the same prompts as RND001. Scores assess the stored artifact, not the model's reputation or benchmark claims. Provider-reported token counts can include hidden reasoning or prior-pass context, especially for the DeepSeek models.

## Model metadata

| Model | Published size | Quantization | Hardware used |
|---|---:|---|---|
| `qwen3.5` | Not disclosed for the cloud alias; the [Ollama family listing](https://ollama.com/library/qwen3.5) includes sizes from 0.8B through 397B cloud | Not disclosed for the cloud deployment | Ollama Cloud; provider hardware not disclosed |
| `deepseek-v4-flash:cloud` | 284B total / 13B active in the [Ollama model description](https://ollama.com/library/deepseek-v4-flash%3Acloud) | Not disclosed for the cloud deployment | Ollama Cloud; provider hardware not disclosed |
| `deepseek-v4-pro:cloud` | Not disclosed on the [Ollama listing](https://ollama.com/library/deepseek-v4-pro/tags) | Not disclosed for the cloud deployment | Ollama Cloud; provider hardware not disclosed |

The AI Chat profile used for all three responses is named `Watchdog / Ollama Cloud`; local laptop hardware therefore did not perform model inference.

## Executive scorecard

| Test | Qwen 3.5 | DeepSeek V4 Flash | DeepSeek V4 Pro | Test winner |
|---|---:|---:|---:|---|
| TST001 — Python security review | 22 | 23 | 21 | DeepSeek V4 Flash |
| TST002 — SQLite task queue | 18 | 21 | 19 | DeepSeek V4 Flash |
| TST003 — Rate limiter | 26 | 23 | 22 | Qwen 3.5 |
| TST004 — Authentication review | 25 | 25 | 27 | DeepSeek V4 Pro |
| TST005 — Human decision system | 25 | 27 | 28 | DeepSeek V4 Pro |
| TST006 — Noisy issue investigation | 26 | 28 | 25 | DeepSeek V4 Flash |
| TST007 — Connector PRD | 24 | 26 | 26 | Tie: DeepSeek V4 Flash / Pro |
| TST008 — Kujo homepage copy | 22 | 18 | 18 | Qwen 3.5 |
| TST009 — Model routing recommendation | 27 | 25 | 28 | DeepSeek V4 Pro |
| **Total / 270** | **215** | **216** | **214** | **DeepSeek V4 Flash** |
| **Average / 30** | **23.9** | **24.0** | **23.8** | **DeepSeek V4 Flash** |

The aggregate is effectively a three-way tie. Flash is fastest and strongest on investigation/planning work; Pro is best on architecture and executive routing; Qwen is strongest on the rate-limiter implementation and is usually the most token-efficient. All three delivered serious executable-code failures, and all three invented unsupported Kujo product capabilities in TST008.

### Efficiency summary

| Model | Mean latency, TST002–TST009 | Provider-reported output tokens, all tests | Quality points per 1,000 output tokens |
|---|---:|---:|---:|
| Qwen 3.5 | 42.9 seconds | 31,332 | 6.86 |
| DeepSeek V4 Flash | 26.6 seconds | 43,697 | 4.94 |
| DeepSeek V4 Pro | 43.0 seconds | 43,862 | 4.88 |

Latency excludes TST001 because no retained Watchdog timing exists. DeepSeek V4 Pro's TST002 time sums two continuation passes.

---

## TST001 — Python code review and security fixes

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST001 — Python security review
- **Total response time:** Not captured
- **Approximate input tokens:** 915
- **Approximate output tokens:** 2,348
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 2
- **Reasoning and judgment:** 3
- **Total quality score:** **22/30**
- **Best part of the response:** Correctly identifies every requested risk category and uses Flask request-lifecycle cleanup rather than leaving SQLite connections open.
- **Most important weakness:** The replacement's authentication check accepts any caller-supplied string of 32 or more characters, creating the appearance of authentication without actual verification.
- **Major factual or technical errors:** Suffix-based callback matching accepts hosts such as `evil-example.com` for an `example.com` allowlist entry; DNS resolution and redirects remain unchecked; the supplied tests omit authorization headers and therefore do not exercise the intended paths.
- **Usable without major revision:** No
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Unsupervised security implementer
- **Additional notes:** Strong issue inventory, but the 95/100 self-rating is not calibrated to the implementation defects.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST001 — Python security review
- **Total response time:** Not captured
- **Approximate input tokens:** 776
- **Approximate output tokens:** 2,082
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 3
- **Total quality score:** **23/30**
- **Best part of the response:** Produces compact working-shaped code with parameterized SQL, token removal, timeout handling, and proper Flask-managed database cleanup.
- **Most important weakness:** It identifies missing authentication but deliberately leaves it unfixed while claiming all critical/high issues were eliminated.
- **Major factual or technical errors:** The default callback allowlist becomes `[""]`, unintentionally disabling every callback; invalid callback URLs are silently ignored; `init_db()` changes application behavior and schema ownership beyond the requested repair.
- **Usable without major revision:** No
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Final security implementation owner
- **Additional notes:** Safest of the three replacements by a small margin, but still incomplete as an access-control repair.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST001 — Python security review
- **Total response time:** Not captured
- **Approximate input tokens:** 776
- **Approximate output tokens:** 2,770
- **Correctness:** 2
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 2
- **Reasoning and judgment:** 3
- **Total quality score:** **21/30**
- **Best part of the response:** Removes `api_token` from the query and response and clearly prioritizes SQL injection, SSRF, debug mode, and resource handling.
- **Most important weakness:** The delivered callback path raises `NameError` because `requests` is never imported.
- **Major factual or technical errors:** A `sqlite3.Connection` context manager commits or rolls back but does not close the connection; an empty whitelist permits arbitrary HTTPS destinations; the explanation falsely says the context manager always closes the connection.
- **Usable without major revision:** No
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Unsupervised security implementer
- **Additional notes:** Clear prose obscures a runtime error and two security/reliability gaps.

---

## TST002 — Lightweight SQLite task queue

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST002 — SQLite task queue
- **Total response time:** 39.528 seconds
- **Approximate input tokens:** 532
- **Approximate output tokens:** 6,013
- **Correctness:** 1
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 1
- **Reasoning and judgment:** 2
- **Total quality score:** **18/30**
- **Best part of the response:** Defines guarded state transitions, attempt accounting, a broad test suite, and an explicit single-machine boundary.
- **Most important weakness:** The default `:memory:` queue opens a fresh SQLite connection for every operation, so the schema disappears immediately after initialization.
- **Major factual or technical errors:** Direct execution fails on the first task insertion with `sqlite3.OperationalError: no such table: tasks`; the demo and test fixture both use the broken default.
- **Usable without major revision:** No
- **Likely best role:** Planner
- **Likely unsuitable roles:** Implementer for persistent or concurrent code
- **Additional notes:** The design narrative is much stronger than the executable artifact.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST002 — SQLite task queue
- **Total response time:** 41.285 seconds
- **Approximate input tokens:** 472
- **Approximate output tokens:** 10,249
- **Correctness:** 2
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 2
- **Reasoning and judgment:** 3
- **Total quality score:** **21/30**
- **Best part of the response:** Provides explicit lifecycle rules, file-backed SQLite guidance, guarded updates, contention tests, and useful multi-machine limitations.
- **Most important weakness:** Its own concurrent-claim tests receive zero successful claims because each thread gets a separate empty in-memory database.
- **Major factual or technical errors:** Direct execution: 18 tests passed and 2 failed; both concurrency tests expected claims but got none. The tests therefore do not validate the stated no-double-claim guarantee.
- **Usable without major revision:** No
- **Likely best role:** Planner
- **Likely unsuitable roles:** Production concurrency implementer
- **Additional notes:** Best TST002 response in this round, but only as a design starting point.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST002 — SQLite task queue
- **Total response time:** 124.111 seconds
- **Approximate input tokens:** 2,541
- **Approximate output tokens:** 15,391
- **Correctness:** 1
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 1
- **Reasoning and judgment:** 2
- **Total quality score:** **19/30**
- **Best part of the response:** Explains the atomic-update strategy, claim identifiers, retry policy, and the limits of SQLite across machines very clearly.
- **Most important weakness:** Like Qwen, it uses one fresh connection per operation with `:memory:`, making the default implementation entirely unusable.
- **Major factual or technical errors:** Direct execution: all 13 tests errored with `no such table: tasks`; the claimed atomicity test never reaches a claim operation.
- **Usable without major revision:** No
- **Likely best role:** Planner
- **Likely unsuitable roles:** Implementer for executable queue code
- **Additional notes:** Highest latency and token use in the test, with no compensating execution reliability.

---

## TST003 — Enhanced rate limiter

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST003 — Rate limiter
- **Total response time:** 91.370 seconds
- **Approximate input tokens:** 593
- **Approximate output tokens:** 6,381
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Implements per-action limits, remaining/retry metadata, controllable time, stale-user cleanup, backward-compatible truthiness, and broad edge-case tests.
- **Most important weakness:** The delivered suite exposes a status-reporting defect, and the class is explicitly not thread-safe.
- **Major factual or technical errors:** Direct execution: 23 tests passed and 1 failed because `get_status()` reported an exhausted limit as allowed; the concurrency-named test is sequential and does not test a race.
- **Usable without major revision:** Yes, after the status calculation is fixed and deployment concurrency is defined
- **Likely best role:** Implementer
- **Likely unsuitable roles:** Unreviewed multithreaded component owner
- **Additional notes:** Strongest executable response in RND002.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST003 — Rate limiter
- **Total response time:** 48.276 seconds
- **Approximate input tokens:** 17,444
- **Approximate output tokens:** 9,072
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 3
- **Total quality score:** **23/30**
- **Best part of the response:** Uses a lock correctly, supports action-specific limits and a fake clock, and explains performance tradeoffs with unusual clarity.
- **Most important weakness:** A configured zero limit crashes instead of denying requests.
- **Major factual or technical errors:** With `limit=0`, the rejection branch indexes `timestamps[0]` on an empty list; negative limits are accepted; users who never record a successful request can escape the stale-user cleanup index.
- **Usable without major revision:** No for edge-case-safe use; otherwise a useful starting point
- **Likely best role:** Implementer with test review
- **Likely unsuitable roles:** Final edge-case reviewer
- **Additional notes:** The response's tests claim zero-limit coverage, but the implementation cannot pass that case.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST003 — Rate limiter
- **Total response time:** 80.161 seconds
- **Approximate input tokens:** 12,536
- **Approximate output tokens:** 9,016
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 3
- **Total quality score:** **22/30**
- **Best part of the response:** Uses `time.monotonic`, validates constructor limits, separates action counters, and supplies deterministic tests.
- **Most important weakness:** Allowed results report remaining capacity before consuming the current request.
- **Major factual or technical errors:** Direct execution: 14 tests passed and 4 failed because `remaining` is systematically one too high; the class is not thread-safe despite typical web-server use.
- **Usable without major revision:** No
- **Likely best role:** Task Runner for prototypes
- **Likely unsuitable roles:** Stateful concurrent-component implementer
- **Additional notes:** The implementation explains its thread-safety limitation honestly, but misses a central output contract.

---

## TST004 — Authentication flow security review

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST004 — Authentication review
- **Total response time:** 28.808 seconds
- **Approximate input tokens:** 609
- **Approximate output tokens:** 2,458
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Correctly prioritizes password hashing, random session tokens, cookie flags, expiration, generic errors, response projection, and rate limiting.
- **Most important weakness:** The rate-limit key uses email instead of IP whenever an email is supplied, allowing an attacker to rotate addresses and bypass the intended IP control.
- **Major factual or technical errors:** The replacement lacks surrounding error handling and uses a costly `bcrypt.hash()` rather than a fixed dummy hash for unknown users; its database API assumptions are not declared.
- **Usable without major revision:** Yes as a reference patch, not drop-in code
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Drop-in authentication implementer
- **Additional notes:** Clear and appropriately prioritized.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST004 — Authentication review
- **Total response time:** 17.893 seconds
- **Approximate input tokens:** 531
- **Approximate output tokens:** 3,450
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Adds hashed session-token storage, lockout handling, secure cookies, field projection, expiration, and a concrete fix order.
- **Most important weakness:** It returns the raw session token in the JSON body while also claiming the `httpOnly` cookie protects it from script access.
- **Major factual or technical errors:** Unknown-user requests skip the bcrypt comparison and retain a timing-enumeration channel; the token-forgery scenario overstates how easily an attacker can create a token that already exists in the session store.
- **Usable without major revision:** Yes after removing the response-body token and adding a dummy password check
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Final authentication implementer
- **Additional notes:** Very fast and thorough, but not internally consistent about token exposure.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST004 — Authentication review
- **Total response time:** 22.818 seconds
- **Approximate input tokens:** 531
- **Approximate output tokens:** 3,209
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **27/30**
- **Best part of the response:** Recognizes raw session-token storage and duplicate body/cookie exposure, then supplies matching token-hash verification middleware.
- **Most important weakness:** The replacement assumes valid input and successful database operations; it does not show request validation or operational error handling.
- **Major factual or technical errors:** No major central error; the unused `constantTimeEqual()` helper adds noise, and role exposure should be justified rather than assumed safe.
- **Usable without major revision:** Yes, after integration-specific validation and error handling
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Best authentication review in RND002.

---

## TST005 — Human-in-the-loop decision system

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST005 — Human decision system architecture
- **Total response time:** 83.971 seconds
- **Approximate input tokens:** 507
- **Approximate output tokens:** 5,484
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Covers the full lifecycle, auditability, idempotency, provider separation, recovery, authorization, data contracts, and phased delivery.
- **Most important weakness:** Starts with PostgreSQL, Redis, an event store, a gateway, and several services despite the request's preference for a practical composable system.
- **Major factual or technical errors:** Recommends monotonic clocks for persisted/distributed TTLs, which cannot be compared across processes or restarts; its state diagram separates `DECIDED` from outcomes while the transition table bypasses that state.
- **Usable without major revision:** Yes as a broad architecture reference, after substantial scope reduction
- **Likely best role:** Planner
- **Likely unsuitable roles:** MVP scope controller
- **Additional notes:** Comprehensive but overbuilt.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST005 — Human decision system architecture
- **Total response time:** 25.423 seconds
- **Approximate input tokens:** 448
- **Approximate output tokens:** 5,801
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **27/30**
- **Best part of the response:** Cleanly separates the core from provider adapters and gives concrete schemas, races, recovery behavior, security boundaries, and an intentionally small MVP.
- **Most important weakness:** The human-response contract includes both an `actor_id` and `auth_token` in the body, an unsafe pattern unless the server ignores identity claims and authenticates exclusively from trusted transport context.
- **Major factual or technical errors:** `Any state → FAILED` would allow terminal decisions to be overwritten; monotonic-clock advice is invalid for cross-service persisted expiration; queuing requests while the database is unavailable conflicts with the database-as-source-of-truth design.
- **Usable without major revision:** Yes, with state/auth contract corrections
- **Likely best role:** Planner
- **Likely unsuitable roles:** Minimal task runner
- **Additional notes:** Best balance of depth and delivery speed in the test.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST005 — Human decision system architecture
- **Total response time:** 32.999 seconds
- **Approximate input tokens:** 448
- **Approximate output tokens:** 4,571
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **28/30**
- **Best part of the response:** Defines the smallest credible MVP—one service, SQLite, polling, CLI, and three endpoints—while keeping provider adapters outside the core.
- **Most important weakness:** An in-process event bus cannot directly serve provider adapters running as separate processes and is not durable across crashes.
- **Major factual or technical errors:** Provider catch-up polling partly mitigates the event-bus limitation, but the contract needs an outbox or a same-process deployment constraint; `GET ... full decision record` risks exposing context without a field-level policy.
- **Usable without major revision:** Yes
- **Likely best role:** Orchestrator
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Most practical architecture response in RND002.

---

## TST006 — Noisy issue investigation

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST006 — One-week noisy-issue investigation
- **Total response time:** 46.236 seconds
- **Approximate input tokens:** 539
- **Approximate output tokens:** 4,022
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Explicitly separates facts, assumptions, and recommendations and provides measurable hypotheses, stop conditions, preservation guardrails, and a daily decision path.
- **Most important weakness:** It moves from diagnosis to a live 10% A/B deployment within five days before establishing that the modified component is safe.
- **Major factual or technical errors:** A generic `p<0.05` requirement is not meaningful without power/effect-size planning, and the fixed 200-item sample is not stratified to protect rare critical findings.
- **Usable without major revision:** Yes, after replacing the live test with shadow/replay validation first
- **Likely best role:** Planner
- **Likely unsuitable roles:** Autonomous production experiment owner
- **Additional notes:** Strong operating plan, slightly too aggressive in execution.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST006 — One-week noisy-issue investigation
- **Total response time:** 25.440 seconds
- **Approximate input tokens:** 13,784
- **Approximate output tokens:** 4,523
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 5
- **Total quality score:** **28/30**
- **Best part of the response:** Treats label quality, source attribution, bypass comparison, duplicates, missed positives, and security/correctness recall as separate evidence problems rather than assuming the review component is guilty.
- **Most important weakness:** The plan is still dense for a one-week engagement and needs explicit owners/capacity to prove all proposed experiments are feasible.
- **Major factual or technical errors:** No major central error; some percentage thresholds are judgment calls and should be ratified against business cost.
- **Usable without major revision:** Yes
- **Likely best role:** Planner
- **Likely unsuitable roles:** Minimal task runner
- **Additional notes:** Best investigation response in RND002.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST006 — One-week noisy-issue investigation
- **Total response time:** 37.945 seconds
- **Approximate input tokens:** 475
- **Approximate output tokens:** 3,587
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Builds a disciplined source-tracing, rule-impact, label-calibration, cost, and decision-gate framework with strong guardrail metrics.
- **Most important weakness:** Day 1 calls for classifying all 8,800 issues, an implausible workload that conflicts with completing the rest of the week.
- **Major factual or technical errors:** Sending 20% of raw generator output directly to triage is a risky live bypass before shadow evidence is complete; the plan alternates among 5%, 8%, 10%, and 15% thresholds without fully reconciling them.
- **Usable without major revision:** Yes after narrowing the sample and keeping bypass work in shadow mode
- **Likely best role:** Reviewer
- **Likely unsuitable roles:** One-week scope controller
- **Additional notes:** Strong analysis, weak workload realism.

---

## TST007 — Connector recovery/modularization PRD

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST007 — Connector recovery/modularization PRD
- **Total response time:** 20.912 seconds
- **Approximate input tokens:** 513
- **Approximate output tokens:** 1,738
- **Correctness:** 3
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **24/30**
- **Best part of the response:** Concise, clearly separates recovery from modularization, and includes operator, security, observability, rollout, rollback, and acceptance surfaces.
- **Most important weakness:** The recovery inventory classifies database records without requiring reconciliation against the actual WordPress resources they represent.
- **Major factual or technical errors:** Before/after database snapshots cannot by themselves roll back external provisioning side effects; a fixed limit of 10 records/hour is arbitrary; the stated idempotency goal “safe to retry indefinitely” is too absolute for external APIs.
- **Usable without major revision:** Yes after adding external-state reconciliation and a real compensation plan
- **Likely best role:** Product Thinker
- **Likely unsuitable roles:** Recovery implementation owner
- **Additional notes:** Most concise PRD, but concision removes important recovery mechanics.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST007 — Connector recovery/modularization PRD
- **Total response time:** 26.852 seconds
- **Approximate input tokens:** 12,241
- **Approximate output tokens:** 4,357
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Requires read-only discovery against both persisted and real target state, serial recovery, dry runs, explicit gates, log-scrubber tests, and strong phase separation.
- **Most important weakness:** The long-term plan drifts toward a generic workflow/plugin platform despite explicitly naming a generic workflow engine as a non-goal.
- **Major factual or technical errors:** External provisioning steps generally cannot be made atomically; restoring only the record database during rollback can recreate inconsistency with WordPress/DNS/database resources; runtime-loadable plugins and parallel steps are premature.
- **Usable without major revision:** Yes after narrowing modularization and replacing rollback with reconciled compensation
- **Likely best role:** Product Thinker
- **Likely unsuitable roles:** Minimal-scope task runner
- **Additional notes:** Strongest recovery discovery requirements of the three.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST007 — Connector recovery/modularization PRD
- **Total response time:** 16.941 seconds
- **Approximate input tokens:** 458
- **Approximate output tokens:** 2,246
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 4
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **26/30**
- **Best part of the response:** Maintains clean phase boundaries, defines a usable operator CLI, and keeps the modular public API small and product-neutral.
- **Most important weakness:** Its acceptance criteria prove recovery on one staged record but never explicitly require all ~80 stranded records to reach reconciled terminal outcomes.
- **Major factual or technical errors:** `--force` is underspecified for a damaged system; reverting code or a record database does not reverse external side effects; “normal provisioning path is unchanged” is inconsistent with refactoring that path for idempotency.
- **Usable without major revision:** Yes after strengthening recovery completion and compensation criteria
- **Likely best role:** Product Thinker
- **Likely unsuitable roles:** Final recovery safety reviewer
- **Additional notes:** Best concise product document, tied with Flash overall.

---

## TST008 — Kujo homepage copy

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST008 — Homepage copy
- **Total response time:** 11.499 seconds
- **Approximate input tokens:** 506
- **Approximate output tokens:** 822
- **Correctness:** 2
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 3
- **Reasoning and judgment:** 2
- **Total quality score:** **22/30**
- **Best part of the response:** Clean hierarchy, restrained tone, strong tagline use, and an efficient proof/trust section.
- **Most important weakness:** Treats positioning language as permission to invent a technical product specification.
- **Major factual or technical errors:** Claims an expressive type system with contracts/invariants, embedded verification hints, a permission model, change provenance, contract enforcement, and audit trails without source evidence.
- **Usable without major revision:** No; requires a factual claims pass
- **Likely best role:** Marketing and Communication Model after grounding
- **Likely unsuitable roles:** Final product claims owner
- **Additional notes:** Least risky of the three, but still materially ungrounded.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST008 — Homepage copy
- **Total response time:** 8.332 seconds
- **Approximate input tokens:** 4,676
- **Approximate output tokens:** 1,079
- **Correctness:** 1
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 1
- **Reasoning and judgment:** 1
- **Total quality score:** **18/30**
- **Best part of the response:** Memorable hero copy and an excellent page-level rhythm.
- **Most important weakness:** Fabricates product status, customer evidence, and numerous technical guarantees.
- **Major factual or technical errors:** Invents first-class context blocks, language-enforced capabilities, property-based verification, signed replayable evidence bundles, per-line model/prompt attribution, a stable production core, closed-beta users, and a 70% customer result/testimonial.
- **Usable without major revision:** No
- **Likely best role:** Marketing and Communication Model under strict fact control
- **Likely unsuitable roles:** Unsupervised product marketing
- **Additional notes:** The fake testimonial is the most serious marketing-integrity failure in either round.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST008 — Homepage copy
- **Total response time:** 8.576 seconds
- **Approximate input tokens:** 453
- **Approximate output tokens:** 679
- **Correctness:** 1
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 1
- **Reasoning and judgment:** 1
- **Total quality score:** **18/30**
- **Best part of the response:** Exceptionally concise, forceful copy with a coherent clarity/context/control structure.
- **Most important weakness:** Makes absolute formal-verification promises unsupported by the prompt.
- **Major factual or technical errors:** Claims machine-checked module specifications/invariants, pre/postconditions, proof-producing static verification for every input/path, no runtime surprises, and proof logs; “When the proof passes, you ship” dangerously collapses production readiness into an invented checker.
- **Usable without major revision:** No
- **Likely best role:** Marketing and Communication Model after strict grounding
- **Likely unsuitable roles:** Technical product claims owner
- **Additional notes:** Polished copy, unacceptable claim discipline.

---

## TST009 — Executive model-routing recommendation

### Qwen 3.5

- **Model:** `qwen3.5`
- **Model size:** Not disclosed for cloud alias
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST009 — Model routing recommendation
- **Total response time:** 20.654 seconds
- **Approximate input tokens:** 538
- **Approximate output tokens:** 2,066
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **27/30**
- **Best part of the response:** Gives role-specific evaluation, risk-based routing, human gates, fallback logic, a capability registry, and a concrete 30-day evidence loop without naming a model.
- **Most important weakness:** Several numeric targets are asserted before a baseline exists, and the extra `Explorer` role slightly dilutes the four roles the team is actively deciding among.
- **Major factual or technical errors:** No major central error; “unit test generation” and “log anomaly detection” should not be treated as low-risk solely because the task format is repetitive.
- **Usable without major revision:** Yes
- **Likely best role:** Planner
- **Likely unsuitable roles:** Final governance authority
- **Additional notes:** Strong executive recommendation.

### DeepSeek V4 Flash

- **Model:** `deepseek-v4-flash:cloud`
- **Model size:** 284B total / 13B active
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST009 — Model routing recommendation
- **Total response time:** 19.657 seconds
- **Approximate input tokens:** 483
- **Approximate output tokens:** 3,084
- **Correctness:** 4
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 4
- **Practical usefulness:** 3
- **Reasoning and judgment:** 4
- **Total quality score:** **25/30**
- **Best part of the response:** Broad evaluation criteria cover quality, operations, safety, reproducibility, Pareto efficiency, drift, and shadow-mode validation.
- **Most important weakness:** The router relies on model self-confidence and permits reviewer-model auto-approval for reasoning work, neither of which is a reliable safety boundary.
- **Major factual or technical errors:** “A small model that fails 5% of the time is acceptable” is unsafe without consequence-specific failure analysis; input sanitization is not a sufficient prompt-injection mitigation; compliance checks should not be delegated merely because a model is larger.
- **Usable without major revision:** Yes after replacing confidence with external checks and tightening gates
- **Likely best role:** Planner
- **Likely unsuitable roles:** Final AI governance authority
- **Additional notes:** Comprehensive but more automation-friendly than its own risk analysis supports.

### DeepSeek V4 Pro

- **Model:** `deepseek-v4-pro:cloud`
- **Model size:** Not disclosed
- **Quantization:** Not disclosed
- **Hardware:** Ollama Cloud; not disclosed
- **Test:** TST009 — Model routing recommendation
- **Total response time:** 20.603 seconds
- **Approximate input tokens:** 483
- **Approximate output tokens:** 2,393
- **Correctness:** 5
- **Instruction following:** 5
- **Completeness:** 5
- **Clarity:** 5
- **Practical usefulness:** 4
- **Reasoning and judgment:** 4
- **Total quality score:** **28/30**
- **Best part of the response:** Defines a consequence-aware routing table, explicit human-only decisions, role benchmarks, shadow mode, data-boundary decisions, prompt governance, and measurable pilot exit criteria.
- **Most important weakness:** The complex-task route (`Planner → Human → Orchestrator`) is not well justified, and low-confidence escalation is underspecified because model confidence is poorly calibrated.
- **Major factual or technical errors:** No major central error; “refusal rate” is an incomplete safety metric and fixed latency/quality thresholds should be baselined before ratification.
- **Usable without major revision:** Yes
- **Likely best role:** Orchestrator
- **Likely unsuitable roles:** Fast task runner
- **Additional notes:** Best executive recommendation in RND002.

---

## Final role classification

### Qwen 3.5

- **Likely best roles:** Planner; Reviewer; bounded Implementer with execution checks
- **Likely unsuitable roles:** Unsupervised security implementer; final product claims owner
- **Why:** It is structured, instruction-complete, and comparatively token-efficient. It produced the best rate limiter and strong plans, but its default task queue was nonfunctional and its security/marketing answers contained overconfident gaps.

### DeepSeek V4 Flash

- **Likely best roles:** Planner; Product Thinker; fast first-pass Reviewer
- **Likely unsuitable roles:** Unsupervised concurrent-code implementer; final product claims owner
- **Why:** It has the lowest measured latency and the best investigation plan. It tends to be comprehensive and operationally aware, but executable edge cases and claim discipline need independent verification.

### DeepSeek V4 Pro

- **Likely best roles:** Orchestrator; Reviewer; Product Thinker
- **Likely unsuitable roles:** Task Runner; unsupervised executable-code implementer
- **Why:** It produced the strongest authentication review, system architecture, and routing recommendation. Its code artifacts were the least reliable category, and it used the most time/tokens without an aggregate quality advantage.

## Cross-round comparison: all six models

| Rank | Model | Round | Total / 270 | Average / 30 | Best observed fit |
|---:|---|---|---:|---:|---|
| 1 | Kimi K2.7 Code | RND001 | 232 | 25.8 | Implementer / concise planner |
| 2 | GLM-5.2 | RND001 | 228 | 25.3 | Reviewer / implementer |
| 3 | DeepSeek V4 Flash | RND002 | 216 | 24.0 | Planner / product thinker |
| 4 | Qwen 3.5 | RND002 | 215 | 23.9 | Planner / bounded implementer |
| 5 (tie) | MiniMax M3 | RND001 | 214 | 23.8 | Orchestrator / planner |
| 5 (tie) | DeepSeek V4 Pro | RND002 | 214 | 23.8 | Orchestrator / reviewer |

The six-model ranking should be treated as directional, not statistically conclusive: there is one stored response per model/test, output modes differ, TST002 required a rerun in RND002, and latency/token accounting differs by provider reasoning mode. The decisive evidence is role-specific: Kimi led the first-round aggregate, Flash led investigation speed/quality, Pro led architecture/review work, and no model was reliable enough to accept executable or public factual output without verification.

## Recommended routing policy from these runs

1. Route bounded implementation to **Kimi K2.7 Code** first, with execution tests required before acceptance.
2. Route security/code review to **GLM-5.2** or **DeepSeek V4 Pro**, then validate concrete fixes independently.
3. Route investigation plans and product requirements to **DeepSeek V4 Flash**; use **Qwen 3.5** when token efficiency matters.
4. Route cross-functional architecture/orchestration to **DeepSeek V4 Pro** or **MiniMax M3**, with an explicit scope/verbosity budget.
5. Require a factual claims check for every marketing response and execution tests for every code response, regardless of model.

