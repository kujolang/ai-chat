# Benchmark-to-PDF Operator Guide

This is the normal workflow when the AI Chat provider profiles and pane profile
already exist. You do not need to create a provider profile for each run.

## 1. Pick or create the test-suite file

Copy [the test-suite template](02_TEST_SUITE_TEMPLATE.md) to a new Markdown
file outside `data/`, then write your tests. It can have 10, 12, or any other
positive number of tests.

Use this required shape for each test:

```markdown
# TEST 1: Short title

## Prompt

The exact prompt every model should receive.
```

Do not edit that file after the run begins. If you update prompts, save a new
version and use a new run ID.

## 2. Choose your existing pane profile

Open AI Chat → Settings → Pane Profiles. Copy the profile name exactly,
including spaces and parentheses. This is the only profile value you change in
the execution manifest:

```text
PANE_PROFILE: OpenRouter (TUD)
```

or:

```text
PANE_PROFILE: Ollama (TUD)
```

The pane profile—not the provider profile name—determines every model that
will receive every test. The benchmark runner sends one test to all panes in
that saved profile.

## 3. Fill out the run manifest

Choose a unique run ID and a sortable title prefix. Example:

```text
RUN_ID: rnd009tst-ollama-tud-agent-workflows-2026-07-20
TITLE_PREFIX: RND009TST
PANE_PROFILE: Ollama (TUD)
TEST_SUITE_NAME: Agent Workflow 12
TEST_FILE: /Users/you/Downloads/Agent Workflow Tests v1.md
BASE_URL: http://127.0.0.1:4174
OUTPUT_DIR: /Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat/data/benchmark-runs
MAX_ATTEMPTS: 3
CONCURRENCY: 1
MAX_TOKENS: [omit unless intentionally overriding the app setting]
```

Use a different run ID when you change the pane profile, model list, test file,
global/model instructions, or runner settings. For an A/B instruction
experiment, use the same test file but a distinct run ID and profile/config
label.

## 4. Start AI Chat

In a terminal, start the app normally. Keep it running while the benchmark is
in progress:

```bash
cd /Users/robertdevore/2026/Kujolang/kujo-repos/ai-chat
npm run dev
```

Confirm the local address shown by the server matches `BASE_URL`. Do not put an
API key or API token in a prompt or Markdown file.

## 5. Start the benchmark

Give an agent the completed run manifest and
[the mega execution prompt](01_MEGA_BENCHMARK_EXECUTION_PROMPT.md), or use
[the end-to-end goal prompt](05_END_TO_END_CODEX_GOAL_PROMPT.md).

The agent will verify the saved pane profile, run the suite, create one chat
per test, and store the resumable result at:

```text
[OUTPUT_DIR]/[RUN_ID].json
```

Chat titles use your prefix: `RND009TST001 — [test title]`.

## 6. Let the run finish; do not alter its configuration

The default is one model request at a time, with up to three attempts for
transient/empty responses. This makes a large run slower but produces cleaner
shared-key evidence. Do not change profile panes, keys, model choices, test
prompts, global instructions, or token settings during the run.

If the run stops, resume it using the *identical* run ID, title prefix, pane
profile, test file, and runner options. Do not treat a missing key, HTTP 404,
authentication error, or invalid model as a retryable benchmark failure.

## 7. Check the handoff before review

Use [the handoff checklist](03_REVIEW_KIT_HANDOFF.md). You need the run JSON,
stored-chat export, exact-run Watchdog telemetry, and preflight evidence. The
run is ready when its expected responses equal `test count × pane count`, and
any failures are recorded rather than hidden.

## 8. Start the review kit

Give the completed handoff and artifacts to the review agent. Run the prompts
in this exact order:

1. `BENCHMARK_REVIEW_KIT/01_FACTUAL_EVIDENCE_PROMPT.md`
2. `BENCHMARK_REVIEW_KIT/02_QUALITY_AND_ROLE_ASSESSMENT_PROMPT.md`
3. `BENCHMARK_REVIEW_KIT/03_TOKEN_AND_COST_EFFICIENCY_PROMPT.md`
4. `BENCHMARK_REVIEW_KIT/04_TIME_AND_LATENCY_EFFICIENCY_PROMPT.md`
5. `BENCHMARK_REVIEW_KIT/05_DREAM_TEAM_SYNTHESIS_PROMPT.md`
6. `BENCHMARK_REVIEW_KIT/06_TEAM_PDF_BRIEF_PROMPT.md`

The final step creates the team-facing Markdown brief and PDF. Keep the
numbered source reports and raw evidence alongside it for audit depth.

## 9. Historical runs, such as RND005 and RND006

Do not rerun the chats merely to standardize reporting. Create separate review
output folders and feed each historical run's original artifact set into the
same review-kit steps:

```text
RND005 OpenRouter TUD -> review kit 01–06 -> OpenRouter PDF
RND006 Ollama TUD     -> review kit 01–06 -> Ollama PDF
```

Only compare their conclusions after checking that both runs used comparable
test versions, scoring rules, and measurement fields. Keep unavailable or
fallback pricing out of cross-profile dollar rankings.

## Result folder to share

```text
[RUN_ID]/
  original run JSON
  stored-chat export
  Watchdog telemetry
  preflight evidence
  01 factual evidence
  02 quality and role assessment
  03 token and cost efficiency
  04 time and latency efficiency
  05 dream-team synthesis
  06 team brief.md
  06 team brief.pdf
```
