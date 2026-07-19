# 03 — Review-Kit Handoff Checklist

Complete this after the runner finishes, before sending the artifacts to the
review prompts.

```text
RUN_ID:
PROFILE_NAME:
TEST_SUITE_NAME:
TEST_FILE:
RUN_JSON:
CHAT_EXPORT_JSON:
WATCHDOG_TELEMETRY_JSON:
PREFLIGHT_JSON_OR_NOTES:
OUTPUT_DIR:

Started at:
Finished at:
Elapsed:
Tests:
Panes/models:
Expected responses:
Completed finals:
Failed/empty finals:
Upstream attempts:
Retries:

Configuration changes compared with prior run:
Known limitations or failures:
Ready for review kit: yes/no
```

Pass the completed manifest and artifacts to:

1. [`01_FACTUAL_EVIDENCE_PROMPT.md`](../BENCHMARK_REVIEW_KIT/01_FACTUAL_EVIDENCE_PROMPT.md)
2. Then the rest of the review kit in numerical order.

Do not use an incomplete or mixed-run artifact set for scoring. If the profile,
test file, global instructions, model list, or runner options changed mid-run,
record the run as non-comparable and start a fresh unique run.
