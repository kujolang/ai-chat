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
- Shell commands are intentionally allowlisted. `kujo` is now allowlisted for the trusted workspace so Kujo programs can be executed through `local_shell`; add `kujo` (and any other required executable such as `npm`) to `AI_CHAT_LOCAL_SHELL_ALLOWLIST` only for a trusted workspace.
- The Kujo interpreter is resolved through `KUJO_BIN` (absolute path to the compiled binary) and `AI_SDK_PATH` (directory containing `ai_sdk.kujo` and `providers.kujo`). See `docs/KUJO_EXECUTION_SETUP.md` for build, wiring, and smoke-test steps.
- The tool runtime does not perform interactive command approval prompts yet. Keep write and shell switches off except in workspaces where model-initiated local actions are acceptable.

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
