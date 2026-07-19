# 01 — Factual Evidence Package Prompt

Copy everything below into the reviewing agent after the benchmark runner has
finished.

```text
Create an objective factual evidence package for one completed benchmark run.

Run context:
- Run ID: [RUN_ID]
- Provider/profile: [PROFILE_NAME]
- Test suite: [TEST_SUITE_NAME]
- Test prompts: [TEST_PROMPTS_FILE]
- Run artifact: [RUN_JSON]
- Stored-chat export: [CHAT_EXPORT_JSON]
- Watchdog telemetry: [WATCHDOG_TELEMETRY_JSON]
- Output directory: [OUTPUT_DIR]

Write [OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].md and, if practical,
[OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].json.

This is a factual audit only. Do not score response quality, rank models,
recommend models, assign job roles, classify models by license/deployment, or
use outside pricing/model knowledge.

Reconcile the run artifact, stored chats, and telemetry. Record:
1. Run timestamps, duration, profile, models, tests, requested responses,
   accepted finals, empty finals, upstream attempts, and retries.
2. Per-model requested/accepted/empty counts; attempts; retries; recovered
   retries; final response tokens; retry-inclusive tokens; median and p95
   latency; and raw error categories.
3. Accepted-final input/output/total tokens and retry-inclusive
   input/output/derived-total tokens. Explain any derived totals or missing
   native total-token fields.
4. Pricing provenance for every model. Label each one exactly as one of:
   comparable model-specific estimate, generic fallback estimate, unavailable,
   or unknown. Do not calculate cross-model cost rankings in this step.
5. Structural response facts such as empty output, detected truncation,
   missing required sections, unsupported-claim signals, and prompt-instruction
   violations. Cite the exact test/model/response location for every signal.
6. An evidence inventory mapping each later claim to a source file and field.

Use tables. Preserve exact model IDs and test numbers. Separate observed facts
from derived values and explain every formula. State all limitations, including
missing traces, unavailable provider billing, and generic fallback prices.

Finish with a concise verification checklist showing that model totals reconcile
to run totals. Do not make recommendations.
```
