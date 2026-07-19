# 05 — Dream Team Synthesis Prompt

Run this only after `02`, `03`, and `04` are complete. This is the only step
that merges general quality, tokens/cost, and speed into an operating model.

```text
Create the final role-based model-team synthesis for one completed benchmark
run.

Inputs:
- Run ID: [RUN_ID]
- Provider/profile: [PROFILE_NAME]
- Test suite: [TEST_SUITE_NAME]
- Factual evidence: [OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].md
- Quality and role assessment: [OUTPUT_DIR]/02_QUALITY_AND_ROLE_ASSESSMENT_[RUN_ID].md
- Token/cost assessment: [OUTPUT_DIR]/03_TOKEN_AND_COST_EFFICIENCY_[RUN_ID].md
- Time assessment: [OUTPUT_DIR]/04_TIME_AND_LATENCY_EFFICIENCY_[RUN_ID].md
- Output directory: [OUTPUT_DIR]

Write [OUTPUT_DIR]/05_DREAM_TEAM_SYNTHESIS_[RUN_ID].md.

Do not rerun or rescore the benchmark. Reconcile the three supplied assessments
and preserve their evidence boundaries.

Required sections:

1. Executive decision: a concise recommended model team and the exact scope of
   the benchmark.
2. Cross-review matrix:
   Job lane | General-quality leader | Token-efficient leader |
   Time-efficient leader | Recommended production choice | Why

   Use "not measured" where the test suite cannot support a lane.
3. Dream-team roster:
   Role | Primary model | Alternate | Selection rationale | Handoff/review rule

   Include only roles supported by tests, such as implementation, debugging,
   planning/orchestration, technical review, bounded high-volume work,
   security-review advisory, or external copy review.
4. Trade-off decisions. Explain each case where the general-quality winner is
   not selected because a sufficiently strong token- or time-efficient option
   is better suited to that role.
5. Reliability gate. Exclude candidates that have empty finals, material retry
   overhead, truncation, or unmeasured relevant skills unless a human explicitly
   accepts the trade-off.
6. Operating rules:
   - when to use primary vs. alternate
   - when to escalate to the higher-quality model
   - mandatory human-review boundaries
   - conditions requiring re-benchmarking
7. A compact "team card" with no more than six primary models, suitable for
   sharing with engineers.
8. Evidence and limits. State that this is a run-specific recommendation, not
   an enduring model policy; note unavailable comparable prices and unmeasured
   lanes.

Decision rules:
- A model can lead multiple roles only when the evidence supports it; avoid
  artificial diversification.
- Prefer a simpler roster when two choices are materially equivalent.
- Do not blend incomparable fallback-cost estimates into cost decisions.
- Do not grant models autonomous permission for security-sensitive, tenant,
  credential, destructive, backup, or external-publication actions.
- Every row must point back to quality, token/cost, and time evidence or state
  which evidence is unavailable.
```
