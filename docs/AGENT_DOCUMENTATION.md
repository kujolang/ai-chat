# AI Chat documentation index

Use this index for questions about AI Chat. Read the relevant manual before answering or changing the app. Unrelated tasks do not require reading these manuals.

Paths below are relative to the AI Chat repository. Discover the workspace through the advertised local tools; do not assume the current project is AI Chat. If read tools are listed as deferred, load them through `tool_discover`. Follow local read continuation coordinates when output is truncated.

| Task | Start here | Implementation reference when needed |
| --- | --- | --- |
| Understand the app or provider choices | `README.md` | `lib/server-runtime.js` |
| Install, configure providers, or schedule automations | `SETUP_AND_INSTALL.md`, `.env.example` | `server.js`, `lib/server-runtime.js` |
| Understand tools, skills, permissions, or browser access | `docs/LOCAL_AGENT_CAPABILITIES.md` | `lib/tool-runtime.js` |
| Integrate an API client or diagnose streaming | `docs/API_CONTRACT.md` | `lib/server-runtime.js`, `public/app.js` |
| Set up or troubleshoot Kujo execution | `docs/KUJO_EXECUTION_SETUP.md` | `bridge_chat.kujo` |
| Diagnose invalid tool arguments | `docs/TOOL_CALL_REPAIR.md` | `lib/tool-runtime.js` |
| Change agent instructions | `SYSTEM_PROMPT.md`, `SETUP_AND_INSTALL.md` | `lib/server-runtime.js` |
| Change repository code or examples | `AGENTS.md`, relevant manual above | `bridge_chat.kujo`, relevant source and tests |

Read only the task-relevant manuals and their required references. Read applicable contributor instructions completely. Tests provide contract evidence; they are not the canonical teaching examples.

Documentation describes supported behavior. Advertised tools, configured permissions, and observed results determine what this request can actually do. A skill cannot grant access to repository files outside its skill folder. See [documentation access setup](../SETUP_AND_INSTALL.md#ai-chat-documentation-access) when manuals are unavailable.

Use `.env.example` for configuration names and placeholders. Setup questions do not require reading real secrets. Cite the manual path or section supporting an app-specific answer. If implementation or observed behavior differs, report that discrepancy explicitly. Reports and roadmaps describe evidence at a point in time or planned work; verify them before presenting a feature as shipped.

The server reads `SYSTEM_PROMPT.md` at startup. Restart it after changing the prompt. Editing this index alone changes what an agent reads next; it does not add tools, change permissions, or enforce model compliance.

## Manual routing checks

After restarting, use a profile with the local read tools enabled:

| Request | Expected behavior |
| --- | --- |
| Which permissions do AI Chat tools need? | Read the capability manual; distinguish support from current access. |
| How do I configure a provider? | Consult setup and `.env.example`; do not request real credentials. |
| How does the streaming API finish a response? | Consult the API contract and cite the relevant section. |
| Write a short invitation. | Complete the writing task without reading AI Chat manuals. |
| An app question with local read tools unavailable | Identify the inaccessible source and any uncertainty; do not invent a read. |

These are behavioral checks for the selected model, not guarantees enforced by the prompt.
