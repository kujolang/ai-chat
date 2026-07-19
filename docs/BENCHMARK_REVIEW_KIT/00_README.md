# Repeatable Benchmark Review Kit

Use these prompts in numeric order after any AI Chat / Watchdog benchmark run.
They work for OpenRouter, Ollama, or another provider profile, and for any
benchmark suite size or test grouping.

The kit deliberately separates measurement from recommendations:

1. `01` creates the factual evidence package.
2. `02` ranks answer quality and assigns job lanes.
3. `03` ranks token and comparable-cost efficiency.
4. `04` ranks time efficiency and latency reliability.
5. `05` combines those three assessments into a role-based "dream team."
6. `06` creates a stable Markdown and PDF briefing for the team.

This prevents a fast or cheap model from being called the best general model
without evidence, and prevents a high-scoring model with failures or retry
overhead from being treated as a reliable default.

## Before starting

Create a run manifest and replace every bracketed value in each prompt:

```text
RUN_ID: [for example: rnd007tst-openrouter-tud-2026-07-20]
PROFILE_NAME: [for example: OpenRouter (TUD)]
TEST_SUITE_NAME: [for example: Engineering Baseline 10]
TEST_PROMPTS_FILE: [absolute path to the benchmark test Markdown]
RUN_JSON: [absolute path to benchmark run JSON]
CHAT_EXPORT_JSON: [absolute path to stored-chat export]
WATCHDOG_TELEMETRY_JSON: [absolute path to Watchdog telemetry]
OUTPUT_DIR: [absolute path to docs or a run-specific review folder]
```

Use one unique `RUN_ID` per execution. Never overwrite an earlier run's
evidence or review documents; comparisons across runs should be a separate,
explicit exercise.

## Required evidence boundaries

- Use model IDs exactly as recorded by the benchmark artifacts.
- Keep accepted-final results separate from all upstream attempts/retries.
- Treat empty finals, truncation, and retries as reliability evidence.
- Never convert generic/fallback Watchdog estimates into model-specific cost.
- Do not compare prices across models unless the stored pricing source is
  explicitly model-specific and comparable.
- State when token totals are derived from input plus output fields rather than
  present as a native total field.
- Do not use external model marketing, account dashboards, or prior benchmark
  conclusions unless the task explicitly provides them as evidence.

## Deliverables

| Step | Required output |
| --- | --- |
| 01 | `01_FACTUAL_EVIDENCE_[RUN_ID].md` and optional machine-readable ledger |
| 02 | `02_QUALITY_AND_ROLE_ASSESSMENT_[RUN_ID].md` |
| 03 | `03_TOKEN_AND_COST_EFFICIENCY_[RUN_ID].md` |
| 04 | `04_TIME_AND_LATENCY_EFFICIENCY_[RUN_ID].md` |
| 05 | `05_DREAM_TEAM_SYNTHESIS_[RUN_ID].md` |
| 06 | `06_TEAM_BENCHMARK_BRIEF_[RUN_ID].md` and `06_TEAM_BENCHMARK_BRIEF_[RUN_ID].pdf` |

The final brief is a presentation artifact. The preceding reports remain the
source evidence for its claims.
