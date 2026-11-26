// Frames are durable in the execution journal before entering this queue.
// Disconnect slow readers rather than retain unbounded buffers. They can
// replay from their last persisted event sequence without rerunning work.
function createSseWriter(response, { maxBytes = 256 * 1024, onOverflow = () => {} } = {}) {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("Invalid SSE byte limit");
	const queue = [];
	const waiters = new Set();
	let bytes = 0;
	let blocked = false;
	let ending = false;
	let closed = false;
	let terminal = false;
	let terminalWriting = false;
	let peakBytes = 0;
	let bufferedPeakBytes = 0;
	const pendingBytes = () => bytes + Number(response.writableLength || 0);
	const unavailable = () => closed || response.destroyed || response.writableEnded;
	const notify = () => { for (const check of waiters) check(); };
	function flush() {
		if (closed || blocked) return;
		while (queue.length) {
			const { frame, size } = queue.shift();
			bytes -= size;
			if (!response.write(frame, notify)) { blocked = true; break; }
		}
		if (ending && !terminalWriting && queue.length === 0 && !blocked) response.end();
	}
	function enqueue(frame) {
		if (unavailable()) return false;
		const size = Buffer.byteLength(frame);
		const nextBytes = pendingBytes() + size;
		peakBytes = Math.max(peakBytes, nextBytes);
		if (nextBytes > maxBytes) {
			closed = true;
			queue.length = 0;
			bytes = 0;
			try {
				onOverflow({ max_bytes: maxBytes, attempted_bytes: nextBytes });
			} finally {
				response.destroy();
			}
			return false;
		}
		bufferedPeakBytes = Math.max(bufferedPeakBytes, nextBytes);
		queue.push({ frame, size });
		bytes += size;
		flush();
		return true;
	}
	function ready(signal, requireRoom) {
		const canWrite = () => !blocked && queue.length === 0 && (!requireRoom || pendingBytes() < maxBytes);
		if (unavailable() || signal?.aborted) return Promise.resolve(false);
		if (canWrite()) return Promise.resolve(true);
		return new Promise(resolve => {
			const check = () => {
				const stopped = unavailable() || signal?.aborted;
				if (!stopped && !canWrite()) return;
				waiters.delete(check);
				signal?.removeEventListener("abort", check);
				resolve(!stopped);
			};
			waiters.add(check);
			signal?.addEventListener("abort", check, { once: true });
			check();
		});
	}
	// One already-materialized terminal payload may exceed the socket queue budget.
	// Send its bytes incrementally, retaining the original SSE framing and fields.
	// No later frame (including a heartbeat) may interleave with this terminal frame.
	async function writeTerminal(frame, { signal } = {}) {
		if (terminal || unavailable()) return false;
		terminal = true;
		terminalWriting = true;
		try {
			const data = Buffer.from(frame);
			let offset = 0;
			while (offset < data.length) {
				if (!await ready(signal, true) || signal?.aborted) return false;
				const end = Math.min(data.length, offset + 16 * 1024, offset + maxBytes - pendingBytes());
				if (!enqueue(data.subarray(offset, end))) return false;
				offset = end;
			}
			return await ready(signal, false);
		} finally {
			terminalWriting = false;
			if (signal?.aborted && !response.destroyed) response.destroy();
			flush();
		}
	}
	const onDrain = () => { blocked = false; flush(); notify(); };
	const onClose = () => { closed = true; queue.length = 0; bytes = 0; response.off("drain", onDrain); notify(); };
	response.on("drain", onDrain);
	response.once("close", onClose);
	return { write: frame => !terminal && enqueue(frame), writeTerminal, end() { ending = true; flush(); }, metrics: () => ({ queued_bytes: bytes, pending_bytes: pendingBytes(), peak_bytes: peakBytes, buffered_peak_bytes: bufferedPeakBytes, blocked, closed }) };
}
module.exports = { createSseWriter };
