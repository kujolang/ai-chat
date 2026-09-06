# Real-model reliability validation

`scripts/reliability-live-run.js` runs actual configured managed providers against controlled local tasks. It creates a new SQLite database, isolated read-only workspace, HTTP fixtures, and contained browser artifacts. It never imports production chats or writes the production database. Provider routing credentials are read from the normal environment and local `.env`; they are not written to the report. Calls consume the selected provider's quota.

Create a JSON target file with at least two configured providers and explicit model families:

```json
[
  {"provider":"watchdog","model":"gpt-oss:20b","family":"openai-oss"},
  {"provider":"hermes","model":"stepfun/step-3.7-flash:free","family":"stepfun"}
]
```

Use models actually available to your accounts. A listed model is not an entitlement guarantee. The harness supports the managed Watchdog, Hermes, and xAI OAuth routes. It rejects mock-only and single-provider target matrices.

```bash
node scripts/reliability-live-run.js --mode eval --targets /absolute/path/to/targets.json --output /absolute/path/to/new-eval-directory
node scripts/reliability-live-run.js --mode soak --targets /absolute/path/to/targets.json --output /absolute/path/to/new-soak-directory --hours 8 --interval 90000
```

The output directory must be new. A soak must last at least eight hours; an evaluation or shortened run is never labelled all-day evidence. Each target runs local CSV analysis, static-page extraction, and dynamic browser evidence with eager and deferred tool schemas. Output correctness is checked against fresh fixture values and required executed tools. The report records selected tools, discovery precision against the task's relevant tools, provider rounds, latency, provider-reported usage, and cost when supplied. Missing cost remains `null`; token counts and fixture estimates are not billed dollars. Reports evaluate the task matrix, not general intelligence or universal model reliability.

`manifest.json` records the commit, dirty files, PID, targets, and settings. `requests.jsonl` records completed attempts without raw model prose. `metrics.jsonl` samples process-tree memory, event-loop delay, request/benchmark admission, and SSE output pressure. `status.json` is a progress convenience; inspect the live process or execution handle before deciding a run stopped. `summary.json` records terminal status, elapsed duration, task results, and acceptance facts. A `completed` process does not mean all tasks passed: inspect `acceptance` and per-model results. Missing/failed metric samples and observed resource growth require review before accepting a soak. The isolated database encryption key exists only in memory, so the harness cannot resume after a process crash; preserve the failed evidence and start a separately identified run.

SIGINT/SIGTERM cancel the active request and drain the runtime. A transport timeout sends explicit server cancellation. In the app, `GET /api/health` now exposes `streaming.output`: active connections, aggregate pending bytes, blocked writers, closed connections, overflow count, and the peak accepted buffer size for any connection. Its per-connection limit is 256 KiB. A lack of overflow in a live run is not proof of backpressure handling; retain the deterministic slow-consumer tests as separate evidence.
