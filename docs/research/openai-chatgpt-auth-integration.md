# ChatGPT authentication and subscription integration for AI Chat

Research date: **2026-09-29** (America/Detroit). Repository baseline: `2209a410dc26c6576882b02030d0def29d964d93`, `main`, AI Chat 1.2.0. Research and proposed design only; no runtime changes or authentication attempts. Source identifiers resolve in [the evidence trail](openai-chatgpt-auth-sources.md). Availability is documentation-verified, not an assertion that a particular account has passed live admission.

## 1. Executive Summary

**AI Chat can build Continue with ChatGPT now as an open-source, locally hosted client, using the public preview dynamic-registration flow.** Eligible Plus/Pro users can separately authorize subscription-backed Responses requests. This is no longer merely a partner-only inference concept. AI Chat's MIT license and local architecture match the documented OSS route; selling or operating a hosted service requires a separate access review. [S2, S4]

**Codex already works through the user's existing local Codex login in this repository.** A richer App Server integration can add genuine incremental output, interactive approvals and persistent pane threads. The new ChatGPT-plan OAuth grant also has an explicitly documented App Server configuration. These are two separate credential lifecycles. [S8, S13–S16]

Keep four boundaries: application access/identity → authorized capability and billing source → model transport → tool-owning harness. Keep OpenAI API keys as an independent option. A ChatGPT login must never silently select subscription billing, authorize local shell access, switch an interrupted thread's account, or make an arbitrary API endpoint eligible.

Build now: local account connection, explicit plan consent, restricted Responses adapter, account-specific model catalog, existing neutral tool execution, and optional App Server harness. Defer commercial website login until approved; defer unsupported hosted tools, subscription transcription, and claims about unavailable plan/usage metadata.

## 2. What OpenAI Announced

The [September 29 release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) separately announce third-party identity sign-in and eligible Plus/Pro allowance use. Identity rollout also appears under July 29, so September 29 is not evidence that the identity concept first appeared today. The commercial interest form calls this a DevDay launch. [S1, S18]

Today's fetched Help Center pages show updates within hours; indexed search snippets were older and omitted the OSS pathway. The fetched quickstart and dedicated OSS guides establish the current contract. Their exact original publication timestamps are not exposed: do not equate “crawled today” with “published today.” [S2–S12, S17]

### Existing implementations and legitimate patterns

| Product | Verified category today | Implementation evidence and lesson |
|---|---|---|
| Devin, Amp, Warp | Listed for ChatGPT plan usage | OpenAI directory confirms participation, not their private OAuth contracts. Amp's own documentation separates linked ChatGPT billing from Amp credits. No reusable commercial client credentials or approved integration contract established for AI Chat. |
| Vercel, Notion | Listed for plan usage | Earlier identity-only announcement is not the full current capability; use the current directory. |
| Supabase, GitLab, Airtable, HubSpot, Canva | Listed as sign-in only | Their appearance does not establish subscription inference access. No evidence that Supabase's participation makes ChatGPT a self-service identity provider for every Supabase customer. |
| OpenClaw, OpenCode, Pi, T3 | Listed OSS integrations | Public OSS pathway is the relevant precedent for local AI Chat. |
| Conductor, Dactyl, Hermes Agent, Hyperagent, Kilo Code, Vorflux | Listed for plan usage | Partner availability is product-specific; Lovable is explicitly coming soon. |

Directory: [S19]. OpenClaw source inspection at `b2499810c7dfaba60b44ebd927195273a6316920` found separate auth, refresh, provider and bounded SSE modules. The inspected authorization module still uses a fixed first-party-looking client registration and an older endpoint/scopes; that is **not** the newly documented dynamic registration. Adopt separation of responsibilities and adversarial stream tests, not its auth constants, private routes or inferred token claims. The directory and source snapshot describe different levels of integration; source presence alone is not authorization. [S23–S26]

OpenAI's public Codex SDK/App Server sources are a better harness reference. Partner login pages and targeted searches did not establish additional supported public integration specifications for Devin/Warp/Vercel/Supabase/GitLab. This is a research limit, not a claim that no private implementation exists. [S15, S16, S22]

## 3. Sign in with ChatGPT

Two registrations exist: provisioned website clients (commercial limited trial), and dynamically issued OSS clients. Both supply verified identity; neither supplies an AI Chat authorization policy. [S2, S3, S5]

Production discovery: `https://auth.openai.com/.well-known/openid-configuration`. Observed issuer `https://auth.openai.com`; authorization `/api/accounts/authorize`; token `/api/accounts/oauth/token`; JWKS `/.well-known/jwks.json`; revocation `/api/accounts/oauth/revoke`. Use discovered endpoints restricted to the trusted issuer. Identity scopes are `openid profile email`. Verify signature, issuer, audience, expiration and nonce; use `(issuer, client_id, sub)` as the external key. Name/email/picture can be absent. An email match must not link accounts automatically. [S3, S21]

Website identity-only contract requires an ID token, not access/refresh tokens. Its session is AI Chat's own; logout ends that local session. Public clients have no secret; provisioned confidential clients use their assigned authentication method, with the website guide demonstrating `client_secret_basic`. No generic identity refresh contract should be invented. [S3]

The local OSS connection requests additional scopes and retains tokens as described below. Do not turn an arbitrary successful ChatGPT sign-in into access to this installation's existing shared chats or filesystem. Initial rollout connects a provider **after existing App Access authentication**; replacing App Access is separate work.

## 4. ChatGPT Subscription Entitlements

Explicit inference permission is `chatgpt.tokens.use.direct`, alongside `resource.invoke` and `offline_access`. Resource is `https://api.openai.com/v1`. The OSS flow needs no client secret or partner API key. Check granted scopes, then upstream admission; a valid identity or model-list entry alone does not guarantee execution. [S5, S7]

| ChatGPT plan | Identity in supported integration | New third-party plan sharing | Native Codex login |
|---|---|---|---|
| Free | Yes, subject to policy | Not documented as eligible | Included, limits apply |
| Go | Yes, subject to policy | Not documented as eligible | Included, limits apply |
| Plus | Yes | Eligible, consent/policy/limits apply | Included |
| Pro | Yes | Eligible, consent/policy/limits apply | Included |
| Business | Yes, admin policy | Not supported by published Plus/Pro eligibility | Included, workspace controls |
| Enterprise | Yes, admin policy | Not supported by published Plus/Pro eligibility | Included, workspace controls |
| Edu | Yes, subject to policy | Not supported by published Plus/Pro eligibility | Included, workspace controls |

Evidence: [S2, S17, S14]. “All users can connect OSS tools” describes connection, not a promise of inference for every plan. Native Codex's broader plan eligibility does not expand the new direct sharing route.

Usage draws from the existing Work/Codex allowance, with app-specific caps. Credits require separate opt-in; connecting adds no allowance. AI Chat should link to usage settings rather than estimate remaining subscription capacity from its token ledger. The documented SIWC token fields do not supply a supported plan name, credit balance or remaining quota API. Display unknown rather than decoding opaque auth metadata. Native Codex `account/read` is a different source and must remain labeled accordingly. [S6, S10, S17]

## 5. Codex Integration

| Interface | Fit for AI Chat | Boundary |
|---|---|---|
| Existing `codex exec --json` | Already implemented; local coding and resume | Native login, configuration, tools and storage owned by Codex. |
| TypeScript `@openai/codex-sdk` | Server-side automation; start/continue/resume threads and streamed runs | Optional wrapper, not a subscription entitlement service. |
| App Server over stdio | Best fit for interactive harness integration | Bidirectional RPC, approvals, thread lifecycle, incremental agent events. Treat integration as preview; avoid experimental network transport. |
| App Server with SIWC custom Responses provider | Same harness with AI Chat-owned plan grant | App owns refresh; native account metadata cannot be assumed to describe that grant. |
| Codex Cloud / removed `codex mcp-server` | Not the proposed adapter | Local App Server is not a cloud task API; current SDK docs say MCP-server command was removed. |

[S8, S13, S15, S16, S22]

Native Codex authentication has its own browser login and beta device-code option; Codex renews its own session. Leave that credential store to Codex. Do not read `auth.json` to repurpose credentials for HTTP calls. [S13]

App Server provides thread start/resume/read/list/fork, turn start/interrupt, output deltas, command/file/MCP events, approval requests and diff updates. Bind RPC requests, approvals and persisted native thread IDs to a connection and pane. Use generated schemas for a pinned version. `account/read`, `account/logout`, `account/rateLimits/read` support native account lifecycle; external-token login is experimental and **not** the documented SIWC custom-provider recipe. [S15]

For SIWC, start a separate stdio child configured with `model_provider="openai_chatgpt_plan"`, base `https://api.openai.com/v1`, `wire_api="responses"`, `env_key="ACCESS_TOKEN"`, `requires_openai_auth=false`, `supports_websockets=false`. Inject only the selected access token into that child. Initialize with AI Chat's stable name/title/version. Save thread ID; renew and restart at a safe boundary, then `thread/resume`. Never replay a possibly executed tool automatically. [S8]

Local shell/MCP and child-agent execution can work via harness function/custom calls even though hosted Responses MCP and native computer use are disallowed. Do not enable features that emit unsupported `tool_search`. [S12]

## 6. Traditional OpenAI API

Platform API keys authenticate API project usage billed separately from ChatGPT. AI Chat already accepts these keys. A user can use the same human account for both products without merging balances. The newly documented OAuth-backed Responses route is a specific authorized exception for eligible requests, not conversion of a subscription into API credits. [S20, S27]

Keep `provider_id=openai` for existing API-key traffic. Add `openai_chatgpt_plan` for restricted OAuth Responses. Native `codex` remains a harness selection backed by native Codex authentication unless explicitly configured otherwise. Never place an ID token in `api_key` or route a plan grant through `/chat/completions` or transcription.

## 7. Availability Matrix

“GA” below means ordinary developer access, not an SLA certification. Preview capabilities have narrower production guarantees.

| Capability | Classification | Evidence / constraint |
|---|---|---|
| OSS local SIWC dynamic registration and optional Responses inference | **Preview/Beta** | Public quickstart + registration + preview limitations [S2, S5, S12]; no partner key. |
| Commercial website identity OIDC | **Partner/Approval Required** | Provisioned client, limited trial [S3, S18]. |
| Paid/hosted commercial subscription sharing | **Partner/Approval Required** | OSS overview directs these apps to interest form [S4]. |
| Native Codex CLI and SDK integration | **GA** for ordinary developer access | Official automation and SDK interfaces [S13, S16, S22]. Device-code login is beta. |
| App Server local integration | **Preview/Beta** (conservative) | Public stable RPC subset exists, but page also calls command/WS experimental and not production-supported [S15]. |
| App Server SIWC provider | **Preview/Beta** | Explicit recipe inherits sharing restrictions [S8, S12]. |
| App Server external auth tokens / dynamic tools | **Preview/Beta** | Experimental capability gates [S15]. Not needed initially. |
| Normal API key integration | **GA** | Public quickstart and separate API billing [S20, S27]. |
| Plan-backed Chat Completions, transcription, Files uploads, hosted MCP, image-generation tool | **Unsupported in this flow** | Restricted route contract [S11, S12]. |
| Arbitrary hosted service self-registering through OSS to avoid approval | **Unsupported** | Distinct distribution scopes [S3, S4]. |
| ChatGPT conversation/memory import from SIWC | **Unsupported by SIWC** | No such permission [S17]. |
| Lovable plan integration | **Announced but Not Public** in directory | Coming soon [S19]; not evidence of an AI Chat dependency. |

## 8. AI Chat Current Architecture

Implementation read, not inferred from filenames. Locations are baseline line anchors; function names remain the durable reference.

| System | Actual code and behavior | Natural integration point |
|---|---|---|
| Bootstrap / boundaries | `server.js:1` loads local env; Express runtime serves static `public/` and authenticated `/api`. `public/app.js` uses fetch and SSE. | Keep OAuth/backend transport in Node. |
| App access / user | `lib/server-runtime.js:429` checks host/origin and shared token; `:587` schema has profiles/chats/panes/messages and singleton settings, **no users or ownership**. `user_name` is personalization. | Provider connection first; no automatic multiuser account creation. |
| Browser session | `public/app.js:7995` stores App Access token and client expiry in localStorage; `apiFetch` sends it. No server session rotation or identity binding. | New one-time login transaction separate from this token. |
| Provider profiles | `buildProviderCatalog`, `defaultProfiles`, `profileById`, `providerConfig`, `chatRequestPayload` in runtime | Add credential reference, billing mode and transport capabilities; preserve existing profile IDs. |
| Keys / secrets | Runtime `:349`, `encryptValue`/`decryptValue` use scrypt-derived AES-256-GCM; encrypted key columns. Managed proxies use server file/env secrets. Browser clears saved key inputs/cache. | Dedicated rotating-token store; never overload profile key fields. |
| OpenAI / Kujo | `bridge_chat.kujo` imports external `AI_SDK_PATH` providers/client; JSON chat passes credentials in child env. Streaming HTTP path in `handleChatStream` implements provider loops itself. | New Responses adapter; no required external Kujo SDK change. |
| Model selection | Catalog suggestions + editable profile models; `public/app.js` model selectors; Codex model cache loader | Account-specific models endpoint for new route, invalidate on account switch. Cache is not entitlement. |
| Streaming | Runtime `handleChatStream`, `lib/sse-writer.js`, `lib/stream-lifecycle.js`, `public/execution-stream.js` | Normalize new transport into existing token/thinking/tool/done/error lifecycle. |
| Persistence | Runtime SQLite state/changes routes; `public/state-sync.js`; `lib/execution-journal.js` encrypted run/call/event receipts; `lib/continuity-store.js` saved notes | Persist billing/connection/harness binding and protocol history without credentials. |
| Tools / agents | `lib/tool-runtime.js` registry, runtime `authorizeToolCall`, `lib/tool-discovery.js`, local/skill/browser/action/RAG runtimes | Existing AI Chat harness retains execution authorization, budgets and receipts. |
| MCP | `lib/action-runtime.js` POSTs validated manifests to trusted loopback adapters; no general MCP protocol client there. Codex reports `mcp_tool_call`. | Keep adapter-based MCP distinct from native Codex MCP. |
| Native Codex | Runtime `runCodexExec:2557`, native stream branch `:4543`, helpers `:6500` onward | Extract existing path before adding App Server. |
| Automation | `lib/automation-service.js` and runtime scheduler save chats and dispatch explicit profile/model/tool configurations | Bind account explicitly; pause when disconnected; no account or billing fallback. |
| Ecosystem | Kujo bridge/AI SDK, Watchdog proxy and telemetry, Kujo RAG adapter, scoped skills/actions | Preserve neutral contracts; no need to migrate all providers to OpenAI SDK. |

Native specifics: `runCodexExec` uses `cwd=projectRoot`, inherited environment, selected model and sandbox (default read-only). Fresh streaming requests create persistent native executions; interrupted attempts resume the saved native ID with home/cwd checks and receipt reconciliation. Ordinary later chat messages are still fresh exec calls with a transcript, not automatic pane-thread continuation. Agent text is emitted after `item.completed`, split into chunks: it is not real token-by-token native streaming. JSON auxiliary calls are ephemeral. The browser tool presets do not control Codex's native tool policy. These distinctions shape migration tests.

Configuration: `.env.example` covers host/port/DB, `API_AUTH_TOKEN`, `ENCRYPTION_SECRET`, origins/hosts/proxy trust, `KUJO_BIN`, `AI_SDK_PATH`, `CODEX_CLI_PATH`, `CODEX_MODEL_CACHE_PATH`, `CODEX_SANDBOX_MODE`, Watchdog secrets/URLs, stream/context limits and explicit tool flags. Runtime also honors `CODEX_HOME`. Existing Hermes/xAI subscription proxies are unrelated authorization systems and cannot establish OpenAI eligibility.

## 9. Proposed AI Chat Architecture

Proposed names below are not existing modules.

```text
Browser (App Access, connection status, model choice, approval UI)
  → application authorization
  → connection identity + explicit entitlement/billing selection
  → transport: existing HTTP | ChatGPT-plan Responses
  → harness: AI Chat bounded tools | native Codex exec | Codex App Server
  → normalized SSE + execution journal + saved pane
```

Use a small additive seam, not a rewrite:

- `Connection`: opaque local ID, kind (`api_key`, `chatgpt_plan_oauth`, `codex_managed`), verified identity/client binding when available, display metadata, status, credential reference/version. Browser receives public projection only.
- `CapabilityGrant`: connection ID, granted scopes, observed time, route/tool restrictions, status (`unknown`, `authorized`, `denied`, `expired`, `limited`). Scope authorization and a completed inference are distinct evidence. Plan name nullable with provenance.
- `ExecutionBinding`: profile, connection ID/version, billing source, harness, model, workspace, native thread ID if applicable. Snapshot at admission; reject account changes on resume.
- `ModelTransport`: `listModels(connection)`, `stream(request, credentialLease, signal)` → normalized output/tool/usage/terminal events.
- `Harness`: `start`, `resume`, `cancel`, `approve`; owns exactly one tool loop. AI Chat tool execution and Codex tool execution must not both run the same call.

Keep profile compatibility through nullable connection/harness fields and defaults. Add a server-only connection store; do not export credentials in `/api/state`, execution requests or browser cache. No new user table is necessary for provider linking in the single-operator app. True website login would require users, sessions, ownership migrations and authorization across chats, automations, artifacts, receipts, tools and sockets before exposure.

## 10. Authentication Flow

Proposed local route contract: authenticated `POST /api/connections/chatgpt/start`, opaque attempt ID + safe authorization URL; authenticated status polling and cancel; a dedicated one-shot loopback callback (not a bearer-protected API route). Complete provider linking only for the operator transaction that initiated it. Bound transaction lifetime, prohibit arbitrary redirect destinations, suppress callback query logging, close the listener after use.

First registration uses `dynamic_agent_client`, `agent_name_hint=AI Chat`, stable opaque host ID and fresh state/nonce/S256 PKCE. Use `http://127.0.0.1:<port>/auth/callback`; only port may vary on future sign-ins. Exact URI must match within an attempt. Callback supplies the issued client ID; token exchange uses that ID, never the bootstrap ID. Returning sign-in uses saved client ID and rejects identity/client substitution. Activate only after validation and scope evaluation. [S4, S5]

Proposed records are keyed by verified identity plus issued registration, not email. Store access/refresh/retained ID token, scope set, receipt time, expiration, generation and client ID atomically. Retained ID token is only a reauthorization hint; it does not authenticate a new session. One refresh owner per registration across panes/processes. Revoke using discovered endpoint before deleting local tokens; retain host/client mapping. If revocation fails, stop locally and report that remote disconnection is unconfirmed. [S6]

Access lifetime is documented as one hour; rotating refresh lifetime 30 days, extended on successful refresh. Persist `earliest_refresh_at` if supplied; its precise scheduling interpretation is not fully specified by the fetched guide, so avoid aggressive renewal and verify before implementation. [S10]

## 11. Provider/Harness Flow

For direct plan use, admission resolves one connection and checks permission before acquiring a credential lease. Fetch account models from `/v1/models` (`models`, `slug`, `display_name`, `visibility=list`, server ordering). POST `/v1/responses`; map output deltas and terminal states, with success only on `response.completed`. Preserve partial output on failures/EOF. [S7]

Implement a **positive request allowlist**: text-first `input` history array, developer/instructions context, supported model and scoped tools. Always `store:false`, `stream:true`. Exclude `background`, `conversation`, `max_output_tokens`, `max_tool_calls`, `metadata`, `moderation`, `multi_agent`, `prompt`, `prompt_cache_retention`, `safety_identifier`, `temperature`, `top_logprobs`, `top_p`, `truncation`, `user` and HTTP `previous_response_id`. This means AI Chat's max-token setting cannot be advertised as a provider-enforced output cap; maintain local context allowance, cancellation and tool-round budgets separately.

Translate authorized neutral tool schemas into supported namespaces; accumulate arguments before validation/execution, retain call IDs and return associated tool results in the next complete history. Preserve returned reasoning items needed for continuation without treating hidden reasoning as user-facing text. Add protocol fixtures before enabling tools. Use ordinary function names for AI Chat's `tool_discover`, not Responses `tool_search`. Keep existing request allowlists, browser containment and side-effect reconciliation.

The JSON `/api/chat` route must internally collect the permitted stream to a terminal result for titles and other auxiliary requests; do not send `stream:false` or fall back to an API key. Transcription remains a separately selected API-key capability. Scheduled tasks and multi-pane runs share the same account allowance and refresh lock.

For Codex, choose either existing managed login or the explicitly selected SIWC connection. Record different harness bindings. App Server keeps native history; AI Chat keeps UI transcript and durable receipt/event projections. On restart, resume the exact native thread; never inject the full old transcript as a fresh task. Pending approvals fail closed when the frontend disconnects or account changes.

## 12. Security Considerations

| Threat | Required design / verification |
|---|---|
| Login CSRF / callback injection | One-time server transaction bound to authenticated operator, state, nonce, S256 PKCE, expiry and atomic consumption; deny unsolicited callbacks. |
| Redirect/DNS rebinding | Dedicated 127.0.0.1 listener; fixed path; no supplied host/return URL; preserve app origin/host checks. Do not weaken all `/api` auth for OAuth. |
| JWT substitution / account linking | Trusted discovery/JWKS, algorithm allowlist, issuer/audience/nonce/time checks; composite identity; explicit linking, no email-only ownership. |
| Session fixation | If website sessions are later added, rotate after authentication, use Secure/HttpOnly/SameSite cookies, CSRF protection and server expiry. Browser's existing TTL is not server revocation. |
| Browser compromise | No OAuth tokens, verifiers or secrets in localStorage, SSE, state exports or support logs. Existing App Access localStorage remains sensitive; connecting a provider does not cure XSS risk. |
| Refresh theft/races | Owner-only external store, atomic replacement, serialized renewal, restrictive directory permissions and account generation checks. Encrypt token records with a dedicated derived key; require a non-development master secret. |
| Tool access to secrets | Exclude credential directory from local/browser/action roots; minimal child env; do not inherit all provider secrets into a new App Server child. Sandbox policy must cover credential files and commands. |
| Mixed accounts/workspaces | Stable registration labels, separate token records/catalogs/processes; pin execution to connection, not a mutable global “active account.” |
| Logout/revocation | Stop new work and refreshes; cancel bound runs; invalidate credential leases; attempt revoke and clear local data. No webhook is promised; terminal auth errors disable connection. |
| Temporary errors | Preserve credentials on network/503 failures; terminal refresh errors require reauth. Redact diagnostics but retain request IDs, status and structured error codes. |
| Approvals/shell | Do not expose raw App Server RPC. Allowlist methods; reject stale approval responses. Do not expose `thread/shellCommand` or experimental process spawning as sandboxed operations: docs state they can run outside it. |
| Local vs hosted | Browser loopback reaches the browser computer. Remote self-hosted setup needs the documented local-auth/secure-transfer procedure and separate VM host ID, not public HTTP callback or cookie extraction. |

[S3, S5, S6, S9, S11, S15]. AI Chat's credential boundary is the Node host. Proposal: `~/.config/ai-chat/chatgpt/` outside the repository/data exports, owner-only files encrypted with versioned key derivation; SQLite stores references and safe metadata. No direct access to existing live credentials was needed for this research.

## 13. UX Proposal

In Settings → Providers, display independent cards:

- **ChatGPT plan (preview):** Continue with ChatGPT; verified account label; permission state; account-specific model choices; “Using ChatGPT plan” on each bound pane; Manage usage; switch account; disconnect. Show no “Pro” badge or remaining balance without a supported source. First successful plan authorization gets a one-time confirmation. [S28]
- **Codex (local):** native connection status, read-only/default workspace policy, selected harness, approval controls. Show plan only when returned by native account metadata and label it as native Codex information.
- **OpenAI API:** Add API key; API billing; existing transcription and API models. No implicit conversion when a plan request fails.

Distinct states: signed in without plan permission; connected/authorized; eligibility rejected; app or plan limit reached; temporarily unavailable; reconnect required; cancelled; remote revocation unconfirmed. Limit errors offer Manage usage, not repeated OAuth. Choosing an API key is an explicit billing action. Disable unsupported settings with a concise reason. The local connection button is not advertised as a replacement for App Access.

## 14. Exact Code Areas Affected

| Existing surface | Proposed change |
|---|---|
| `lib/server-runtime.js` | Connection routes, schema migration, provider capability routing, branch in JSON/SSE requests, execution binding, native adapter extraction, cancellation and scheduler checks. |
| `public/app.js`, `public/index.html`, `public/app.css` | Connection cards/status, account picker, model discovery, capability-based controls, explicit billing labels, approval dialog. |
| `public/state-sync.js` | Synchronize only safe connection references; preserve new optional profile fields; never cache credentials. |
| `public/execution-stream.js`, `public/execution-replay.js` | New normalized approval/diff/native events and binding-aware recovery; retain terminal semantics. |
| `lib/execution-journal.js` | Versioned connection/harness binding, opaque protocol checkpoint, approval receipts; migration must preserve prior executions. |
| `lib/tool-runtime.js`, `lib/tool-discovery.js`, `lib/context-budget.js` | Reuse permissions; explicit transport schema/history adaptation and honest context/output accounting. |
| `lib/automation-service.js` | Bound connection state at execution; disconnected/limited runs pause or fail clearly. |
| `bridge_chat.kujo` | No initial change: existing API providers retain their teaching example. |
| `package.json`, lockfile | Only when implementing: maintained OIDC/JWT dependency; optional pinned Codex runtime/SDK. |
| `.env.example`, `README.md`, `SETUP_AND_INSTALL.md`, `docs/API_CONTRACT.md` | New connection/harness configuration, scopes, restrictions, routes and upgrade guidance. |

New proposed modules: `lib/connections/connection-store.js`, `lib/auth/chatgpt-oauth.js`, `lib/auth/oauth-transactions.js`, `lib/entitlements.js`, `lib/providers/chatgpt-responses.js`, `lib/harnesses/codex-exec.js`, `lib/harnesses/codex-app-server.js`. Keep adapters small; do not extract unrelated runtime code.

## 15. Dependencies

Node 22.17.0 target, existing Express/SQLite/SSE/journal infrastructure, maintained JWT/OIDC verifier compatible with CommonJS (e.g. controlled dynamic import of `jose`), trusted discovery/JWKS, local system browser, loopback listener, secure writable credential directory. Direct Responses can use Node fetch; OpenAI SDK is optional. No Kujo SDK OAuth support is needed initially.

App Server needs a pinned tested Codex binary, generated protocol schemas and an isolated configuration/home policy. Exact minimum compatible version is not specified by the SIWC recipe: establish it with a versioned contract fixture before implementation rollout. Avoid changing the user's global Codex auth/config. Models must be discovered, not copied from today's examples.

## 16. Open Questions

1. Confirm specific account/region rollout through an opt-in live acceptance run. Documentation is sufficient to plan, not proof that this user's account is eligible.
2. Confirm OSS scope if AI Chat becomes paid or service-hosted; MIT licensing alone does not exempt commercial deployment from approval.
3. Confirm runtime version and schema for namespaced function history, reasoning continuity and App Server custom-provider compatibility.
4. No supported SIWC plan-name/quota endpoint is established; keep those fields absent. Do not borrow unrelated native Codex account data.
5. `earliest_refresh_at` is listed without a complete timing contract; clarify before implementing renewal scheduling.
6. Website guide says commercial trial while OSS quickstart is open; these refer to different registration paths. Generic discovery scope list omits direct-use scopes, but the specialized OSS guide explicitly requires them. Use the route-specific guide, not discovery omission as a denial of support.
7. App Server describes a stable RPC subset and also experimental command/network behavior. Use stdio conservatively as preview; require pinned-version testing, no production-readiness claim.
8. Future first-party website authentication requires an ownership/product decision; it must not expose the shared operator installation to any signed-in ChatGPT user.

### Options assessed by capability, not preference

| Option | Enables / availability | Requirements and impact |
|---|---|---|
| 1. Identity only | Local verified connection identity is feasible; commercial website login is gated | Medium OAuth work; high additional work if replacing App Access with accounts/ownership. |
| 2. Identity + subscription inference | OSS local preview for eligible Plus/Pro; hosted commercial approval | OAuth/rotation plus new Responses adapter and capability restrictions; high integration/testing scope. |
| 3. Identity + Codex/App Server | Public local harness; either managed native auth or SIWC provider | Native auth does not create an AI Chat user; bidirectional approvals/persistence make this high scope. |
| 4. API key alongside ChatGPT connection | Existing API behavior plus optional connection | Keep credentials/billing explicit; lowest migration impact on existing profiles. |
| 5. Combination | Fits the documented local use case | Implement 2+4 incrementally; extend existing Codex as separate optional harness. No prerequisite commercial approval for documented OSS route. |

### Path to commercial access

Use [the official interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) for sign-in-only or sign-in-plus-plan-use access. It requests work email, name, company, website, desired capability and product description; job title is optional. Existing OpenAI representatives are another documented waitlist contact. No published acceptance threshold, SLA or guaranteed approval was found. Approved website integrations need client ID, registered callback(s), client authentication method and secret if confidential. Do not submit a form or seek approval as part of this research. [S3, S18]

## 17. Implementation Phases

This is the bounded execution handoff. Each phase is a separate reviewable change, with stop conditions. Production code is unchanged by this research.

### Phase 0 — Prerequisites

- Scope: local OSS deployment only; record runtime version, secure storage choice, callback path, stable host identity policy, test account consent and rollout gate.
- Files: future `.env.example`, `SETUP_AND_INSTALL.md`, `package.json`; new protocol fixtures under `tests/fixtures/chatgpt/`.
- Interfaces/dependencies: versioned connection schema; JWT/OIDC library; no secret/client preregistration for OSS.
- Tests: pin discovery/JWKS fixtures, local listener collision, config validation, catalog shape and protocol generation smoke.
- External: eligible account for eventual live tests. Commercial variant stops pending provisioned client approval. Do not spend tokens or authenticate automatically in fixture tests.

### Phase 1 — Authentication / connection identity

- Files: new auth/transaction/connection modules; runtime connection routes; safe projections in `public/state-sync.js`.
- Interfaces: start/status/cancel/disconnect, `Connection`, token lease and atomic credential generation. Bind to existing App Access, not global public login.
- Dependencies: Phase 0; loopback listener; verifier; protected storage.
- Tests: PKCE/state/nonce replay, wrong issuer/audience/signature, missing issued client ID, redirect mismatch, duplicate callbacks, same-email accounts, failed attempt preserves active connection, restart persistence and secret redaction.
- Exit: authenticated operator can establish verified local connection against fixtures; no inference implied. Hosted identity-only work is a separate gated variant with ownership/session tests.

### Phase 2 — Entitlements and token lifecycle

- Files: new `lib/entitlements.js`; connection store/OAuth modules; scheduler dispatch guards.
- Interfaces: explicit granted-scope state, refresh single-flight, disconnect generation, capability matrix. Never infer plan from email or model names.
- Dependencies: Phase 1, direct-use consent and account admission; no commercial approval for OSS.
- Tests: absent direct scope, refresh rotation/reuse/crash, expiry, scope loss, sign-out/refresh races, revoked vs transient failures, account switch during queued task.
- Exit: denied/unknown/expired connections cannot dispatch; refresh/revoke cannot change another account's record.

### Phase 3 — Provider integration

- Files: new `lib/providers/chatgpt-responses.js`; runtime JSON/SSE routes and provider config; context/tool adaptation; journal bindings.
- Interfaces: model catalog, normalized stream events, protocol history, schema mapping and explicit billing source.
- Dependencies: Phases 1–2; exact preview request contract. Start text-only, then add local function calls in a separate commit.
- Tests: prohibited-field omission, developer-message conversion, model account isolation, output deltas, terminal failure after text, malformed/oversized SSE, EOF, cancellation, namespaced calls/results, unauthorized tool rejection, duplicate receipts, JSON auxiliary collection and no billing fallback.
- Exit: direct text and one bounded local tool work in fixtures; separately opt-in live inference proves selected model access. No transcription or hosted tools on this route.

### Phase 4 — Codex / harness (optional independent increment)

- Files: extract `codex-exec.js`; add `codex-app-server.js`; runtime harness selector, journal native binding, execution UI.
- Interfaces: initialize/start/resume/interrupt/approve; account-specific process manager; safe RPC allowlist.
- Dependencies: pinned binary/schema; retain existing exec path. SIWC custom-provider mode depends on Phase 2; managed native mode can proceed separately.
- Tests: incremental events, command/file/MCP approval denial, stale/cross-pane approval, diff projection, turn status, child exit, refresh restart/thread resume, changed account/home/workspace rejection, uncertain action reconciliation, no unsandboxed RPC exposure.
- Exit: one conversation per pane continues without replaying old tasks; native and SIWC credentials stay separate. Do not silently migrate legacy native sessions.

### Phase 5 — UX

- Files: `public/app.js`, `public/index.html`, `public/app.css`, execution modules; README/setup/API contract.
- Interfaces: public connection/status/capability responses only; explicit plan vs API vs native harness labels.
- Dependencies: supported backend states from prior phases; approved branding.
- Tests: identity-only consent, limited/ineligible/unavailable/reconnect states, multiple identical emails, unavailable catalog, first-use notice, explicit fallback choice, no unsupported plan badge, hidden transcription/output controls, accessible approvals.
- Exit: a user can tell which account and allowance each pane uses and disconnect without changing unrelated profiles.

### Phase 6 — Security + acceptance

- Files: new `tests/chatgpt-oauth.test.js`, `tests/chatgpt-responses.test.js`, `tests/connection-store.test.js`, `tests/codex-app-server.test.js`; extend existing route/state/journal/stream/tool/automation tests and smoke fixtures.
- Dependencies: all enabled phases, Node 22.17.0, isolated temp DB/home/credentials, mock issuer/provider/harness; explicit live-test opt-in.
- Tests: adversarial callbacks/JWTs, CSRF/Host/Origin, session fixation for any new app login, concurrent renewal, secrets in exports/logs/errors, path access, process crash during tool side effect, account/billing binding on replay, full existing suite and offline smoke.
- Exit: no production-account mutation in tests; all enabled contracts pass. Record actual live account/region/runtime results without tokens. No approval, paid fallback, token extraction or weakened sandbox shortcuts.

## 18. Official Sources

Full URLs, dates, confidence, excerpts and conflict notes are in [openai-chatgpt-auth-sources.md](openai-chatgpt-auth-sources.md). Start execution from S2/S5/S7/S12; use S8 for SIWC App Server and S15 for RPC. Recheck preview docs and live schema at implementation time because availability and protocol details can change; the research need not be repeated from scratch.
