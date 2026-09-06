(function (root) {
	async function consumeExecutionResponse(response, { after = 0, onEvent, signal } = {}) {
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body.error?.message || `Execution request failed (HTTP ${response.status}).`);
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "", cursor = after, terminal = null;
		const frame = async (text) => {
			if (text.length > 2 * 1024 * 1024) throw new Error("Execution event exceeds the client limit.");
			const lines = text.split(/\r?\n/);
			const name = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
			const raw = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
			if (!name || !raw) return;
			const sequence = Number(lines.find(line => line.startsWith("id:"))?.slice(3).trim() || 0);
			if (sequence && (!Number.isSafeInteger(sequence) || sequence <= cursor)) return;
			const data = JSON.parse(raw);
			await onEvent({ event: name, data, sequence });
			if (sequence) cursor = sequence;
			if (name === "done" || name === "error") terminal = name;
		};
		try {
			while (!terminal) {
				signal?.throwIfAborted();
				const part = await reader.read();
				buffer += decoder.decode(part.value, { stream: !part.done });
				let match;
				while ((match = /\r?\n\r?\n/.exec(buffer))) {
					await frame(buffer.slice(0, match.index));
					buffer = buffer.slice(match.index + match[0].length);
					if (terminal) break;
				}
				if (buffer.length > 2 * 1024 * 1024) throw new Error("Execution event exceeds the client limit.");
				if (part.done) break;
			}
			return { cursor, terminal };
		} finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
	}
	if (typeof module !== "undefined" && module.exports) module.exports = { consumeExecutionResponse };
	else root.AIChatExecutionStream = { consumeExecutionResponse };
})(typeof window !== "undefined" ? window : globalThis);
