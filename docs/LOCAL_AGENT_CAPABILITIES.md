# Local Agent Capabilities

AI Chat exposes local power through explicit provider-neutral tool contracts. Skill files remain read-only context; local actions are separate capabilities that must be enabled and configured by the server owner.

Every built-in contract shares the same schema boundary before execution. Valid argument values remain semantically unchanged; common finite shape errors are repaired deterministically, reported back to the model, and counted without values in telemetry. Inputs that remain invalid never reach the local, browser, search, skill, or action executor.

Skill reads reject binary or invalid UTF-8 content even when it uses a text extension. Character limits preserve complete Unicode code points, and `truncated` means additional content actually exists beyond the returned window.

## Capability Map

| Area | Tool contracts | Default | Purpose | Security boundary |
| --- | --- | --- | --- | --- |
| Skills | `skill_list`, `skill_read`, `skill_file_read` | Enabled | Read installed `SKILL.md` manuals and referenced text files | Read-only, bounded, scoped to configured skill roots |
| System time | `system_time` | Enabled | Return the current UTC timestamp and local timezone | Read-only; no web, filesystem, shell, or credential access |
| Workspace files | `local_workspace_list`, `local_file_list`, `local_file_read` | Disabled | Inspect configured workspaces with line/column pagination | Read-only, streamed and bounded by lines/bytes/characters/per-line size, sensitive-name denylist, no absolute paths returned |
| Workspace writes | `local_file_write` | Disabled | Create/overwrite/append bounded text files | Requires `AI_CHAT_LOCAL_WRITE_ENABLED=1`; overwrite also requires a complete unchanged read in the current request |
| Shell | `local_shell` | Disabled | Run allowlisted local commands | Requires `AI_CHAT_LOCAL_SHELL_ENABLED=1`, no shell interpolation, args array only, sanitized environment, timeout/output limits |
| Action adapters | `action_adapter_list`, `action_adapter_call` | Disabled | Bridge document, MCP, plugin, and workflow actions through local adapter services | Requires a manifest, loopback-only HTTP POST, structured JSON input, bounded JSON output |
| Browser | `browser_open`, `browser_snapshot`, `browser_act`, `browser_close` | Disabled | Inspect public web pages | Existing Playwright isolation and approval policy |
| Web search | `web_search` | Enabled when backend credentials/config exist | Search external web | Existing backend policy and cache controls |
| Page reader | `web_fetch` | Available; request must select it | Read static HTML/plain text without Chromium | Shared browser URL/DNS policy, pinned sockets, bounded read-only GET |

## Recommended Test Configuration

Use a throwaway workspace first:

```bash
mkdir -p /tmp/ai-chat-local-tools
printf 'hello\n' > /tmp/ai-chat-local-tools/example.md

AI_CHAT_LOCAL_TOOLS_ENABLED=1 \
AI_CHAT_LOCAL_WORKSPACE_ROOTS=/tmp/ai-chat-local-tools \
AI_CHAT_LOCAL_WRITE_ENABLED=1 \
AI_CHAT_LOCAL_SHELL_ENABLED=1 \
AI_CHAT_LOCAL_SHELL_ALLOWLIST=git,rg,ls,pwd,npm,kujo \
KUJO_BIN=/absolute/path/to/kujo \
AI_SDK_PATH=/absolute/path/to/ai-sdk/src \
ENCRYPTION_SECRET=replace_with_strong_secret \
API_AUTH_TOKEN=replace_with_strong_token \
npm run dev
```

Then open Settings > Tools and add Skill Tool Presets plus Local Tool Presets.

For document, MCP, plugin, or workflow actions, expose a trusted local adapter service and point AI Chat at a manifest:

```json
{
  "adapters": [
    {
      "id": "docx_summary",
      "name": "DOCX Summary",
      "description": "Summarize a document already available to the adapter service.",
      "url": "http://127.0.0.1:8787/actions/docx-summary",
      "input_schema": {
        "type": "object",
        "properties": {
          "document_id": { "type": "string" }
        },
        "required": ["document_id"],
        "additionalProperties": false
      }
    }
  ]
}
```

Start AI Chat with:

```bash
AI_CHAT_ACTIONS_ENABLED=1 \
AI_CHAT_ACTION_MANIFEST_PATH=/absolute/path/to/actions.json \
npm run dev
```

## Forward-Looking Executor Checklist

Use this list when adding additional action classes:

1. Define a narrow tool contract with structured arguments, not free-form instructions.
2. Gate the runtime with an explicit environment switch.
3. Scope all access to configured roots or service endpoints.
4. Deny secrets, credentials, private keys, hidden dependency folders, and unrelated user data.
5. Bound input size, output size, execution time, recursion, and number of results.
6. Avoid shell interpolation; pass commands as executable plus args.
7. Use sanitized process environments and avoid forwarding provider/API credentials.
8. Return sanitized labels and opaque ids instead of absolute paths where possible.
9. Add model-facing system rules when the tool is present.
10. Add health metadata so Settings can disable unavailable presets.
11. Add unit and route tests for positive path, blocked path, and metadata.
12. Document the exact opt-in variables and safe test path.

## Current Limitations

- There is no arbitrary MCP or plugin bridge yet. Add each connector as a separate server-side adapter with the checklist above.
- Action adapters are the supported bridge for MCP/plugin/document actions. AI Chat does not broker OAuth, secrets, or plugin credentials; the local adapter service owns those concerns.
- Shell commands are intentionally allowlisted. Add `kujo`, `go` (and any other required executable such as `npm`) to `AI_CHAT_LOCAL_SHELL_ALLOWLIST` only for a trusted workspace.
- The Kujo interpreter is resolved through `KUJO_BIN` (absolute path to the compiled binary) and `AI_SDK_PATH` (directory containing `ai_sdk.kujo` and `providers.kujo`). See `docs/KUJO_EXECUTION_SETUP.md` for build, wiring, and smoke-test steps.
- The tool runtime does not perform interactive command approval prompts yet. Keep write and shell switches off except in workspaces where model-initiated local actions are acceptable.

Planned interactive approvals and native MCP/plugin management are specified as
HR-01 and HR-08 in `docs/HARNESS_PRODUCT_ROADMAP.md`. Those roadmap entries do
not change the current limitations above.

## Read Continuation Contract

Start at `offset=1`, `column=1`. When `truncated=true`, pass the returned `next_offset` and `next_column` unchanged to the next call. `complete=true` means the entire file was returned from its beginning; per-line clamping sets `truncated=true` and returns the exact line/column continuation both at the top level and in `meta.clamped_lines`. Empty files and offsets beyond EOF return notes rather than ambiguous silence. A repeated unchanged window may return a short consume-on-hit dedup note; retrying once returns the content again.

### Deferred capabilities and inexpensive web access

Interactive chat exposes common entry tools immediately and lists other enabled built-ins in a compact capability index. Use `tool_discover` with a listed tool name or category to load its schema, then invoke it in a later tool round. Discovery can only load tools authorized for that request; it does not enable disabled presets, local writes, shell access, browser access, or adapters. API clients can opt in with `tool_discovery:true`.

Start factual research with `web_search`; use returned snippets when they answer the question. Use browser tools for page evidence, JavaScript rendering, or interaction. A failed search can be followed by a browser visit to a known relevant public URL. There is currently no independent direct-fetch tool or automatic alternate search-provider switch. Reuse browser sessions; take screenshots only for visual evidence. Browser contexts explicitly block WebSocket connections as well as downloads and service workers. HTTP URL/DNS policy still applies independently.

Compacted tool results keep the call identity and, when supplied, success/error status and bounded artifact/path/session references. A receipt means the call already ran. Read missing evidence with a focused lookup; do not repeat a write or externally consequential action merely because its earlier output was compacted.

Local writes resolve canonical destination paths, reject dangling links and sensitive aliases, and use a no-follow file descriptor where supported. These controls do not make the host an OS sandbox against a hostile local process swapping ancestor directories. `local_shell`, especially allowed `npm`/Kujo/project scripts, executes trusted project code with host privileges; its executable allowlist is not filesystem or network isolation. Use trusted workspaces and the separate configured opt-ins.

## Static page evidence

Add **Page Reader schema** in Settings → Tools to make `web_fetch` available to requests that select it. It reads HTML or plain text without starting Chromium; `BROWSER_ENABLED=1` is not required. Scheduled runs must select the tool explicitly. API callers can advertise its schema from `/api/health`, subject to the normal per-request execution allowlist.

`web_fetch` accepts an absolute HTTP(S) `url` and optional `max_chars` (256–30,000, default 16,000). It uses the same site allowlist (`BROWSER_ALLOWED_HOSTS`), private-address denial, credential rejection, risky-destination policy, DNS validation, socket pinning, and redirect checks as the browser's HTTP transport. It sends only a read-only GET with bounded public headers; it does not use profile credentials or a browser cookie jar.

The reader accepts HTML and plain text, with a 1 MiB wire and decompressed limit, at most five redirects, a 15-second total deadline, and a 96 KiB final JSON limit. It parses HTML with [parse5](https://github.com/inikulin/parse5), drops script/style/template and explicitly hidden text, and returns readable text, a title, up to 20 HTTP(S) links, the final URL, retrieval time, truncation state, and untrusted-source provenance. It does not execute scripts or fetch subresources. CSS-based visibility and JavaScript-generated content require browser evidence; `rendering.may_be_needed` is a heuristic, not a completeness guarantee. Charset decoding follows the HTTP header, with UTF-8 as the default; unsupported or invalid encodings fail explicitly.

An agent should use available browser tools when static text is missing or the task needs rendering or interaction. The reader never launches a browser automatically. Cancellation and shutdown stop outstanding reads. DNS may finish after cancellation, but its result cannot open a connection for the cancelled request.

## Enforced browser network containment

On macOS, browser execution now requires an executable `sandbox-exec` and Playwright's installed Chromium headless shell. AI Chat launches the browser under a Seatbelt profile denying all network operations, including IP and Unix sockets; descendants inherit the profile. Playwright controls it over inherited pipes. HTTP page resources are fetched by AI Chat's parent process through the checked, DNS-pinned transport, then supplied to Chromium through routing. Direct WebSockets, WebRTC/STUN, or UDP cannot bypass that path. Browser child environment variables are limited to HOME, TMPDIR, PATH, and LANG; provider credentials are not inherited.

Health reports `browser.containment` with `backend: "macos-seatbelt"`, `direct_network: "denied"`, and `filesystem_isolated: false`. This is a process network boundary, not a filesystem sandbox or a guarantee against browser/OS vulnerabilities. It does not claim isolation from every operating-system IPC facility. Keep the browser and OS patched.

On Linux, install `/usr/bin/bwrap` (Bubblewrap) and permit its unprivileged user namespaces. The runtime creates separate network, PID, IPC, UTS, and mount namespaces. Only system libraries/fonts, the headless-shell bundle, and dedicated browser working directories are mounted. It exposes neither the host workspace nor host service sockets. The isolated network namespace cannot reach host or external listeners. Health reports `linux-bubblewrap`, `direct_network: "isolated_namespace"`, and `filesystem_isolated: true`. Playwright pipes cross the boundary through stdin/stdout and are restored inside the namespace. See [Bubblewrap's policy model](https://github.com/containers/bubblewrap/blob/main/README.md).

Unsupported platforms, headed mode, or unavailable enforcement fail closed. Static `web_fetch` remains usable through its independent checked transport. Both backends use the installed Playwright registry to locate the headless shell; incompatible registry changes or a missing executable also fail closed. No setting disables containment. Linux containers must permit the required namespace and proc/device mounts; do not weaken a production host policy merely to make the availability check pass.

For local shell calls, executables must be both allowlisted and on the AI Chat service’s `PATH`. A terminal’s PATH may differ from launchd’s. `KUJO_BIN` configures the app’s bridge; it does not put `kujo` on the local shell PATH. Go source (`.go`) supports bounded file reads and writes. Use `go run file.go` or `go test` through the allowlisted tool; arbitrary generated executables are not automatically allowed.

## Dangerous command modes

Settings → Tools → Local command permissions provides two separate, instance-wide switches, persisted outside ordinary chat/settings synchronization:

- **Dangerously skip command permissions:** bypass the executable allowlist and permit executable paths. Enabling requires typing `ALLOW UNRESTRICTED COMMANDS`.
- **Also allow destructive commands:** additionally remove guards for known deletion/disk commands, forced Git changes, recursive ownership/permission changes, elevation and shell wrappers. Requires the first switch and a separate `ALLOW DESTRUCTIVE COMMANDS` confirmation.

Both default off. Disabling the first also clears the second; re-enabling requires fresh acknowledgement. Changes affect subsequent command dispatches, not already-running processes. Existing server shell opt-in, timeouts, output bounds, sanitized environment and separate file-tool policy remain active. Normal mode now also guards known destructive commands even when their executable is allowlisted.

This is accident prevention, **not a sandbox or a guarantee against destructive behavior**. Kujo, Go, Node, Python, npm, custom programs and scripts can mutate files directly, bypassing command-name checks. Commands execute with the service account's filesystem/network access; a workspace sets the starting directory, not a filesystem jail. Unrestricted mode can expose local files and credentials to executed code. Only use it with tasks and workspaces you trust.

`local_workspace_list` metadata reports the current `command_permissions` and `shell_policy`; the configured `shell_allowlist` is ignored while `skip_allowlist` is true. The model cannot request mode changes via tool arguments.

Go module metadata (`.mod` and `.sum`) is supported alongside `.go`. Creating a
file in a missing directory without `create_dirs=true` returns a recoverable
pre-execution error when open failed before any mutation. Errors after opening or
creating directories still retain conservative side-effect handling.

Tool-enabled streams can continue at most twice after an explicit provider output
limit. Completed tool results stay in the same execution; this is continuation,
not replay of the original user request. Exhaustion is an error, not completion.
Saved-result retrieval resolves prior retrieval receipts back to original evidence;
page offsets address that original JSON result. Compacted retrieval receipts retain
the source reference and page coordinates instead of pointing at nested envelopes.

Context budgeting compacts recoverable history before reducing the requested output
allowance. It lowers the allowance only when protected input still cannot fit.
Exhausting the two output-limit continuations returns `output_continuation_limit`
with `retryable: false`, not a network error. Error events retain attempted tool-call
counts as well as usage, so failed runs remain measurable.
Consecutive compacted receipt groups share a single instruction envelope when
needed to fit context; call identities, result references, pagination coordinates
and ordering are retained. A receipt overflow remains an explicit error when the
remaining protected context genuinely cannot fit.

Compacted receipts retain bounded, deterministic input/outcome details: small tool
results remain verbatim; larger results carry explicit excerpts and journal
references. This lets agents retain runtime versions, paths and command exit
statuses without rereading every result. Under severe context pressure, the
largest optional details are removed first; all call identities and references
remain. Excerpts are untrusted data, not new instructions or complete documents.

A tool-enabled provider turn that explicitly stops without final answer text gets
at most two same-execution continuations. Earlier progress messages do not make an
empty terminal turn a completed answer. If the provider remains empty, the runtime
returns `empty_final_response` with `retryable: false`; completed tools and partial
files remain in the journal and are not automatically replayed.
Identical successful saved-result pages can share an outcome in compacted context;
`read_call_ids` retains their retrieval IDs. Source, offset and next_offset must
match. Shell commands, file writes, live reads, failures and different pages are
never folded together. The journal retains the complete chronological history.

Within an active execution, OpenAI-compatible assistant `reasoning` and
`reasoning_content` string fields are replayed under their original field names
for tool, empty-final and output-limit continuation; pending-call checkpoints
retain them for resume. Native Ollama continues to use `thinking`. They are never
converted into visible answer text. Whole-context bounds still apply. This does
not claim lossless unbounded history or support for arbitrary provider-specific
encrypted reasoning formats.

Every page in a newly retrieved batch is retained for the next provider turn.
Unrelated oversized tool results in that batch can still compact into bounded
outcomes with journal references; a retrieval call does not exempt sibling shell
output from the context budget. Repeated unchanged local file reads immediately
return their bounded content instead of requiring a second call after an empty
"already read" notice. Read-before-write and stale-write checks still apply.

Compacted context labels retained facts as available evidence. Legacy checkpoint
receipt envelopes are migrated on read. Complete saved-result pages reattach
bounded facts to the original action, recording the retrieval IDs there; this
avoids repeatedly copying the same command result into unrelated receipt rows.
Partial pages, failures, mismatched sources and ambiguous identities stay separate.
Obsolete standalone reasoning is retired before observed outcomes, while the current
assistant/tool protocol remains intact. Long command excerpts retain both the start
and final summary with explicit omission markers. Native receipts use durable journal
IDs rather than per-round tool indices. None of this reexecutes a completed action
or changes journal retention, context limits, output limits or permission checks.

Context compaction shares identical historical file-read snapshots, preserving all
read receipt IDs. It never skips a requested live read. Old read excerpts are
retired ahead of recent execution results; complete evidence stays in the journal.

Shell results expose `duration_ms`, a monotonic elapsed measurement from spawn
through process close, including startup and output collection. It is not CPU time
or an internal algorithm timing. Completed timeout receipts retain this measurement
and `cwd` alongside partial output. Use it to distinguish compilation from execution.

For a known model, configure its verified context limit instead of relying on the
65,536 conservative fallback. `MODEL_CONTEXT_LIMITS_JSON` keys use the profile's
provider ID, not the downstream transport name. For example, a Watchdog profile
routing Ollama Cloud uses `watchdog:<exact-model-id>`. Preserve existing overrides
and metadata when adding a key, then restart AI Chat. Verify
`context_budget.context_policy_source` and `context_window_tokens` on an execution.
Only use limits verified for the actual serving route. A local model's advertised
maximum may differ from its allocated context. Do not apply one vendor's window
to all providers. The byte-based estimator remains conservative; raising a verified
window can retain more context and increase request cost.

`local_shell.args` contains arguments only, excluding the executable. Each of at
most 40 arguments is limited to 1,000 UTF-16 code units and cannot contain NUL.
Oversized arguments fail before execution, with a hint to write a script file.
Arguments are never silently shortened. Empty arguments and whitespace are valid.

After a clipped response, AI Chat may ask for one completion review when an agent
that already used tools stops with text but makes no further tool progress. Finish
remaining work, give a concise verified result, or identify the blocker. Completed
commands are not replayed automatically. A successful response is still subject
to ordinary artifact and test verification.

## Engineering quality guidance

The provider-neutral streaming tool loop includes a compact engineering workflow
when the request authorizes `local_file_write` or `local_shell`. It covers scoped
acceptance criteria, unfamiliar-language documentation, risk-driven tests,
numeric boundaries, structured-input handling, persistence failures, cleanup,
and final-source verification. Completion claims should name checks and remaining
limitations. This is model guidance, not a production-readiness certification or
an automatic artifact validator.

Guidance is selected from the full authorized request catalog, including deferred
tools. Deferred schemas still require `tool_discover` before execution; no new
permissions are granted. Read-only and research catalogs omit this workflow.
The guidance adds no provider calls, retries, or timeouts. Native Codex's separate
harness and the non-tool JSON route are unchanged. Existing durable executions
resume their saved instructions; start a new execution to evaluate this change.

## Independent engineering review (experimental)

Set `ENGINEERING_REVIEW_ENABLED=1` and restart AI Chat to enable an additional
quality check for new provider-neutral streaming executions. It is off by default
so enabling it is an explicit latency/usage choice. The local deployment may opt in
without changing any provider profiles. `/api/health` reports the flag and limits.
Native Codex and the non-streaming JSON route retain their existing workflows.

After an execution has actually written a local file or run a shell command and
produces a completion candidate, AI Chat starts a fresh review context on the same
selected model/provider. Merely advertising engineering tools, loading a deferred
schema, or asking a read-only question does not start a review. The reviewer gets
the original request context, system constraints, candidate summary, file paths,
and references to saved execution receipts. It does not get the worker's current
reasoning history. It can inspect authorized local files and saved results, but
cannot discover tools, execute commands, write, browse, or call action adapters.
Authorization enforces this restriction even if the model asks otherwise.

The reviewer checks source and evidence against the task's requirements and
relevant failure invariants. Its review-only `engineering_review_submit` control
returns `pass`, `revise`, or `inconclusive`.
A malformed verdict, a mixed submission/tool batch, or a pass without valid
references to evidence actually read is inconclusive. The verdict control cannot
execute work and is unavailable to the worker. A bare JSON verdict is accepted
for compatibility; arbitrary prose is never heuristically parsed as a pass.
A pass is advisory; it does not certify production readiness or prove test coverage.
The model may still miss defects. A review has at most four provider rounds,
including tool reads. Findings can return to the original worker for at most two
repair passes, each limited to twelve provider rounds, followed by another review
(at most three reviews total). Repairs retain the original scope and tool
permissions. Instructions require focused regression checks, final-source
verification and fixture cleanup; the harness does not invent or automatically
execute a test command.

A five-minute shared review/repair budget starts at the first review. Remaining
seconds and rounds are shown to the model. The deadline is checked **between**
rounds; it does not forcibly terminate an in-flight tool/provider operation.
Existing operation timeouts, user cancellation and global call/round limits still
apply. Budget exhaustion returns to a tools-free final summary and is explicitly
reported as incomplete. The review budget does not communicate an external
benchmark runner's deadline to the initial implementation phase.

Review phase, budgets and original worker context are encrypted in the execution
checkpoint. Explicit resume retains them and uses existing tool receipts instead
of replaying writes. Existing checkpoints created before the feature keep their
original workflow. Every review and repair model call uses the normal usage,
context, trace and cancellation path. Review streaming text/thinking is preserved
in separate `review` events and terminal fields, not mixed into the answer. The UI
shows phase changes and retains the detailed journal for inspection. The final
answer always discloses an inconclusive/unresolved review, even if the worker omits
that limitation.

This is a quality intervention awaiting fresh live comparative benchmarks. It does
not change the grades or acceptance results in earlier benchmark reports.

JavaScript workspace modules with `.js`, `.cjs`, and `.mjs` extensions are supported
by the bounded file listing, reading and writing tools. The same workspace,
sensitive-path, symlink, size and overwrite safeguards apply to each extension.
