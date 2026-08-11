# Tool Call Repair Boundary

AI Chat validates every executable tool call against the same JSON Schema sent to
the model. Valid calls execute unchanged. Invalid calls receive a bounded repair
attempt, are validated again, and execute only after the repaired input satisfies
the advertised schema.

## Repair catalogue

Repairs are composable and schema-directed:

- omit `null` only for optional fields;
- parse JSON-encoded arrays and nested objects;
- wrap a bare scalar only when the schema identifies its destination;
- map reviewed tool, field, and enum aliases to one canonical contract;
- unwrap only degenerate markdown auto-links in path fields;
- coerce exact numeric and boolean strings when the schema requires that scalar;
- fill reviewed relational defaults such as a missing read `offset` or `limit`;
- reject unknown fields, ambiguous containers, out-of-range values, and anything
  still invalid after repair.

Every successful repair adds a value-free `tool_input_repair` note to the tool
result so the model can use the canonical form on its next call. Watchdog trace
events and `/api/health` report model/tool counters and repair kinds, never
argument or result values.

## Audit findings and controls

| Boundary concern | Control |
| --- | --- |
| Malformed but recoverable calls | Validate first, repair a cloned invalid input, validate again |
| Relational invariants | Explicit per-tool defaults with a surfaced note |
| Overlapping tools | Canonical schemas remain primary; camelCase names are compatibility aliases; deprecated `browser_use` remains labeled and isolated |
| Oversized results | Executor-specific bounds plus `MAX_TOOL_RESULT_BYTES`; older tool pairs are compacted at `MAX_TOOL_CONTEXT_CHARS` |
| Context/cache churn | Stable canonical schema order, no repair preprocessor on valid calls, bounded tool results, and per-round context compaction |
| Permissions and workspace scope | Repair happens before the existing executor; local path resolution, sensitive-path blocks, read ledger, write/shell opt-ins, and browser policy remain authoritative |

The local read contract is not rewritten by repair. It remains 1-indexed,
bounded by lines/bytes/characters, and must report exact continuation coordinates.
Path aliases and markdown cleanup still flow through the existing containment,
symlink, sensitive-path, and immutable-read checks.

## Evaluation

The deterministic fixture suite covers DeepSeek, Qwen/Ollama, GLM/OpenRouter,
Anthropic, and OpenAI-shaped failures:

```bash
npm run benchmark:tool-repair:fixture
```

For end-to-end Watchdog telemetry, use a dedicated benchmark instance with a
throwaway read-only workspace and a multi-provider pane profile:

```bash
API_AUTH_TOKEN=your_app_token npm run benchmark:run -- \
  --tests benchmarks/tool-call-repair.md \
  --pane-profile "Tool Repair Matrix" \
  --tool-preset tool-repair
```

The generated run artifact includes task completion, retry count, tool repair
rate, token usage, provider rounds, latency, model, tool counts, and Watchdog
trace IDs. Use multiple trials for live providers; the fixture benchmark is the
deterministic regression gate.

## References studied

- [Command Code: Tool Call Repairs](https://commandcode.ai/docs/harness-engineering/tool-call-repairs)
- [Command Code: Tools](https://commandcode.ai/docs/reference/tools)
- [Command Code: Context & Compaction](https://commandcode.ai/docs/context)
- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
