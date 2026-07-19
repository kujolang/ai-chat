# End-to-End Codex Goal Prompt

Replace bracketed fields, then set this as a Codex goal. It is intentionally
under 8,000 characters.

```text
Run and fully assess one repeatable AI Chat benchmark, ending with a
team-shareable PDF brief and complete evidence package.

Run manifest:
- RUN_ID: [RUN_ID]
- TITLE_PREFIX: [TITLE_PREFIX]
- PANE_PROFILE: [exact saved pane-profile name]
- TEST_SUITE_NAME: [TEST_SUITE_NAME]
- TEST_FILE: [absolute path to benchmark Markdown]
- BASE_URL: [usually http://127.0.0.1:4174]
- OUTPUT_DIR: [absolute path for run JSON and review outputs]
- MAX_ATTEMPTS: [normally 3]
- CONCURRENCY: [normally 1]
- MAX_TOKENS: [omit unless intentionally overridden]

Repository: /Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat

Use these repository documents as the operational contract:
- docs/BENCHMARK_EXECUTION_KIT/01_MEGA_BENCHMARK_EXECUTION_PROMPT.md
- docs/BENCHMARK_EXECUTION_KIT/03_REVIEW_KIT_HANDOFF.md
- docs/BENCHMARK_REVIEW_KIT/01_FACTUAL_EVIDENCE_PROMPT.md through
  docs/BENCHMARK_REVIEW_KIT/06_TEAM_PDF_BRIEF_PROMPT.md

Outcome required:
1. Execute every test in TEST_FILE against every pane in PANE_PROFILE, with
   identical test text sent to every model.
2. Preserve the original benchmark run JSON, stored chats/export, preflight
   evidence, and exact-run Watchdog telemetry.
3. Produce six ordered assessment documents: factual evidence; quality/roles;
   token/cost efficiency; time/latency efficiency; dream-team synthesis; and a
   team brief in Markdown and PDF.
4. Leave a compact, auditable result folder ready to share with the team.

Execution rules:
- Confirm TEST_FILE has one or more `# TEST <number>: <title>` or `## TEST
  <number>: <title>` headings, each with a non-empty `## Prompt`; do not
  require ten tests.
- Confirm AI Chat is running at BASE_URL and PANE_PROFILE exists exactly by
  name with at least one pane. Record its model/profile IDs. Stop if the
  profile, key, or model configuration is invalid.
- Use the local API_AUTH_TOKEN without printing, saving, or exposing it.
- Run preflight checks for each unique model route where safe. Keep preflight
  results separate from benchmark responses.
- Use `npm run benchmark:run` with TEST_FILE, PANE_PROFILE, RUN_ID,
  TITLE_PREFIX, BASE_URL, OUTPUT_DIR, MAX_ATTEMPTS, and CONCURRENCY. Add
  max-tokens only if explicitly set.
- Keep concurrency at 1 unless the manifest says otherwise. Do not alter
  profile panes, models, prompts, keys, instructions, temperature, or token
  settings after the run starts.
- Permit bounded retries for transient/empty responses. Do not retry missing
  keys, auth failures, HTTP 404, invalid requests, or invalid models until the
  configuration is corrected and documented.
- If interrupted, resume only with the identical manifest. Do not manually
  replace model responses.

After execution:
- Verify expected responses = test count × pane count; record final/empty
  responses, attempts, retries, timestamps, duration, and failures.
- Build the review input set from the exact run: run JSON, chat export,
  Watchdog telemetry, preflight evidence, and test file.
- Run review prompts 01 through 06 in numeric order. Keep quality, token/cost,
  and time analyses separate until the dream-team synthesis.
- In cost analysis, compare only explicitly model-specific, comparable price
  evidence. Label generic fallback estimates unavailable for comparative cost.
- The PDF must summarize source reports without inventing claims, show the
  role roster and quality/token/time decision matrix, include limits, and be
  visually checked after rendering.

Completion criteria:
- Every profile pane received every test once or documented failures explain
  the gap.
- All result paths and the final PDF are reported.
- Recommendations are scoped to this run, include reliability caveats, and do
  not grant autonomous authority for sensitive, credential, tenant,
  destructive, backup, or external-publication actions.
- Do not commit benchmark runtime data, secrets, telemetry, raw chats, or PDF
  artifacts unless explicitly asked. Commit only reusable source/docs changes.
```
