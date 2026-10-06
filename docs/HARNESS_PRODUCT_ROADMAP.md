# Agent Harness Product Roadmap

Status: HR-01 through HR-07 implemented; remaining items are planned work.

Baseline reviewed: 2026-10-06 on `codex/diff-viewer` at `730dcff`.

AI Chat already has durable chats, multi-pane model comparison, multi-chat tabs,
streaming, saved execution review and resume, bounded provider-neutral tools,
live code diffs, scheduled automations, and usage reporting. The next product
round should focus on supervising, redirecting, isolating, inspecting, and
recovering agent work.

## How to use this roadmap

- Keep the feature IDs stable in issues, commits, tests, and release notes.
- Change an item from **Planned** only when its acceptance evidence exists.
- Update `docs/API_CONTRACT.md` with shipped wire behavior; proposals here are
  not API promises.
- Update `README.md` only after a feature is usable through the supported app.
- Prefer one independently reviewable vertical slice per commit or pull request.
- Do not assign dates until scope, owner, and dependencies are accepted.

## Cross-cutting requirements

Every roadmap item must preserve these boundaries:

1. **Server-authoritative safety.** UI state cannot grant tool, filesystem,
   network, provider, or Git authority that the server has not verified.
2. **Exact scope.** Persisted records bind to the relevant chat, pane,
   execution, workspace, and action identity. A grant from one scope cannot
   authorize another.
3. **Reload-safe state.** Pending work, approvals, plans, artifacts, and review
   decisions survive reload or explicitly report that they are ephemeral.
4. **Provider neutrality.** Core records do not depend on one provider's event
   names. Provider-specific metadata stays additive.
5. **Bounded data.** Content, logs, artifacts, history, and retention all have
   explicit count, byte, and time limits.
6. **No secret expansion.** New UI and audit records must not expose command
   environment values, credentials, hidden reasoning, cookies, or provider
   response bodies that existing contracts keep private.
7. **Accessible interaction.** Keyboard operation, focus return, screen-reader
   labels, reduced motion, narrow screens, and multi-pane layouts are required.
8. **Non-destructive defaults.** Read-only behavior stays automatic; writes,
   external actions, restoration, and Git mutations require explicit policy.
9. **Observable completion.** A feature is not complete without success,
   denial/failure, cancellation, restart, and stale-state evidence where those
   states apply.
10. **Honest status.** A visual control must not imply isolation, rollback,
    approval, or persistence that the runtime cannot enforce.

## Delivery sequence

The priority numbers reflect user value. The delivery phases account for
technical dependencies.

| Phase | Features | Exit condition |
| --- | --- | --- |
| A — Safety foundation | HR-01 interactive approvals; HR-03 checkpoints | Consequential work can pause for a scoped decision and agent file edits can be restored safely. |
| B — Review and isolation | HR-02 actionable diff review; HR-05 worktrees | Each coding chat can be isolated and reviewed without ambiguous reject/revert behavior. |
| C — Long-running control | HR-04 plans/steering; HR-09 attention inbox | Users can understand, redirect, and unblock active work without polling every chat. |
| D — Context and evidence | HR-06 attachments/context; HR-07 execution/artifacts | Inputs and outputs are explicit, inspectable, bounded, and reusable. |
| E — Extensibility and speed | HR-08 MCP/plugins; HR-10 command palette | New capabilities and frequent actions remain discoverable and policy-controlled. |

## HR-01 — Interactive approvals

**Priority:** 1  
**Status:** Implemented
**Depends on:** existing execution journal, tool receipts, browser approval model  
**Unblocks:** safe write/shell adoption, HR-08

### Outcome

Users can approve or deny a consequential action from the chat without enabling
broad write or shell authority for every future request.

### Required scope

- Add one provider-neutral approval record for local writes, local commands,
  browser actions, action adapters, and future MCP/plugin tools.
- Display a sanitized action summary, workspace, reason, risk class, expiration,
  and exact requested scope.
- Support **Allow once**, **Allow for this chat**, **Always allow this exact rule
  in this workspace**, and **Deny**. Persistent rules require explicit settings
  management and provenance.
- Keep read-only actions automatic unless policy says otherwise.
- Journal the pause and decision so reload, disconnect, resume, and audit views
  agree about whether execution started.
- Bind every grant to immutable normalized arguments or a narrowly defined rule;
  changed arguments require another decision.

### Acceptance evidence

- Approval once executes exactly one matching action and cannot be replayed.
- Denial, expiry, changed scope, changed workspace, and stale execution fail
  closed without provider or tool execution.
- Two panes requesting similar commands cannot consume each other's grants.
- Reload and detached-stream fixtures preserve a pending decision safely.
- Browser tests cover keyboard focus, decision labels, narrow screens, and an
  expired request.
- Audit records contain identities and decisions but no secret argument values.

**Implementation evidence:** `lib/approval-store.js`, authenticated approval
routes and SSE events in `lib/server-runtime.js`, chat decision cards and the
Settings grant manager, plus `tests/harness-controls.test.js`.

## HR-02 — Actionable diff review

**Priority:** 2  
**Status:** Implemented
**Depends on:** HR-03 for safe revert; HR-05 for isolated workspace ownership  
**Can begin early:** open-in-editor, inline comments, reviewed/unreviewed state

### Outcome

The diff viewer becomes a review surface, not only a rendering surface.

### Required scope

- Add file navigation, reviewed state, inline comments, and open-in-editor.
- Add accept/reject at file and hunk level. Define **accept** as review state;
  never pretend it applies a change that is already present.
- Implement reject/revert through a conflict-checked inverse patch or checkpoint
  restoration. Never overwrite manual edits made after the diff snapshot.
- Preserve unified/split layouts, live streaming, multi-pane behavior, copied
  patches, truncation warnings, and binary-file handling.
- Record the source execution, base fingerprint, review decision, and resulting
  workspace fingerprint.

### Acceptance evidence

- File and hunk decisions target the exact recorded patch.
- Concurrent manual changes produce a conflict instead of silent data loss.
- Reverting one file does not alter another file or unrelated user edits.
- Comments and reviewed state survive reload without entering model context
  unless the user explicitly sends them.
- Browser coverage includes keyboard navigation, mobile unified mode,
  multi-pane mode, binary files, truncation, and conflicts.

**Implementation evidence:** `lib/diff-review-store.js`, conflict-checked
checkpoint operations, persistent review state/comments, and diff controls in
`public/app.js` with focused contract and UI regression tests.

## HR-03 — Checkpoints, rewind, and fork

**Priority:** 3  
**Status:** Implemented
**Depends on:** workspace identity and the existing execution/message journal  
**Unblocks:** HR-02 reject/revert

### Outcome

Users can recover from agent-authored file changes and fork an earlier direction
without confusing checkpoints with permanent version control.

### Required scope

- Capture an automatic pre-turn checkpoint for agent-managed workspace changes.
- Track only files the agent changed; disclose that unrelated manual edits are
  outside checkpoint coverage.
- Offer compare, restore, and fork-from-here from the corresponding user turn.
- Keep chat branching and workspace restoration atomic from the user's point of
  view, or stop with a recoverable partial-state report.
- Store bounded manifests and content-addressed data with retention cleanup.
- Do not mutate Git history or call a checkpoint a commit.

### Acceptance evidence

- Restore returns covered files to their exact pre-turn bytes.
- Manual edits after the checkpoint cause a conflict prompt or remain untouched.
- Restart preserves checkpoint identity and restoration eligibility.
- Fork creates a new chat lineage and a matching workspace state.
- Retention removes expired checkpoint payloads without breaking chat history.

**Implementation evidence:** encrypted, bounded checkpoint manifests in
`lib/checkpoint-store.js`, execution inspection/restore/fork routes, and exact
restore, hunk-revert, and conflict fixtures in `tests/harness-controls.test.js`.

## HR-04 — Plan, task progress, and mid-run steering

**Priority:** 4  
**Status:** Implemented
**Depends on:** durable execution identity and message ordering

### Outcome

Long-running work exposes what is happening now, what remains, and what needs a
human decision. Users can queue guidance without terminating useful work.

### Required scope

- Add a provider-neutral plan model with stable step IDs and states: pending,
  active, completed, skipped, blocked, and failed.
- Show a compact summary near the chat and a detailed plan panel when requested.
- Allow queued follow-ups, immediate steering, and cancel-after-current-action.
- Preserve ordering between streamed output, plan updates, user steering, tool
  receipts, and terminal state.
- Clearly distinguish model-authored plans from verified execution evidence.

### Acceptance evidence

- Plan changes are incremental and do not duplicate steps after reconnect.
- A queued prompt runs once after the current turn; steering reaches the active
  execution at a defined boundary.
- Cancellation cannot start a queued follow-up accidentally.
- Tabs and the attention inbox reflect blocked or question states.
- Providers without structured plans retain normal chat behavior.

**Implementation evidence:** durable provider-neutral plans and steering in
`lib/agent-control-store.js`, ordered SSE events, composer steering modes, and
consume-once tests in `tests/harness-controls.test.js`.

## HR-05 — Per-chat worktree and branch isolation

**Priority:** 5  
**Status:** Implemented
**Depends on:** repository discovery, Git capability checks, lifecycle cleanup

### Outcome

Concurrent coding chats can work on the same repository without sharing a
mutable checkout unless the user deliberately chooses that mode.

### Required scope

- Offer **Current workspace**, **New worktree**, and **Read-only** when starting
  a coding chat.
- Show repository, worktree path label, branch, dirty state, ahead/behind state,
  conflicts, and base revision without leaking unrelated absolute paths.
- Provide explicit checkout/apply, commit, merge-preparation, and cleanup
  actions. Publishing or opening a pull request remains separately authorized.
- Allocate unique ports and runtime data when a worktree launches the app.
- Protect user-owned dirty worktrees from automatic deletion.

### Acceptance evidence

- Two chats can modify the same repository in isolated worktrees without file
  collisions or shared runtime data.
- Existing dirty state is detected before any worktree or branch mutation.
- Cleanup refuses unmerged or user-modified work unless explicitly confirmed.
- Non-Git workspaces continue to function without fake branch controls.

**Implementation evidence:** `lib/worktree-store.js`, authenticated per-chat
workspace routes, native/provider-neutral execution scoping, workspace controls,
and isolation/dirty-state fixtures in `tests/harness-rounds.test.js`.

## HR-06 — Attachments and explicit context chips

**Priority:** 6  
**Status:** Implemented
**Depends on:** artifact storage and message-parts contract in
`docs/ARTIFACT_AND_AGENT_DESIGN.md`

### Outcome

Users can attach files, images, folders, selections, and screenshots while
seeing exactly which context will be sent to which pane/provider.

### Required scope

- Add drag/drop, paste, picker, and `@file`/`@folder` selection.
- Represent attachments as typed message parts; do not overload message text.
- Show removable context chips with source, size, extraction mode, truncation,
  provider compatibility, and whether content leaves the local machine.
- Add authenticated bounded upload, MIME allowlists, extraction, encryption or
  workspace references, retention, and orphan cleanup.
- Show estimated context use and compaction effects without presenting provider
  tokenizer estimates as exact billing.

### Acceptance evidence

- Unsupported file types and oversized/count-limited uploads fail before model
  dispatch.
- Multi-pane sends disclose any provider-specific conversion or omission.
- Removing a chip removes it from the request and persisted message parts.
- Private-path, symlink, stale-reference, deletion, and retention tests pass.
- Image and text attachments remain keyboard accessible on narrow screens.

**Implementation evidence:** encrypted bounded storage in
`lib/attachment-store.js`, authenticated multi-file upload/removal routes, typed
persisted message parts, picker/folder/paste/drop context chips, and MIME,
encryption, expiry, and UI fixtures in `tests/harness-rounds.test.js`.

## HR-07 — Structured execution and artifact rail

**Priority:** 7  
**Status:** Implemented
**Depends on:** existing tool events, receipts, browser artifacts, test metadata

### Outcome

Terminal output, tests, screenshots, generated files, citations, and failures are
grouped by execution instead of being discoverable only through chat prose.

### Required scope

- Add a per-chat rail with filters for commands, tests, browser, files, sources,
  and errors.
- Link artifacts to their message, pane, execution, and tool receipt.
- Stream bounded previews; open full retained content only through authenticated
  artifact routes.
- Distinguish passed, failed, cancelled, uncertain, and unavailable evidence.
- Add copy, download, open, and compare only where the underlying artifact and
  policy support them.

### Acceptance evidence

- Interleaved panes never mix artifacts or terminal output.
- Large output truncates predictably with continuation or download metadata.
- Reload reconstructs the same execution grouping from durable records.
- Secret redaction and artifact authorization tests cover every renderer.

**Implementation evidence:** `lib/execution-artifacts.js`, chat-scoped retained
result routes, filterable status-aware artifact rail with open/copy/download,
and cross-chat authorization/redaction fixtures in
`tests/harness-rounds.test.js`.

## HR-08 — Native MCP and plugin management

**Priority:** 8  
**Status:** Planned  
**Depends on:** HR-01 approvals, tool discovery, encrypted connection storage

### Outcome

Users can discover, connect, authorize, scope, inspect, and disable MCP servers
and plugins without hand-writing one action adapter per capability.

### Required scope

- Support local stdio and authenticated HTTP transports behind one validated
  server record. Add other transports only with explicit threat analysis.
- Discover tools/resources lazily and expose only per-chat authorized entries.
- Keep OAuth and credentials server-side with revocation and connection health.
- Display publisher/source, permissions, transport, enabled scopes, tool count,
  and last error.
- Preserve action adapters as the narrow compatibility path; migration is opt-in.

### Acceptance evidence

- An unenabled server cannot advertise or execute tools.
- Tool-list changes, reconnect, cancellation, malformed schemas, OAuth failure,
  and server shutdown fail safely.
- Approval rules apply equally to built-in, MCP, plugin, and adapter actions.
- Secrets never enter chat state, audit arguments, exported chats, or browser JS.

## HR-09 — Attention inbox and notifications

**Priority:** 9  
**Status:** Planned  
**Depends on:** normalized attention events from HR-01 and HR-04

### Outcome

Users can find every chat that needs attention without opening tabs one by one.

### Required scope

- Normalize approval needed, question asked, task failed, task completed, and
  conflict/reconciliation required.
- Add an in-app inbox with unread counts, filters, source chat/pane, and direct
  navigation.
- Add optional desktop notifications with per-event controls and quiet hours.
- Deduplicate repeated updates and mark events resolved from authoritative state.

### Acceptance evidence

- One underlying event produces one inbox item across reconnects and reloads.
- Resolving an approval or question clears the matching attention state.
- Notification denial leaves the in-app inbox fully usable.
- No notification body includes secrets, command arguments, or hidden content.

## HR-10 — Command palette and configurable shortcuts

**Priority:** 10  
**Status:** Planned  
**Depends on:** stable commands from the preceding features

### Outcome

Frequent actions stay fast and discoverable even when the sidebar or mouse is
not available.

### Required scope

- Add a searchable command registry and palette.
- Cover new/fork chat, tab navigation, model switch, plan view, permissions,
  checkpoint restore, attach context, review changes, artifact rail, and inbox.
- Support configurable shortcuts with conflict detection and reset-to-default.
- Keep destructive commands out of one-keystroke execution; the palette opens
  their normal confirmation flow.
- Expose command labels, shortcut help, disabled reasons, and accessible search.

### Acceptance evidence

- Commands call the same implementation as visible controls.
- Shortcut conflicts and reserved browser/OS combinations are reported.
- Keyboard-only browser tests cover open, search, execute, dismiss, and focus
  restoration at desktop and narrow widths.

## Implementation contract checklist

Before starting any roadmap item:

- [ ] Confirm current behavior against source and the relevant manual.
- [ ] Write the smallest API/data migration proposal needed for the first slice.
- [ ] Identify destructive and externally consequential transitions.
- [ ] Define feature flag, rollback, retention, and migration behavior.
- [ ] Define multi-chat, multi-pane, reload, disconnect, and restart behavior.
- [ ] Add unit, route, and actual-browser acceptance coverage as applicable.
- [ ] Update `docs/API_CONTRACT.md`, capability/security manuals, setup, and
      `.env.example` only for behavior that ships.
- [ ] Update this roadmap item with commit and verification evidence.
- [ ] Add the shipped behavior to `README.md` and `CHANGELOG.md`.

## Completion evidence template

Append this under an item only after implementation:

```markdown
### Completion evidence — YYYY-MM-DD

- Commit:
- Data/API contract:
- Unit/route/browser verification:
- Security and failure-path verification:
- Migration/rollback verification:
- Documentation updated:
- Known limits:
```

## Research references

These sources informed feature selection, not AI Chat's contracts:

- [OpenAI: Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/)
- [OpenAI Developers: Mastering remote engineering work from your phone](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)
- [Cursor: Checkpoints](https://docs.cursor.com/en/agent/chat/checkpoints)
- [Cursor: Diffs and review](https://docs.cursor.com/en/agent/review)
- [Cursor: Planning](https://docs.cursor.com/en/agent/planning)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [VS Code: Manage approvals and permissions](https://code.visualstudio.com/docs/agents/run/approvals)
- [Pi coding-agent README](https://github.com/up0to1/pi-mono/blob/main/packages/coding-agent/README.md)

Review external behavior again before implementation; these products change
independently of AI Chat.
