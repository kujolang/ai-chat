# Artifact, Agent, and Rendering Design

## Large research input and uploads

Chat accepts a single pasted message up to the server's aggregate request limit
(200,000 characters by default). This is deliberately inline: every provider
currently receives the same text-only `messages` contract, so silently replacing
paste with a server-only attachment would make the model lose the supplied
context.

A future upload feature must introduce an `artifacts` table and explicit message
parts rather than overload `content`:

```json
{"type":"artifact_ref","artifact_id":"...","name":"research.md","mime_type":"text/markdown","text_excerpt":"..."}
```

The upload endpoint must use authenticated multipart requests, bounded size/count
and MIME allowlists, encrypted or workspace-scoped storage, retention cleanup,
and a provider adapter that either sends supported file parts or a bounded text
extraction. The composer should offer conversion only after explaining which
provider will receive the extracted text. Until that contract exists, accepting
the full safe inline paste is the lossless behavior.

## Cache accounting evidence

Usage normalization preserves provider-supplied cache-read and cache-write fields
from common top-level and nested payload shapes. A dash in the UI means those
fields were not supplied; it is not treated as zero. Cache counts must never be
estimated from prompt size because providers apply incompatible cache policies.
The persisted message usage object and usage ledger retain the normalized values,
so a captured provider fixture with cache fields can be added without a schema
migration.

## Stream emoji policy

Model text is data, not a control surface. The renderer must never substitute
emoji appearing in streamed/user/assistant Markdown: substitution can change
meaning, code samples, identifiers, or accessibility text. UI controls use inline
SVG only when the application owns the semantic action. Any future semantic
replacement must operate on a separately structured token from a provider, use a
fixed SVG allowlist, and retain accessible text.

## Stored agents: first release contract

The current **Agent Instructions** setting is intentionally chat-wide and
model-scoped. A first-class Agent is a separate, stored configuration, not a
renamed prompt:

```json
{
  "id":"agent_...",
  "name":"Research reviewer",
  "model":{"profile_id":"...","model":"..."},
  "instructions":"...",
  "skills":["skill-name"],
  "tool_policy":{"allow":["web_search"],"deny":["local_file_write"]},
  "approval_policy":"ask"
}
```

Agents should be selected per pane and copied into the request as a snapshot of
their policy version. Migration should leave existing `agentInstructions` and
`agentInstructionProfiles` untouched, offer an explicit one-time “Create agent
from model instructions” action, and never auto-enable write/action tools. The
data model requires `agents_json` in `app_settings` (or a normalized `agents`
table), `agent_id`/policy snapshot on panes, validation of IDs and allowed runtime
tools, and server-side policy enforcement before provider dispatch. This design is
the prerequisite for implementation; it prevents a UI-only agent setting from
claiming tool or approval isolation it cannot enforce.
