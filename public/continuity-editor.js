(function () {
	window.AIChatContinuity = { open };
	async function open({ chatId, apiFetch }) {
		if (document.querySelector("dialog.continuity-editor")) return;
		const dialog = document.createElement("dialog");
		dialog.className = "continuity-editor";
		dialog.setAttribute("aria-labelledby", "continuity-title");
		dialog.innerHTML = `<h2 id="continuity-title">Saved notes</h2>
			<p>Keep constraints and decisions available throughout this chat, across every pane. Edit these yourself; agents do not save notes automatically. Changes apply to new requests.</p>
			<label>Constraints<textarea name="constraints" rows="5" maxlength="8000" placeholder="Requirements the agent should keep following"></textarea></label>
			<label>Decisions<textarea name="decisions" rows="5" maxlength="8000" placeholder="Choices already made for this chat"></textarea></label>
			<p role="status" aria-live="polite">Loading saved notes…</p>
			<div class="continuity-actions"><button type="button" data-action="close">Close</button><button type="button" data-action="reload">Reload saved notes</button><button type="button" data-action="save">Save notes</button></div>`;
		document.body.append(dialog);
		const constraints = dialog.querySelector('[name="constraints"]');
		const decisions = dialog.querySelector('[name="decisions"]');
		const status = dialog.querySelector('[role="status"]');
		const save = dialog.querySelector('[data-action="save"]');
		const reload = dialog.querySelector('[data-action="reload"]');
		const controller = new AbortController();
		let revision = null;
		let busy = false;
		const endpoint = `/api/chats/${encodeURIComponent(chatId)}/continuity`;
		function setBusy(value) { busy = value; save.disabled = value || revision === null; reload.disabled = value; }
		async function request(options = {}) {
			const response = await apiFetch(endpoint, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
			const result = await response.json();
			if (!response.ok || !result.ok) throw new Error(result.error?.message || "Could not save notes.");
			return result.continuity;
		}
		async function load() {
			setBusy(true);
			try {
				const value = await request();
				revision = value.revision;
				constraints.value = value.constraints;
				decisions.value = value.decisions;
				status.textContent = "Up to 8,000 characters combined. Clear both fields and save to remove these notes.";
			} catch (error) { status.textContent = error.message; }
			finally { setBusy(false); }
		}
		dialog.querySelector('[data-action="close"]').addEventListener("click", () => dialog.close());
		dialog.addEventListener("close", () => { controller.abort(); dialog.remove(); });
		reload.addEventListener("click", () => { if (!busy) void load(); });
		save.addEventListener("click", async () => {
			if (busy || revision === null) return;
			if (constraints.value.length + decisions.value.length > 8000) { status.textContent = "Keep both fields within 8,000 characters combined."; return; }
			setBusy(true);
			try {
				const value = await request({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, constraints: constraints.value, decisions: decisions.value }) });
				revision = value.revision;
				status.textContent = "Notes saved. They apply to the next request in this chat.";
			} catch (error) { status.textContent = `${error.message} Your edits remain here; copy them before reloading.`; }
			finally { setBusy(false); }
		});
		dialog.showModal();
		void load();
	}
})();
