# ChatGPT plan connection (local preview)

AI Chat supports the public open-source Sign in with ChatGPT flow documented on September 29, 2026. It connects a provider behind existing App Access authentication. It does not replace App Access, create multiple AI Chat users, or grant new filesystem permissions.

## Connect

1. Use Node 22.17 or a newer Node 22 release. Install dependencies with `npm install`.
2. Set `CHATGPT_SIGN_IN_ENABLED=1`, `AI_CHAT_HOST=127.0.0.1`, `TRUST_PROXY=0`, your existing `API_AUTH_TOKEN`, and a strong `ENCRYPTION_SECRET` of at least 24 characters. Restart AI Chat. Do not change an existing encryption secret: saved API keys also depend on it.
3. Open AI Chat on the same computer as the server. In **Settings → Providers**, choose **Continue with ChatGPT**. The system browser returns to a temporary `127.0.0.1` callback listener.
4. Review OpenAI's consent screen. Eligible Plus/Pro accounts can authorize plan usage; a verified identity alone cannot perform inference. Dismiss the one-time plan notice.
5. Choose **Use for chat / refresh models** to create a separately named ChatGPT profile using that account's current model catalog. Select that profile in a chat. Existing API-key and Codex profiles keep their existing authentication.

No manually registered client, client secret or partner key is needed for this local OSS flow. Commercial hosted integration needs separate OpenAI approval. Remote/VM callback forwarding is not implemented in this release. Do not expose the local connection routes through a reverse proxy.

## Troubleshooting the connection panel

If Settings shows `Unexpected token '<'` or says the connection endpoint returned a page, the browser received HTML instead of the connection API response. An older still-running server can serve newly updated frontend files without having loaded the new API routes. Stop that AI Chat process, start it again from the updated checkout with `npm start`, and reload the browser. Verify the URL points to that process, rather than a static-file server or proxy. Enabling the setting requires a server restart; refreshing the browser alone is insufficient. Keep the existing encryption secret and database path.

## What runs

The new `openai_chatgpt_plan` provider sends text history and explicitly enabled neutral function tools to the fixed public `https://api.openai.com/v1/responses` endpoint. Every request streams with `store:false`. A JSON auxiliary request is collected from that same stream. No Kujo SDK change is required for this provider.

Temperature, maximum output-token settings, transcription, hosted MCP, image generation, file uploads and other unsupported preview features are not sent. Input-context reservation still uses the app's context budget; it is not an upstream output limit. This first release accepts text inputs. A model-list entry or granted scope is not a guarantee of admission: OpenAI still enforces plan, account, workspace and usage limits.

AI Chat owns the tool loop, authorization, budgets, cancellation and durable receipts. Tools are namespaced as `ai_chat`. Complete raw Responses output items, including opaque encrypted reasoning, remain in the encrypted execution checkpoint across tool rounds and interrupted-run recovery. Ordinary later user turns use the saved visible transcript, as other AI Chat providers do. ChatGPT's server-side conversation history is not imported or used.

Only `response.completed` is success. A late limit error, incomplete response, malformed event or premature EOF preserves already streamed output and cannot start pending tools. No request silently falls back to an API key, another account, or paid API billing. Change profiles explicitly if you want another provider.

## Accounts and storage

Each profile contains a `connection_id`, not OAuth tokens. Once bound, its account cannot be changed in place; create another profile for a different account. Execution records snapshot connection ID, sign-in epoch, plan billing and the AI Chat harness. An interrupted execution cannot resume after account replacement or reconnection. Completed execution replay remains read-only.

Credentials are encrypted with purpose-separated AES-256-GCM under `~/.config/ai-chat/credentials/connections.db` (directory `0700`, file `0600`). `CHATGPT_CREDENTIAL_DIR` overrides the **parent** directory; `credentials/` is always appended. Symlinked paths are rejected. Preserve the original encryption secret and stable host record. The credential store is outside application-state exports and normal database backups. Browser storage, public status, audit logs, model requests saved in the execution journal, and Kujo child environments do not receive OAuth bearer/refresh/ID tokens.

Only one AI Chat process may own a credential directory. Refresh is serialized per connection and atomically rotates all token fields. Renewal happens when the documented access-token expiry is reached, rather than guessing the undocumented scheduling semantics of `earliest_refresh_at`. A crash after upstream rotation but before local persistence may require reconnecting; the app never replays a model request or tool to hide that failure.

Disconnect cancels tracked requests, attempts remote refresh-token revocation and clears local tokens even if OpenAI cannot confirm revocation. Follow the displayed ChatGPT settings link when remote revocation is unconfirmed. The issued registration and host mapping remain for safe reconnection. Native Codex logout and AI Chat App Access logout are separate operations. No native Codex tokens are read or reused by this provider.

The existing native `codex exec` profile remains available through `codex login`. The optional App Server harness described in the research plan is not part of this increment: interactive approvals, pane-thread continuation and SIWC-backed Codex children still require the separately pinned protocol/harness work.

## Verification and rollout

Synthetic RSA/JWKS OAuth tests, transport tests, HTTP route/tool/journal tests and Playwright connection-UI tests use isolated stores and mocked upstream services. They do not authenticate a real account or spend subscription allowance. Run:

```sh
node --test tests/chatgpt-oauth.test.js tests/chatgpt-responses.test.js tests/chatgpt-routes.test.js tests/chatgpt-ui.test.js
npm test
```

Before relying on this preview with a real account, explicitly complete the connection steps above, refresh its models, send a short text request, exercise one allowed read-only tool, and disconnect. Verify the usage in ChatGPT settings. Live account/region admission and token renewal against production remain unverified by fixture tests. Do not paste tokens or callback URLs into bug reports.

## Source contract

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)
- [Function namespaces](https://developers.openai.com/api/docs/guides/tools)
- [Stateless reasoning continuity](https://developers.openai.com/api/docs/guides/reasoning)
- [Research and optional harness plan](research/openai-chatgpt-auth-integration.md)

The sign-in button uses the [official white ChatGPT mark](https://developers.openai.com/assets/siwc/sign-in-buttons/chatgpt-logo-white.svg) distributed with the website sign-in guidelines; keep the asset and button label unchanged.
