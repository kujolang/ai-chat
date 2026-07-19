# 06 — Team Brief and PDF Prompt

Run this after the dream-team synthesis. It creates the shareable artifact
without replacing the detailed source reports.

```text
Create a team-shareable benchmark briefing from the completed assessment set.

Inputs:
- Run ID: [RUN_ID]
- Provider/profile: [PROFILE_NAME]
- Test suite: [TEST_SUITE_NAME]
- Factual evidence: [OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].md
- Quality assessment: [OUTPUT_DIR]/02_QUALITY_AND_ROLE_ASSESSMENT_[RUN_ID].md
- Token/cost assessment: [OUTPUT_DIR]/03_TOKEN_AND_COST_EFFICIENCY_[RUN_ID].md
- Time assessment: [OUTPUT_DIR]/04_TIME_AND_LATENCY_EFFICIENCY_[RUN_ID].md
- Dream-team synthesis: [OUTPUT_DIR]/05_DREAM_TEAM_SYNTHESIS_[RUN_ID].md
- Output directory: [OUTPUT_DIR]

Create both:
- [OUTPUT_DIR]/06_TEAM_BENCHMARK_BRIEF_[RUN_ID].md
- [OUTPUT_DIR]/06_TEAM_BENCHMARK_BRIEF_[RUN_ID].pdf

The PDF must be created from the Markdown/source data, visually inspected after
rendering, and must not introduce a claim that is absent from the source
reports.

Required brief structure:
1. Title, run ID, profile, test-suite name, date, and scope.
2. Run snapshot: model count, test count, accepted/requested finals, retries,
   duration, accepted-final tokens, and retry-inclusive tokens.
3. Three short assessment summaries:
   - General quality and job-lane leaders
   - Token/cost efficiency leaders and price-coverage limitation
   - Time/latency efficiency leaders
4. Dream-team roster table:
   Role | Primary | Alternate | Why | Review boundary
5. Decision matrix:
   Job lane | Quality choice | Token/cost choice | Time choice | Final choice
6. Reliability watchlist: failures, retries, truncation, and any models kept
   out of default routing.
7. Assumptions and limits, including that configured estimates are not invoices
   and one benchmark run is not an SLA or permanent policy.
8. Source-report filenames and generation date.

Formatting requirements:
- Use readable tables, clear page breaks, and no raw response dumps.
- Keep the executive material to roughly 4–8 PDF pages; link or cite the
  detailed Markdown reports for audit depth.
- Include no credentials, raw private prompts beyond the named test suite, or
  private chain-of-thought.
- Verify that the rendered PDF is legible and that every table fits its page.
```
