# Backlog Review — 2026-07-21

1. **Tools — fixed/refined.** The runtime already exposes read-only skills and opt-in local/browser/action tools. Keep local write and shell disabled by default; tool failures now return bounded structured results to the provider, so it can recover (including reopening a missing browser session).
2. **Tool recovery — fixed.** Failed executions no longer terminate an otherwise recoverable provider turn.
3. **Oversized paste — fixed/deferred.** The composer blocks pastes above 120,000 characters with an actionable message. Attachment conversion and file upload need a separate artifact/storage contract.
4. **Fresh window — fixed.** Startup creates an unsaved blank, single-pane chat instead of selecting prior history.
5. **Error notices — accepted.** Existing shared tool-error notice is already the canonical in-chat style; no second error component was added.
6. **Cache metrics — investigated.** The UI correctly distinguishes unreported values (`—`) from zero. Providers in the observed flow do not send cache detail fields; this cannot be inferred client-side.
7. **Panes filter — fixed.** Removed the empty visible selector; pane remains an internal filter for state compatibility.
8. **Usage modal refresh — deferred.** It already has metric cards, Chart.js charts, date fields, and filters. Dither-kit or new visual treatment requires a concrete design/asset decision.
9. **User Markdown — fixed.** User messages now use the same sanitized Markdown renderer as assistant messages.
10. **Two-column tables — fixed.** Simple two-column Markdown tables use fixed layout and wrap cell text before horizontal scrolling.
11. **Stream emoji — rejected.** Stream controls already use inline SVG; the sole loading asset is SVG, so replacement has no performance case.
12. **Thinking presentation — refined/fixed.** The progress indicator now sits below live thinking and disappears when answer text starts.
13. **Thought padding — fixed.** Removed horizontal padding from the thinking container.
14. **Tool activity — fixed.** The SSE contract now emits bounded tool started/completed/failed events, rendered as a temporary human-readable activity line.
15. **Streaming scroll — already fixed.** Patch rendering keeps the view pinned only when it was within 44px of the bottom.
16. **Message controls/watchdog toggle — deferred.** The requested rearrangement conflicts with the existing compact metadata footer; watchdog metadata needs a defined payload and disclosure design.
17. **Long user-message collapse — deferred.** Markdown expansion needs an accessible per-message disclosure component and accurate rendered-line measurement.
18. **Chat-ID hover — deferred.** Current control is beside the title; hover-only placement needs keyboard-accessible header layout work.
19. **Blue palette — refined.** Core accent variables now use the requested blue tint; a full color-token migration should be a separate visual sweep.
20. **Brand dot — fixed.** Removed from sidebar markup.
21. **Sidebar category emphasis — fixed.** Increased subtitle weight and tracking.
22. **Project delete — deferred.** Safe removal requires a styled confirmation and clear behavior for explicit vs. inferred project folders.
23. **Archive Delete All/confirms — deferred.** Native confirmations remain in several unrelated flows; consolidate them under one modal before adding destructive bulk deletion.
24. **Default new-chat state — accepted.** The blank single-pane startup change resolves the stale state that caused the weak empty state.
25. **Exports — deferred.** The transcript example was model-generated through local tools, not a first-class app export. Implementing exports needs a download API, workspace permissions, and file naming/metadata contract.
26. **Agents — research item.** Existing agent instructions are static settings. Stored agents need a scoped data model, selection UX, provider/tool policy inheritance, and migration plan.

Follow-on risk: tool-error recovery is intentionally bounded by existing round/call limits. Providers that repeat a failed call will receive the structured error but eventually hit that budget.
