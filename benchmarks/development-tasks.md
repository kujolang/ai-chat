# TEST 1: CSV program

## Prompt
Write a single-file Go program that reads a CSV of sample orders and prints total revenue per customer. Create fixtures with valid rows, an empty field and a malformed amount. Add tests for totals and invalid input. Run tests and program yourself and fix failures. Report actual output.

Use local tools to do the work, not just describe commands. First inspect available runtimes and workspace metadata. Use only `Kujolang/kujo-repos/ai-chat/data/dev-benchmark-2026-10-02/01` relative to workspace_0 for all created or modified files (create it if absent). This is an isolated benchmark work directory; do not edit any other project or change server settings. Read documentation elsewhere only as needed. Do not commit, push, install global dependencies, or use network services. Use shell commands without wrappers where possible. Finish with commands, exit statuses, artifact paths and measured results; never invent results.

* * *

# TEST 2: Kujo and Go benchmark

## Prompt
Write equivalent single-file Kujo and Go prime-counting programs. Read available Kujo documentation before choosing syntax. Start at 1000 inputs, verify equal results, increase workload for useful timings. Compile Go before measuring execution and report compilation separately. Run five trials each and report medians, versions and exact commands. Inspect errors and fix them. Request suitable timeouts.

Use local tools to do the work, not just describe commands. First inspect available runtimes and workspace metadata. Use only `Kujolang/kujo-repos/ai-chat/data/dev-benchmark-2026-10-02/02` relative to workspace_0 for all created or modified files (create it if absent). This is an isolated benchmark work directory; do not edit any other project or change server settings. Read documentation elsewhere only as needed. Do not commit, push, install global dependencies, or use network services. Use shell commands without wrappers where possible. Finish with commands, exit statuses, artifact paths and measured results; never invent results.

* * *

# TEST 3: Debug unfamiliar code

## Prompt
Inspect the existing small fixture in your assigned directory, including its documented contract, before editing. Find a reproducible correctness bug. Add a regression test and run it to demonstrate failure before making the smallest fix, then rerun. Preserve interfaces. Report cause, changed files and exact verification results.

Use local tools to do the work, not just describe commands. First inspect available runtimes and workspace metadata. Use only `Kujolang/kujo-repos/ai-chat/data/dev-benchmark-2026-10-02/03` relative to workspace_0 for all created or modified files (create it if absent). This is an isolated benchmark work directory; do not edit any other project or change server settings. Read documentation elsewhere only as needed. Do not commit, push, install global dependencies, or use network services. Use shell commands without wrappers where possible. Finish with commands, exit statuses, artifact paths and measured results; never invent results.

* * *

# TEST 4: HTTP API

## Prompt
Create a Node.js project using built-in modules only. Implement HTTP task create/list/update/delete with JSON-file persistence, input validation, appropriate status codes and malformed JSON handling. Write integration tests using an available port, exercise API, restart server and verify persistence. Run all tests and fix failures. Clean up server processes.

Use local tools to do the work, not just describe commands. First inspect available runtimes and workspace metadata. Use only `Kujolang/kujo-repos/ai-chat/data/dev-benchmark-2026-10-02/04` relative to workspace_0 for all created or modified files (create it if absent). This is an isolated benchmark work directory; do not edit any other project or change server settings. Read documentation elsewhere only as needed. Do not commit, push, install global dependencies, or use network services. Use shell commands without wrappers where possible. Finish with commands, exit statuses, artifact paths and measured results; never invent results.

* * *

# TEST 5: Intentional timeout recovery

## Prompt
Create a harmless Node.js script printing started, waiting five seconds, then printing finished. It must not write files or spawn subprocesses. Run with timeout_ms=1000. Inspect returned partial evidence. Then run ONCE with timeout_ms=10000 and verify success. Report actual partial and complete output. Do not change settings.

Use local tools to do the work, not just describe commands. First inspect available runtimes and workspace metadata. Use only `Kujolang/kujo-repos/ai-chat/data/dev-benchmark-2026-10-02/05` relative to workspace_0 for all created or modified files (create it if absent). This is an isolated benchmark work directory; do not edit any other project or change server settings. Read documentation elsewhere only as needed. Do not commit, push, install global dependencies, or use network services. Use shell commands without wrappers where possible. Finish with commands, exit statuses, artifact paths and measured results; never invent results.

* * *

# TEST 6: Duplicate-file CLI

## Prompt
Create a Go CLI that scans a directory and reports duplicate files by content hash. Implement deterministic output and useful errors. Test empty files, nested directories, duplicate contents with different names, and unreadable paths when practical. Run formatting, tests and build. Exercise compiled CLI on fixtures. Fix failures and clean up processes. Report verified results.

Use local tools to do the work, not just describe commands. First inspect available runtimes and workspace metadata. Use only `Kujolang/kujo-repos/ai-chat/data/dev-benchmark-2026-10-02/06` relative to workspace_0 for all created or modified files (create it if absent). This is an isolated benchmark work directory; do not edit any other project or change server settings. Read documentation elsewhere only as needed. Do not commit, push, install global dependencies, or use network services. Use shell commands without wrappers where possible. Finish with commands, exit statuses, artifact paths and measured results; never invent results.

* * *

