# Engineering judgment v1 — bounded comparison

Recorded before model generation. Starting source: b7714ba. Six fresh tasks:
configuration compatibility, Kujo CLI extension, atomic persistence, subprocess
cancellation, serialized updates, and conservative interpretation of ambiguous
cleanup. Five tasks use Node standard library; one uses the pinned Kujo 1.7.0.
This measures broader engineering behavior, **not six Kujo implementation tasks**.

Compare one baseline GLM 5.3 Flash round with one guided GLM round. Both retain
the previously qualified compact Kujo reference, allocation guidance, batch checks
and always-review settings. The only intended intervention is the short
`engineering-decision-guidance.md` appended to each treatment prompt. Do not add
runtime features or promote defaults merely because the text sounds sensible.
Run one frontier control using an already connected ChatGPT plan model, when its
supported route is usable; record the exact model and routing differences. Native
Codex is not a same-harness substitute. No automatic reruns of failed tasks.

Each arm has six fresh directories and chat IDs, one attempt, 12000 response-token
allowance, 900000 ms caller deadline, sequential tasks. Freeze prompt, seed,
oracle, controls and guidance hashes before generation and verify before grading.
Builder instructions prohibit acceptance/prior-answer reads. Scoped local roots
reduce accidental access but unrestricted shell is **not OS read isolation**.
Audit available tool receipts; disclose contamination rather than hiding a run.
No manual edits of model answers. Retain failed deliveries and all reported costs.

The controller runs 33 named independent groups through real entry points,
including short writes, failed rename, exclusive-file collision, pre-abort,
SIGTERM resistance, concurrent overlap, failed-queue recovery and non-destructive
preview. A group may contain multiple assertions. Count groups as groups, not as
independent tasks. Calibrate using correct implementations and intentional
compatibility/concurrency/destructive-write/failure-swallowing defects before
freezing. Process timeouts and crashes fail; they do not satisfy rejection cases.

Report separately: terminal delivery, independent functional/failure checks,
review verdict, tokens/usage completeness, model tool calls/rounds, elapsed time,
and human interventions. Grade source per dimension using anchored 0–4 judgments:
0 missing/broken; 1 serious defects; 2 basic implementation with material gaps;
3 correct, appropriate and adequately tested for the contract; 4 unusually clear,
complete evidence and proportionate design. Dimensions: maintainability,
integration/compatibility, failure/resource handling, and judgment/claim accuracy.
These are controller judgments, not independent automated scores or developer ranks.
Do not let a high style score cancel an acceptance failure. Keep source hashes and
specific evidence for every rating. Report review inconclusive separately.

Promotion requires no lost deliveries or new acceptance failures, a concrete
quality improvement in more than one task, and no more than 25% increase in
reported tokens. One sample is exploratory; repeat on new held-out tasks before
changing default agent guidance. Otherwise retain the existing local defaults.
No endless prompt tuning to this suite. Escalation policy remains a proposal until
same-task frontier evidence demonstrates a benefit worth its cost.
