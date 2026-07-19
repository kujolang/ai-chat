# Repeatable Benchmark Execution Kit

This kit runs the same test suite through every pane/model in a saved AI Chat
pane profile, then leaves a clean evidence handoff for
[`BENCHMARK_REVIEW_KIT`](../BENCHMARK_REVIEW_KIT/00_README.md).

Change only the run manifest values each time. The same process works for
`Ollama (TUD)`, `OpenRouter (TUD)`, or a future pane profile.

## Run manifest

```text
RUN_ID: [unique slug, e.g. rnd008tst-ollama-tud-engineering-2026-07-20]
TITLE_PREFIX: [sortable chat prefix, e.g. RND008TST]
PANE_PROFILE: [exact saved AI Chat pane-profile name]
TEST_SUITE_NAME: [human-readable test-suite label]
TEST_FILE: [absolute Markdown path]
BASE_URL: [usually http://127.0.0.1:4174]
OUTPUT_DIR: [usually /absolute/path/to/ai-chat/data/benchmark-runs]
MAX_ATTEMPTS: [normally 3]
CONCURRENCY: [normally 1]
MAX_TOKENS: [optional; omit to use the app setting]
```

## Required preconditions

- AI Chat is running and reachable at `BASE_URL`.
- The exact pane profile exists and contains the models to benchmark.
- Every pane profile/provider has a working key and selected model.
- The test file has one `# TEST <number>: <title>` heading per test, followed
  by `## Prompt`. Any positive number of tests is supported.
- The operator has `API_AUTH_TOKEN` available in their shell. Never place it
  in a prompt, Markdown file, committed manifest, or benchmark artifact.

## Files

1. [Mega execution prompt](01_MEGA_BENCHMARK_EXECUTION_PROMPT.md)
2. [Interchangeable test-suite template](02_TEST_SUITE_TEMPLATE.md)
3. [Post-run handoff checklist](03_REVIEW_KIT_HANDOFF.md)
4. [Step-by-step operator guide](04_OPERATOR_HOW_TO.md)
5. [End-to-end Codex goal prompt](05_END_TO_END_CODEX_GOAL_PROMPT.md)

The runner stores its resumable run artifact at
`[OUTPUT_DIR]/[RUN_ID].json`. It creates one chat per test titled
`[TITLE_PREFIX]001 — [test title]`, and sends the same test prompt to each
pane in that chat.
