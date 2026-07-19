# 04 — Time and Latency Efficiency Prompt

Run this after the factual and quality reports. It is the **time** view, not a
general quality ranking.

```text
Create a time and latency efficiency assessment for one completed benchmark
run.

Inputs:
- Run ID: [RUN_ID]
- Provider/profile: [PROFILE_NAME]
- Factual evidence package: [OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].md
- Quality assessment: [OUTPUT_DIR]/02_QUALITY_AND_ROLE_ASSESSMENT_[RUN_ID].md
- Run artifact: [RUN_JSON]
- Watchdog telemetry: [WATCHDOG_TELEMETRY_JSON]
- Output directory: [OUTPUT_DIR]

Write [OUTPUT_DIR]/04_TIME_AND_LATENCY_EFFICIENCY_[RUN_ID].md.

Required sections:

1. Measurement rules, including the latency source, sample size, and whether
   timings represent end-to-end Watchdog requests or another measurement.
2. Speed table:
   Model | Quality /30 | Success | Median latency | p95 latency |
   Retries | Time-efficiency interpretation
3. Latency reliability table:
   Model | Median | p95 | p95/median ratio | Empty finals | Retries |
   Operational implication
4. Job-lane speed choices. For every lane measured by the quality report,
   identify the fastest model that still meets a stated quality and reliability
   threshold. If no model meets the threshold, say so instead of naming the
   fastest one.
5. Recommendations, separately named:
   - fastest route overall
   - fastest high-quality reliable route
   - most stable tail-latency route, if supported
   - routes to avoid for interactive work
6. Limits: latency can change with queueing, provider routing, prompt length,
   region, and retries; do not treat one run as an SLA.

Rules:
- Never call the lowest median-latency model the best time route if it has
  inadequate quality, failures, or high tail latency for the proposed task.
- Do not use token or dollar estimates as the deciding criteria in this report.
- Preserve exact model IDs and evidence citations.
```
