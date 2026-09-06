const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { createAdmissionController } = require('../lib/admission-controller');

test('cancelled benchmark leaves queue immediately and cannot take the released slot', async () => {
 const queue = createAdmissionController({maxInflight:1,maxQueue:2,queueTimeoutMs:1000,nowMs:Date.now});
 const first = await queue.acquire();
 const cancelled = new AbortController();
 const pending = queue.acquire({signal:cancelled.signal});
 const rejection = assert.rejects(pending,{message:'stop'});
 const last = queue.acquire();
 assert.equal(queue.snapshot().queued,2);
 cancelled.abort(new Error('stop'));
 await rejection;
 assert.equal(queue.snapshot().queued,1);
 assert.equal(getEventListeners(cancelled.signal,'abort').length,0);
 first.release(); first.release();
 const admitted = await last;
 assert.equal(queue.snapshot().active,1);
 admitted.release();
 assert.equal(queue.snapshot().active,0);
 assert.equal(queue.snapshot().queued,0);
});

test('benchmark timeout and already-aborted admission release listeners and capacity', async () => {
 const queue=createAdmissionController({maxInflight:1,maxQueue:1,queueTimeoutMs:10,nowMs:Date.now});
 const cancelled=new AbortController();cancelled.abort(new Error('before admission'));
 await assert.rejects(queue.acquire({signal:cancelled.signal}),/before admission/);
 assert.equal(queue.snapshot().active,0);
 const first=await queue.acquire();
 const waiting=new AbortController();
 await assert.rejects(queue.acquire({signal:waiting.signal}),{code:'benchmark_queue_timeout'});
 assert.equal(getEventListeners(waiting.signal,'abort').length,0);
 assert.equal(queue.snapshot().queued,0);
 first.release();
});
