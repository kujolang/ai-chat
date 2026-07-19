# 01 — Mega Benchmark Execution Prompt

Copy the following prompt into the agent that will execute a benchmark. Replace
all bracketed manifest values before sending it.

```text
Run a complete, repeatable AI Chat benchmark and prepare the evidence handoff
for the benchmark review kit.

Run manifest:
- RUN_ID: [RUN_ID]
- TITLE_PREFIX: [TITLE_PREFIX]
- PANE_PROFILE: [PANE_PROFILE]
- TEST_SUITE_NAME: [TEST_SUITE_NAME]
- TEST_FILE: [TEST_FILE]
- BASE_URL: [BASE_URL]
- OUTPUT_DIR: [OUTPUT_DIR]
- MAX_ATTEMPTS: [MAX_ATTEMPTS]
- CONCURRENCY: [CONCURRENCY]
- MAX_TOKENS: [MAX_TOKENS or omit]

Repository:
- AI Chat repository: /Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat

Goal:
Run every test in TEST_FILE through every pane/model in the exact saved pane
profile PANE_PROFILE. Each test must become one AI Chat with one request sent
to every pane, so every model receives the exact same test prompt. Preserve the
runtime artifacts and stored chats for later scoring; do not manually rewrite,
summarize, or replace model responses.

Execution requirements:
1. Inspect TEST_FILE. Confirm it has one or more `# TEST <number>: <title>` or
   `## TEST <number>: <title>` headings, each with a non-empty `## Prompt`
   section. Count the tests. Do not require exactly ten tests.
2. Confirm the AI Chat server is reachable at BASE_URL and authenticate using
   the locally available API_AUTH_TOKEN. Never print, save, or expose the
   token.
3. Read AI Chat state and confirm PANE_PROFILE exists exactly by name, has at
   least one pane, and record its model IDs/profile IDs. Stop before running if
   it is missing or empty.
4. Run a preflight request for every unique pane/profile/model route when safe
   to do so. Record the outcome without treating preflight text as benchmark
   results. Stop if a route is missing an API key, has an invalid model, or
   returns an authentication/configuration failure.
5. Start the benchmark from the AI Chat repository with this command shape:

   API_AUTH_TOKEN="$API_AUTH_TOKEN" npm run benchmark:run -- \
     --tests "[TEST_FILE]" \
     --pane-profile "[PANE_PROFILE]" \
     --run-id "[RUN_ID]" \
     --title-prefix "[TITLE_PREFIX]" \
     --base-url "[BASE_URL]" \
     --output-dir "[OUTPUT_DIR]" \
     --max-attempts [MAX_ATTEMPTS] \
     --concurrency [CONCURRENCY]

   Add `--max-tokens [MAX_TOKENS]` only when MAX_TOKENS is explicitly set.
   Keep concurrency at 1 unless the operator explicitly chose another value.

6. Do not change provider profiles, pane membership, models, global prompts,
   temperature, max-token settings, or benchmark prompts after the run starts.
   Do not manually resend individual prompts during the main run.
7. Allow the runner's bounded retry behavior to complete. If interrupted,
   resume using the identical RUN_ID, TITLE_PREFIX, PANE_PROFILE, and TEST_FILE.
   Use `--retry-failures` only for retryable failures, never for HTTP 404,
   missing-key, authentication, or invalid-request failures until configuration
   is corrected and the reason is recorded.
8. When finished, verify the artifact at
   [OUTPUT_DIR]/[RUN_ID].json includes started_at, finished_at, duration_ms,
   total/completed/failed counts, every test, every pane, attempts, duration,
   and usage where the provider supplied it.
9. Export or identify the stored benchmark chats and collect Watchdog telemetry
   for the exact run window. Keep those files beside the run artifact using the
   same RUN_ID where possible. Do not alter the original run artifact.
10. Produce a concise execution handoff containing:
    - run manifest and exact command, excluding secrets
    - start/end timestamps and elapsed time
    - test count × pane count = expected responses
    - completed/failed/empty responses and retries/attempts
    - exact paths to run JSON, chat export, telemetry, and preflight evidence
    - all unresolved failures categorized by configuration, model availability,
      upstream response, persistence, or unknown
    - whether the run is ready for the benchmark review kit

Success criteria:
- Every model in the selected pane profile received every benchmark test once.
- The run is resumable and traceable by RUN_ID.
- Chat titles are sortable by TITLE_PREFIX and test number.
- Benchmark evidence remains separate from any assessment or recommendation.
- The output is ready for the factual evidence prompt in
  docs/BENCHMARK_REVIEW_KIT/01_FACTUAL_EVIDENCE_PROMPT.md.
```
