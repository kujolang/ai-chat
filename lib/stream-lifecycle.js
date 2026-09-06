// A disconnected client is not a cancellation: mobile clients may reconnect
// after the server has persisted the result. Stop uses an explicit control call.
function createStreamRegistry({ maxActive = 32, heartbeatMs = 15000 } = {}) {
	const active = new Map();
	const pendingCancellations = new Map();
	function open(id, response) {
		for (const [key, expiresAt] of pendingCancellations) if (expiresAt <= Date.now()) pendingCancellations.delete(key);
		if (pendingCancellations.has(id)) {
			pendingCancellations.delete(id);
			throw failure("stream_cancelled", "Generation was cancelled before it started.");
		}
		if (active.has(id)) throw failure("stream_already_running", "This request is already running.");
		if (active.size >= maxActive) throw failure("stream_capacity", "The server has reached its active response limit. Retry when a response finishes.");
		const controller = new AbortController();
		const entry = { controller, cancelled: false };
		active.set(id, entry);
		const heartbeat = setInterval(() => {
			if (!response.destroyed && !response.writableEnded && !response.writableNeedDrain) {
				response.write(": heartbeat\n\n");
			}
		}, heartbeatMs);
		heartbeat.unref?.();
		const stopHeartbeat = () => clearInterval(heartbeat);
		response.once("close", stopHeartbeat);
		return {
			signal: controller.signal,
			controller,
			get cancelled() { return entry.cancelled; },
			close() {
				stopHeartbeat();
				response.off("close", stopHeartbeat);
				if (active.get(id) === entry) active.delete(id);
			}
		};
	}
	function cancel(id) {
		const entry = active.get(id);
		if (!entry) {
			// Stop can arrive before the streaming POST finishes admission.
			pendingCancellations.set(id, Date.now() + 30000);
			while (pendingCancellations.size > maxActive * 4) pendingCancellations.delete(pendingCancellations.keys().next().value);
			return false;
		}
		entry.cancelled = true;
		entry.controller.abort(failure("stream_cancelled", "Generation was cancelled."));
		return true;
	}
	return { open, cancel, size: () => active.size, close: () => { for (const id of active.keys()) cancel(id); } };
}

function failure(code, message) {
	return Object.assign(new Error(message), { code, retryable: code === "stream_capacity" });
}

module.exports = { createStreamRegistry };
