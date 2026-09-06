(function (root) {
	async function replayExecution({ fetchPage, after = 0, onEvent, signal, timeoutMs = 90000, pollMs = 250 }) {
		let cursor = after;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			signal?.throwIfAborted();
			const page = await fetchPage(cursor);
			if (!page || !Array.isArray(page.events)) return { recovered: false, cursor };
			for (const event of page.events) {
				if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) continue;
				await onEvent(event);
				cursor = event.sequence;
				if (event.event === "done" || event.event === "error") return { recovered: true, cursor };
			}
			if (page.events.length >= 256) continue;
			if (page.status !== "running") return { recovered: false, cursor, status: page.status };
			await new Promise((resolve, reject) => {
				const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal.reason); };
				const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, pollMs);
				signal?.addEventListener("abort", abort, { once: true });
				if (signal?.aborted) abort();
			});
		}
		return { recovered: false, cursor, status: "pending" };
	}
	if (typeof module !== "undefined" && module.exports) module.exports = { replayExecution };
	else root.AIChatExecutionReplay = { replayExecution };
})(typeof window !== "undefined" ? window : globalThis);
