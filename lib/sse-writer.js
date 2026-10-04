// Frames are durable in the execution journal before entering this queue.
// Disconnect slow readers rather than retain unbounded buffers. They can
// replay from their last persisted event sequence without rerunning work.
function createSseWriter(response, { maxBytes = 256 * 1024, onOverflow = () => {} } = {}) {
	const queue = [];
	let bytes = 0;
	let blocked = false;
	let ending = false;
	let closed = false;
	let terminal = false;
	let terminalWriting = false;
	let peakBytes = 0;
	let bufferedPeakBytes = 0;
	function flush() {
		if (closed || blocked) return;
		while (queue.length) {
			const frame = queue.shift();
			bytes -= Buffer.byteLength(frame);
			if (!response.write(frame)) { blocked = true; break; }
		}
		if (ending && !terminalWriting && queue.length === 0 && !blocked) response.end();
	}
	function enqueue(frame) {
		if (closed || response.destroyed || response.writableEnded) return false;
		const nextBytes = bytes + Buffer.byteLength(frame) + Number(response.writableLength || 0);
		peakBytes = Math.max(peakBytes, nextBytes);
		if (nextBytes > maxBytes) {
			onOverflow({ max_bytes: maxBytes, attempted_bytes: nextBytes });
			closed = true;
			queue.length = 0;
			bytes = 0;
			response.destroy();
			return false;
		}
		bufferedPeakBytes = Math.max(bufferedPeakBytes, nextBytes);
		queue.push(frame);
		bytes += Buffer.byteLength(frame);
		flush();
		return true;
	}
	function ready(signal) {
		if (closed || response.destroyed || signal?.aborted) return Promise.resolve(false);
		if (!blocked && queue.length === 0) return Promise.resolve(true);
		return new Promise(resolve => {
			const cleanup = () => {
				response.off("drain", check); response.off("close", check);
				signal?.removeEventListener("abort", check);
			};
			const check = () => {
				if (closed || response.destroyed || signal?.aborted) { cleanup(); resolve(false); }
				else if (!blocked && queue.length === 0) { cleanup(); resolve(true); }
			};
			response.on("drain", check); response.on("close", check);
			signal?.addEventListener("abort", check, { once: true });
			check();
		});
	}
	// One already-materialized terminal payload may exceed the socket queue budget.
	// Send its bytes incrementally, retaining the original SSE framing and fields.
	// No later frame (including a heartbeat) may interleave with this terminal frame.
	async function writeTerminal(frame, { signal } = {}) {
		if (terminal || closed || response.writableEnded) return false;
		terminal = true;
		terminalWriting = true;
		try {
			if (!await ready(signal)) return false;
			const data = Buffer.from(frame);
			const chunkBytes = Math.min(16 * 1024, maxBytes);
			for (let offset = 0; offset < data.length; offset += chunkBytes) {
				if (signal?.aborted || !enqueue(data.subarray(offset, offset + chunkBytes))) return false;
				if (!await ready(signal)) return false;
			}
			return true;
		} finally {
			terminalWriting = false;
			if (signal?.aborted && !response.destroyed) response.destroy();
			flush();
		}
	}
	const onDrain = () => { blocked = false; flush(); };
	const onClose = () => { closed = true; queue.length = 0; bytes = 0; response.off("drain", onDrain); };
	response.on("drain", onDrain);
	response.once("close", onClose);
	return { write: frame => !terminal && enqueue(frame), writeTerminal, end() { ending = true; flush(); }, metrics: () => ({ queued_bytes: bytes, pending_bytes: bytes + Number(response.writableLength || 0), peak_bytes: peakBytes, buffered_peak_bytes: bufferedPeakBytes, blocked, closed }) };
}
module.exports = { createSseWriter };
