# Kujo interval quality task

Public reproducibility fixture after the 2026-10-05 comparison; no longer an unseen holdout. Replace RUN_ROOT with a fresh workspace-relative directory.

# TEST 1: Canonical interval union in Kujo

In RUN_ROOT create main.kujo invoked as kujo run main.kujo -- JSON. JSON must be an array of exactly two-element arrays [start,end]. Endpoints must be integers (not booleans), from 0 through 1000000 inclusive, with start <= end. Merge overlapping or touching closed intervals; sort by start, remove duplicates and contained intervals. Empty input produces []. Success prints only the canonical JSON array, stderr empty, exits 0. Invalid JSON, shape, type, range or reversed interval must exit exactly 1, stdout empty, and emit one JSON object with only a nonempty error string to stderr. Validate the entire input before output. Include and run focused tests covering boundaries, rejection and merging chains. Keep source small and explain verification gaps honestly.

Use authorized local tools. All writes and tests stay in RUN_ROOT under workspace_0; use owned fixtures. Do not inspect other benchmark directories, prior answers, verifier scripts or test fixtures. Matching language docs and local_kujo guide are allowed. Do not alter app settings, install packages, commit, push or use live state. Do not modify acceptance tests. Keep final prose concise. Code belongs in files.
