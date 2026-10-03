# Kujo context guidance experiment

Compare the existing development task 2 with the same task plus `kujo-start.md`.
Keep provider, model, tools, settings and application code unchanged. Use a fresh
assigned directory for each arm; do not expose earlier generated answers.
`protocol.json` records the predeclared rubric and reference hashes for the
October 3, 2026 exploratory pair. The guide contains references and language
facts, not a prime-counting solution. It does not connect an MCP server.

Prepare two suite files from `benchmarks/development-tasks.md`:

1. Extract only `# TEST 2` through the separator before `# TEST 3`.
2. Replace `data/dev-benchmark-2026-10-02/02` with a fresh directory under `data/`
   for each arm. Add the same restriction to both: do not read previous benchmark
   artifacts or generated answers; consult language/runtime docs only outside
   the assigned directory.
3. For the treatment only, insert the complete guide inside `## Prompt`, before
   the final `* * *` separator. Keep the control prompt otherwise identical.
4. Run sequentially through the existing benchmark system with configured local
   authentication; do not pass credentials in recorded command lines.

```sh
node scripts/run-benchmark-suite.js \
  --tests data/YOUR-FRESH-ARM/suite.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --run-id YOUR-UNIQUE-ARM \
  --max-tokens 6000 --max-attempts 1 --stream-timeout-ms 1200000 --concurrency 1
```

After both arms finish, independently run both generated programs at
0/1/2/3/4/49/1000 and verify counts 0/0/1/2/2/15/168. Inspect actual execution
receipts for syntax errors, docs reads, compilation, five trials, medians and
unsupported measurement claims. Record latency/tokens/rounds, but do not infer
speedup when the model selected different workloads or algorithms. Keep raw
outputs under ignored `data/`; commit only sanitized assessment and metrics.

A single pair can identify promising behavior; repeat with counterbalanced order
and more task families before claiming a general quality improvement.
