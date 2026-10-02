# Development task benchmark

`development-tasks.md` contains six executable development tasks, not prose-only
questions. `local-dev` explicitly enables local read/write/shell and documentation
tools. Requires local tools, writes and shell enabled on the target server.

The checked-in prompts are the October 2, 2026 run snapshot. Before another run,
copy the suite and replace its `data/dev-benchmark-2026-10-02/NN` paths with a fresh
run directory relative to the configured workspace. Seed case 03 from
`benchmarks/fixtures/discount/`; it intentionally violates its documented contract.
Do not repair that seed before asking the model to debug it. Other cases start empty.
Use unique titles/run IDs to prevent the runner reusing prior responses.

Example (credentials supplied through API_AUTH_TOKEN, never command arguments):

```sh
npm run benchmark:run -- --tests benchmarks/development-tasks.md \
  --provider-profile 'Watchdog / Ollama Cloud' \
  --model deepseek-v4.1-flash:cloud --tool-preset local-dev \
  --require-instance-role any --concurrency 1 --max-attempts 1 \
  --stream-timeout-ms 1200000 --title-prefix 'DEV20261002 ' \
  --run-id dev-2026-10-02-deepseek
```

`any` intentionally targets the interactive instance with its real provider settings.
Prefer a dedicated benchmark instance when available. Paths constrain the prompt,
not the operating system: local shell is not sandboxed. Do not run untrusted suites.
The overall runner deadline is distinct from each shell command's deadline.

A successful stream is not proof of task success. Review saved execution receipts,
inspect generated files, rerun their tests, and check outputs against the prompt.
Keep raw responses and execution artifacts under ignored `data/`; record sanitized
results, limitations, chat IDs and reproduction steps in a report.
