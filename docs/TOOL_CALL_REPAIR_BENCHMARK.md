# Tool Call Repair Benchmark Record

Recorded 2026-08-11 with Node.js 22.17.0 from the clean
`codex/tool-call-repair` worktree:

```bash
npm run benchmark:tool-repair:fixture
```

| Metric | Before | After |
| --- | ---: | ---: |
| Repair rate | 0% | 100% (7/7 malformed calls) |
| Retry count | 7 | 0 |
| Estimated fixture-input tokens | 218 | 109 |
| Harness latency | 0.452 ms | 3.248 ms |
| Task completion | 0% | 100% |

The token figure is the deterministic fixture payload estimate (four bytes per
token), including one retry for each baseline-invalid call. It is not a provider
billing measurement. The live Watchdog runner records provider-reported input,
output, total, and cache token fields instead.

The fixture matrix covers five provider families and six model labels. All
repaired calls passed the exact advertised JSON Schema after repair. Permission
and workspace-boundary checks run separately against the real local executor.
Live-provider trials use `benchmarks/tool-call-repair.md` and are intentionally
not checked in because model responses, local credentials, and Watchdog runtime
artifacts are environment-specific.
