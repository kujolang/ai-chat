# 02 — Interchangeable Test-Suite Template

Create a new Markdown file from this template for every benchmark focus. The
runner supports any positive number of tests; use sequential test numbers for
stable chat titles and clean report references.

```markdown
# [Test Suite Name]

## Purpose

[What this suite measures. Keep this stable during one run.]

## Evaluation notes

[Optional: constraints, expected response shape, or reviewer rubric reference.]

# TEST 1: [Short test title]

## Prompt

[Exact prompt sent to every pane.]

* * *

# TEST 2: [Short test title]

## Prompt

[Exact prompt sent to every pane.]

* * *

# TEST 3: [Short test title]

## Prompt

[Exact prompt sent to every pane.]
```

## Authoring rules

- Do not include provider/model names unless comparing compliance with a named
  model is intentionally part of the test.
- Keep a test's prompt identical for every pane in a run.
- Prefer a test suite that identifies which tests support which future job lane
  (for example: implementation, debugging, orchestration, review, copy).
- Version the file or include its date in the filename when you change prompts.
- For an instruction-file experiment, keep the test file unchanged and use a
  different `RUN_ID` and profile/configuration label. That makes the effect of
  the instruction change auditable.
- Do not edit a test file while a run using it is active.
