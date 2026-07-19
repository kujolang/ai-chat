# 02 — Quality and Role Assessment Prompt

Run this only after the factual package is complete. It is the **general
quality** view—not a cost or speed ranking.

```text
Create a scored quality and role assessment for one completed benchmark run.

Inputs:
- Run ID: [RUN_ID]
- Provider/profile: [PROFILE_NAME]
- Test suite and prompts: [TEST_PROMPTS_FILE]
- Factual evidence package: [OUTPUT_DIR]/01_FACTUAL_EVIDENCE_[RUN_ID].md
- Run artifact: [RUN_JSON]
- Stored-chat export: [CHAT_EXPORT_JSON]
- Output directory: [OUTPUT_DIR]

Write [OUTPUT_DIR]/02_QUALITY_AND_ROLE_ASSESSMENT_[RUN_ID].md and a
machine-readable score ledger if one does not already exist.

Score every accepted final response against the supplied tests using these six
dimensions, each 1–5: Correctness, Instruction Following, Completeness,
Clarity, Practical Usefulness, and Reasoning & Judgment. The total is /30.
Do not score empty finals as prose; report them separately as reliability
failures.

Create these required sections and tables:

1. Run scope and scoring method.
2. Overall scorecard:
   Model | Accepted/Requested | Quality /30 | Retries | Quality caveat
3. Per-test and per-job-lane quality tables. Define lanes from the actual test
   prompts, rather than assuming engineering, planning, copy, or security
   categories always exist. If a requested lane has no relevant test evidence,
   mark it "not measured."
4. Response-specific strengths, failure patterns, truncation, unsupported
   claims, and instruction violations with evidence citations.
5. Quality-only recommendations for:
   - overall generalist/default
   - each measured job lane
   - strongest alternate where evidence supports one
6. Models excluded from a default recommendation because incomplete delivery,
   retries, or response failures outweigh a high accepted-answer average.
7. Limits: one run, exact prompts, exact hosted model IDs, scoring subjectivity,
   and no cost or latency conclusion in this document.

Requirements:
- Rank complete/reliable delivery separately from returned-answer quality.
- Do not use token count, latency, or price as a quality tie-breaker here.
- Do not import rankings or wording from earlier benchmark runs.
- Do not recommend autonomous authority for security-sensitive, tenant,
  credential, destructive, backup, or external publishing tasks.
- Make recommendations direct, but label them as evidence-derived and scoped to
  this run.
```
