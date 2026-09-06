const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createStreamRegistry } = require('../lib/stream-lifecycle');

function response() {
 const res = new EventEmitter();
 res.writes = [];
 res.write = text => { res.writes.push(text); res.emit('heartbeat'); };
 return res;
}

test('stream registry distinguishes detach from cancellation and releases capacity', async () => {
 const registry = createStreamRegistry({maxActive:1,heartbeatMs:10});
 const res = response();
 const entry = registry.open('one',res);
 try {
  await new Promise(resolve => {res.once('heartbeat',resolve); setTimeout(resolve,100);});
  assert.equal(res.writes[0], ': heartbeat\n\n');
  assert.throws(()=>registry.open('one',response()), {code:'stream_already_running'});
  assert.throws(()=>registry.open('two',response()), {code:'stream_capacity'});
  res.destroyed = true;
  res.emit('close');
  assert.equal(entry.signal.aborted,false);
  assert.equal(registry.cancel('one'),true);
  assert.equal(entry.cancelled,true);
  assert.equal(entry.signal.reason.code,'stream_cancelled');
 } finally {entry.close();}
 assert.equal(registry.size(),0);
 const next = registry.open('two',response());
 registry.close();
 assert.equal(next.signal.aborted,true);
 next.close();
});

test('Stop received before streaming POST prevents later execution',()=>{
 const registry=createStreamRegistry();
 assert.equal(registry.cancel('pending'),false);
 assert.throws(()=>registry.open('pending',response()),{code:'stream_cancelled'});
 assert.equal(registry.size(),0);
});

test('shutdown checkpoints then drains requests and rejects new admission', async () => {
 const registry=createStreamRegistry();
 const entry=registry.open('drain',response());
 let checkpointed=false;
 entry.onShutdown(()=>{checkpointed=true;});
 const closing=registry.close({timeoutMs:1000});
 assert.equal(checkpointed,true);
 assert.equal(entry.signal.aborted,true);
 assert.throws(()=>registry.open('later',response()),{code:'server_shutting_down'});
 entry.close();
 await closing;
 assert.equal(registry.size(),0);
});

test('non-streaming auxiliary requests have no heartbeat and cancel on disconnect', async () => {
 const registry=createStreamRegistry({heartbeatMs:5});
 const res=response();
 const entry=registry.open('repair',res,{heartbeat:false,cancelOnDisconnect:true});
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.deepEqual(res.writes,[]);
 res.emit('close');
 assert.equal(entry.signal.reason.code,'stream_cancelled');
 entry.close();
 assert.equal(registry.size(),0);
});
