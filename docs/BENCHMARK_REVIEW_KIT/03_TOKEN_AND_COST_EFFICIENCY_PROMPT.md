# 03 — Token and Cost Efficiency Prompt

Run this after the factual package and quality assessment. It is the **token /
cost** view and must not silently reward unreliable models.

```text
Create a token and cost efficiency assessment for one completed benchmark run.

Inputs:
- Run ID: [RUN_ID]
- Provider/profile: [PROFILE_NAME]
- Factual evidence package: [OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].md
- Quality assessment: [OUTPUT_DIR]/02_QUALITY_AND_ROLE_ASSESSMENT_[RUN_ID].md
- Run artifact: [RUN_JSON]
- Watchdog telemetry: [WATCHDOG_TELEMETRY_JSON]
- Output directory: [OUTPUT_DIR]

Write [OUTPUT_DIR]/03_TOKEN_AND_COST_EFFICIENCY_[RUN_ID].md.

Required sections:

1. Measurement rules. Keep accepted-final usage separate from retry-inclusive
   upstream usage. State whether totals are native or derived.
2. Token efficiency table, ranked by:
   quality average / mean accepted-final total tokens in thousands

   Columns:
   Model | Quality /30 | Success | Mean final tokens | Token-efficiency score |
   Retry-token multiplier | Interpretation

3. Run-level overhead table:
   Model | Final tokens | Retry-inclusive tokens | Token delta | Retry multiplier |
   Empty finals | Retries

4. Comparable documented-cost table. Include only models with explicitly
   comparable, model-specific price provenance:
   Model | Final cost | Retry-inclusive cost | Cost per accepted final |
   Quality /30 | Success | Decision

5. Explicit excluded-cost list for models with generic fallback, unknown, or
   unavailable pricing. Do not assign them a relative dollar rank.
6. Recommendations, separately named:
   - best low-token bounded-work route
   - best quality-per-token route
   - best documented quality-per-dollar route
   - models whose retry overhead makes their apparent final-answer efficiency
     misleading
7. Limits: token efficiency is not actual billing; configured estimates are not
   provider invoices; results are only comparable within this run/profile.

Rules:
- Do not call a model low-cost or cheap unless it is in the comparable
  model-specific-price table.
- Do not let a model with empty finals or material retries win a default lane
  solely through accepted-answer token efficiency.
- Use exact model IDs and round values consistently.
- Do not repeat the general quality ranking except where needed to explain the
  efficiency trade-off.
```
