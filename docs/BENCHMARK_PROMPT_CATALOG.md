# Benchmark Prompt Catalog

This catalog lists the original benchmark questions used in the four benchmark
runs currently stored in this repository's artifacts.

## Run map

- `RND005 OpenRouter (TUD) — 2026-07-18`: 10-test baseline question set
- `RND006 Ollama (TUD) — 2026-07-18`: same 10-test baseline question set
- `RND007 OpenRouter (TUD) TypeScript / WordPress — 2026-07-19`: 12-test
  TypeScript/WordPress question set
- `RND007 Ollama (TUD) TypeScript / WordPress — 2026-07-19`: same 12-test
  TypeScript/WordPress question set

## Source notes

- `RND006` and both `RND007` runs are backed by checked-in chat exports in
  `data/benchmark-runs/*-chat-export.json`.
- `RND005` does not currently include a checked-in chat export. Its prompt list
  matches the paired 10-test baseline set used by `RND006`, confirmed by shared
  test numbering and titles across the run artifacts and review documents.

## RND005 OpenRouter (TUD) — baseline set

1. `TST001` — BUG HUNT AND FIX
2. `TST002` — FEATURE IMPLEMENTATION
3. `TST003` — CHANGE REQUEST
4. `TST004` — SECURITY REVIEW
5. `TST005` — TECHNICAL PLANNING
6. `TST006` — PROBLEM DIAGNOSIS
7. `TST007` — PRODUCT MANAGEMENT
8. `TST008` — MARKETING AND POSITIONING
9. `TST009` — EXECUTIVE SYNTHESIS
10. `TST010` — SAFE CONNECTOR ACTION RUNNER

## RND006 Ollama (TUD) — baseline set

1. `TST001` — BUG HUNT AND FIX
2. `TST002` — FEATURE IMPLEMENTATION
3. `TST003` — CHANGE REQUEST
4. `TST004` — SECURITY REVIEW
5. `TST005` — TECHNICAL PLANNING
6. `TST006` — PROBLEM DIAGNOSIS
7. `TST007` — PRODUCT MANAGEMENT
8. `TST008` — MARKETING AND POSITIONING
9. `TST009` — EXECUTIVE SYNTHESIS
10. `TST010` — SAFE CONNECTOR ACTION RUNNER

## RND007 OpenRouter (TUD) TypeScript / WordPress set

1. `TST001` — Type-Safe Connector Result Normalization
2. `TST002` — React Request Race and Cancellation Fix
3. `TST003` — Multi-Tenant TypeScript Authorization Boundary
4. `TST004` — Front-End Backup List Performance Investigation
5. `TST005` — Accessible Restore Confirmation Flow
6. `TST006` — WordPress Admin Action Security Review
7. `TST007` — WordPress Abilities API - Secure Backup Summary Ability
8. `TST008` — WordPress Ability REST Exposure Threat Model
9. `TST009` — Connector Webhook SSRF and Retry Design
10. `TST010` — PHP WordPress Connector Vulnerability Triage
11. `TST011` — TypeScript Contract and Failure-Mode Tests
12. `TST012` — Incremental Delivery Plan for a WordPress AI Connector

## RND007 Ollama (TUD) TypeScript / WordPress set

1. `TST001` — Type-Safe Connector Result Normalization
2. `TST002` — React Request Race and Cancellation Fix
3. `TST003` — Multi-Tenant TypeScript Authorization Boundary
4. `TST004` — Front-End Backup List Performance Investigation
5. `TST005` — Accessible Restore Confirmation Flow
6. `TST006` — WordPress Admin Action Security Review
7. `TST007` — WordPress Abilities API - Secure Backup Summary Ability
8. `TST008` — WordPress Ability REST Exposure Threat Model
9. `TST009` — Connector Webhook SSRF and Retry Design
10. `TST010` — PHP WordPress Connector Vulnerability Triage
11. `TST011` — TypeScript Contract and Failure-Mode Tests
12. `TST012` — Incremental Delivery Plan for a WordPress AI Connector

Use `/benchmark-prompts.html` for the full interactive prompt viewer.
