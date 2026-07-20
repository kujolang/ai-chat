# Local Agent Capabilities

AI Chat exposes local power through explicit provider-neutral tool contracts. Skill files remain read-only context; local actions are separate capabilities that must be enabled and configured by the server owner.

## Capability Map

| Area | Tool contracts | Default | Purpose | Security boundary |
| --- | --- | --- | --- | --- |
| Skills | `skill_list`, `skill_read`, `skill_file_read` | Enabled | Read installed `SKILL.md` manuals and referenced text files | Read-only, bounded, scoped to configured skill roots |
| Workspace files | `local_workspace_list`, `local_file_list`, `local_file_read` | Disabled | Inspect configured workspaces | Read-only, bounded, sensitive-name denylist, no absolute paths returned |
| Workspace writes | `local_file_write` | Disabled | Create/overwrite/append bounded text files | Requires `AI_CHAT_LOCAL_WRITE_ENABLED=1`, configured workspace root, known text extensions |
| Shell | `local_shell` | Disabled | Run allowlisted local commands | Requires `AI_CHAT_LOCAL_SHELL_ENABLED=1`, no shell interpolation, args array only, sanitized environment, timeout/output limits |
| Browser | `browser_open`, `browser_snapshot`, `browser_act`, `browser_close` | Disabled | Inspect public web pages | Existing Playwright isolation and approval policy |
| Web search | `web_search` | Enabled when backend credentials/config exist | Search external web | Existing backend policy and cache controls |

## Recommended Test Configuration

Use a throwaway workspace first:

```bash
mkdir -p /tmp/ai-chat-local-tools
printf 'hello\n' > /tmp/ai-chat-local-tools/example.md

AI_CHAT_LOCAL_TOOLS_ENABLED=1 \
AI_CHAT_LOCAL_WORKSPACE_ROOTS=/tmp/ai-chat-local-tools \
AI_CHAT_LOCAL_WRITE_ENABLED=1 \
AI_CHAT_LOCAL_SHELL_ENABLED=1 \
AI_CHAT_LOCAL_SHELL_ALLOWLIST=git,rg,ls,pwd \
ENCRYPTION_SECRET=replace_with_strong_secret \
API_AUTH_TOKEN=replace_with_strong_token \
npm run dev
```

Then open Settings > Tools and add Skill Tool Presets plus Local Tool Presets.

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
- Shell commands are intentionally allowlisted. If a skill requires `npm`, `kujo`, or another executable, add that command to `AI_CHAT_LOCAL_SHELL_ALLOWLIST` only for a trusted workspace.
- The tool runtime does not perform interactive command approval prompts yet. Keep write and shell switches off except in workspaces where model-initiated local actions are acceptable.
