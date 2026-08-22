# Kujo Execution Setup

This guide documents how to make the Kujo programming language tooling ecosystem — skills, workflows, and agents — executable from inside AI Chat, not merely readable.

## What this enables

- The AI Chat chat bridge (`bridge_chat.kujo`) runs through the Kujo interpreter for provider-gated chat completion.
- The model can run Kujo programs (`kujo run`, `kujo test`, `kujo check`, etc.) through the `local_shell` tool once `kujo` is allowlisted for a trusted workspace.
- Kujo workflow skills (`kujo-*-workflows`) that shell out to the interpreter become executable rather than read-only.

## Prerequisites

- A compiled Kujo binary. Two copies exist on this machine:

  | Path | Version | Built |
  | --- | --- | --- |
  | `/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo` | 1.0.2 | 2026-08-12 (from `Cargo.toml` `version = "1.0.2"`) |
  | `/Users/robertdevore/.local/bin/kujo` | 1.0.0 | 2026-08-08 (initial public release; stale) |

  Prefer the `target/release/kujo` binary (1.0.2). The `~/.local/bin/kujo` copy is the older 1.0.0 release.

- The AI SDK source directory containing both `ai_sdk.kujo` and `providers.kujo`:

  `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-sdk/src`

- Node.js 22.17.0 and npm 9+ (for `npm run dev`).

## Build steps (only if no binary exists)

The interpreter is Rust. Build a release binary from the `kujo` repo:

```bash
cd /Users/robertdevore/2026/Kujolang/kujo-repos/kujo
cargo build --release
```

Resulting binary:

```
/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo
```

A compiled binary already exists at that path (19,982,172 bytes, executable), so a rebuild is not required.

## Environment variables

| Variable | Purpose | Value for this machine |
| --- | --- | --- |
| `KUJO_BIN` | Absolute path to the Kujo interpreter binary | `/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo` |
| `AI_SDK_PATH` | Directory containing `ai_sdk.kujo` and `providers.kujo` | `/Users/robertdevore/2026/Kujolang/kujo-repos/ai-sdk/src` |
| `AI_CHAT_LOCAL_SHELL_ALLOWLIST` | Comma-separated allowlist of shell commands | `git,rg,ls,pwd,npm,kujo` |
| `AI_CHAT_LOCAL_SHELL_ENABLED` | Enable shell execution | `1` |
| `AI_CHAT_LOCAL_TOOLS_ENABLED` | Enable local tools | `1` |
| `AI_CHAT_LOCAL_WORKSPACE_ROOTS` | Trusted workspace roots | `/Users/robertdevore/2026` |

Where these are read in code:

- `AI_CHAT_LOCAL_SHELL_ALLOWLIST` — `lib/local-runtime.js` (line 45; default `["git","rg","ls","pwd"]` at line 16).
- `KUJO_BIN` — `lib/server-runtime.js` (line 113; default `"kujo"` at line 112).
- `AI_SDK_PATH` — `lib/server-runtime.js` (line 120; must contain `ai_sdk.kujo` and `providers.kujo`, checked at lines 121-128).

The chat bridge is invoked as:

```
kujo run bridge_chat.kujo --interpreter -- --payload '<json>'
```

with the working directory set to `AI_SDK_PATH` so `from providers import ...` and `from ai_sdk import ...` resolve.

## Smoke test

A minimal hello-world program:

```kujo
print("hello from kujo")
```

Run it with the interpreter:

```bash
KUJO_BIN=/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo
"$KUJO_BIN" run /tmp/hello.kujo --interpreter
```

Expected output:

```
hello from kujo
```

The full bridge smoke test (offline fixture path, no provider key required):

```bash
"$KUJO_BIN" run bridge_chat.kujo --interpreter -- --payload '{"provider_id":"openai","messages":[{"role":"user","content":"hi"}],"offline_fixture":true}'
```

run from `AI_SDK_PATH`.

## Troubleshooting

- `local_shell_command_blocked` — `kujo` is not in `AI_CHAT_LOCAL_SHELL_ALLOWLIST`. Add `kujo` and restart AI Chat. The allowlist is read once at server startup.
- `sdk_not_configured` / "AI SDK not found" — `AI_SDK_PATH` does not contain both `ai_sdk.kujo` and `providers.kujo`. Point it at `.../ai-sdk/src`.
- `kujo: command not found` — `KUJO_BIN` is unset or not absolute. Set it to the compiled binary path.
- Stale binary — `~/.local/bin/kujo` is v1.0.0; use `target/release/kujo` (v1.0.2) for current behavior.

## Security notes

- The shell allowlist is intentionally narrow. Add `kujo` only for a trusted workspace; do not add it to the default allowlist in `lib/local-runtime.js`.
- `local_shell` runs commands with a sanitized environment (only `PATH`, `HOME`, `LANG`, `LC_ALL`, `TERM`, `CI`), no shell interpolation, an args array, and timeout/output bounds. `KUJO_BIN` and `AI_SDK_PATH` are read by the server runtime, not forwarded into the shell environment.
- `.env.example` is protected by the sensitive-name denylist and cannot be edited by local tools; the server owner must set these variables directly.
