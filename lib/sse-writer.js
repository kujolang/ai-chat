// Frames are durable in the execution journal before entering this queue.
// Disconnect slow readers rather than retain unbounded buffers. They can
// replay from their last persisted event sequence without rerunning work.
function createSseWriter(response, { maxBytes = 256 * 1024, onOverflow = () => {} } = {}) {
	const queue = [];
	let bytes = 0;
	let blocked = false;
	let ending = false;
	let closed = false;
	let peakBytes = 0;
	let bufferedPeakBytes = 0;
	function flush() {
		if (closed || blocked) return;
		while (queue.length) {
			const frame = queue.shift();
			bytes -= Buffer.byteLength(frame);
			if (!response.write(frame)) { blocked = true; break; }
		}
		if (ending && queue.length === 0 && !blocked) response.end();
	}
	function write(frame) {
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
	const onDrain = () => { blocked = false; flush(); };
	const onClose = () => { closed = true; queue.length = 0; bytes = 0; response.off("drain", onDrain); };
	response.on("drain", onDrain);
	response.once("close", onClose);
	return { write, end() { ending = true; flush(); }, metrics: () => ({ queued_bytes: bytes, pending_bytes: bytes + Number(response.writableLength || 0), peak_bytes: peakBytes, buffered_peak_bytes: bufferedPeakBytes, blocked, closed }) };
}
module.exports = { createSseWriter };
