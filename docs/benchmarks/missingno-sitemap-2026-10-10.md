# MissingNo sitemap script test — 2026-10-10

**Blocked at delivery: no generated script to grade.** Two separate requests through
AI Chat returned `Provider returned an empty response.` This is not evidence of
incorrect sitemap code: executable correctness remains unmeasured.

The requested script audits a local `sitemap.xml`: counts entries, extracts distinct
URLs, lists duplicates, and counts missing locations and lastmod values. No live
site was supplied or scanned. Sitemap indexes are explicitly rejected; this test
does not crawl child sitemaps or evaluate SEO.

## Frozen test

- Prompt: `benchmarks/missingno-sitemap.md`.
- Acceptance: `scripts/verify-sitemap-script.js`, 18 cases, frozen before dispatch.
- Cases cover ordinary/empty sitemaps, stable duplicate ordering, missing fields,
  entities/CDATA/Unicode, prefixed namespaces, extensions, namespace resets, direct
  child selection, literal URL comparison, invalid roots/namespaces/XML/DTD,
  multiple roots, missing files and wrong argument counts.
- Runtime: Kujo 1.7.0, SHA-256
  `2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
  The XML tree API was probed on this binary before preparing the prompt.
- Grading uses a five-second per-case macOS sandbox denying network and writes,
  permitting reads of only the script, runtime and individual fixture under the
  otherwise denied user/temp paths.
- Grader calibration: 18/18 fixture-specific expected-output controls accepted;
  constant-null negative control rejected on every case. These controls validate
  execution and output assessment, **not a reference sitemap implementation**.
- Acceptance SHA-256 manifest was checked unchanged after both requests.

## Requests and result

Both used `stealth/missingno`, profile `Hermes / Nous Portal (Free)` through the
existing Watchdog/Hermes route, fresh chats, no tools, one attempt per run,
12,000 max output tokens, concurrency one and a 600-second stream timeout.
The retry received the identical prompt without feedback or acceptance fixtures.

| Run | Chat ID | Provider duration | Result |
| --- | --- | --- | --- |
| `missingno-sitemap-20261010` | `ad7445db-3240-451c-bf0e-27d34ecfa0fe` | 4.330 s | Empty response |
| `missingno-sitemap-20261010-retry` | `e3837cc1-8c95-4f7b-8d05-cdbbfa156511` | 3.999 s | Empty response |

No provider usage or finish reason was reported. Saved assistant messages contain
AI Chat's error text, not model-authored code. Delivery was 0/2; script checks were
**not run**, not scored 0/18. No manual solution, repair or alternate model was
substituted. Root cause of the empty responses is unestablished.

Local ignored evidence: `data/missingno-sitemap-20261010/` contains both run JSON
files, `acceptance.json`, runtime probe, calibration fixtures and validation logs.

## Reuse

Submit the prompt with the existing `scripts/run-benchmark-suite.js` runner using
the settings above and a new run ID. Preserve each failed attempt. Once a response
is delivered, extract its single Kujo block unchanged and run:

```sh
node scripts/verify-sitemap-script.js grade /absolute/path/to/qualified-kujo /absolute/path/to/generated.kujo data/sitemap-new-grade
```

For output-checker calibration, use `calibrate` instead of `grade` and a disposable
script path: calibration intentionally overwrites that file. Freeze acceptance
assets before dispatch; do not revise cases after seeing a model response.
