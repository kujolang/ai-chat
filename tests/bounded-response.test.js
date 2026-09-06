const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readBoundedResponse } = require('../lib/bounded-response');

test('upstream body limit cancels reading before the remainder is buffered', async () => {
 let reads=0, cancelled=false;
 const response={body:{getReader:()=>({
  read:async()=>{reads++;return {done:false,value:Buffer.alloc(64)};},
  cancel:async()=>{cancelled=true;},releaseLock:()=>{}
 })}};
 await assert.rejects(readBoundedResponse(response,100,'fixture_too_large'),{code:'fixture_too_large',retryable:false});
 assert.equal(reads,2);
 assert.equal(cancelled,true);
});

test('bounded upstream decoding preserves multibyte characters across chunks', async () => {
 const bytes=Buffer.from('hello 🌍');
 let offset=0;
 const response={body:{getReader:()=>({
  read:async()=>offset===bytes.length?{done:true}:{done:false,value:bytes.subarray(offset,++offset)},
  cancel:async()=>{},releaseLock:()=>{}
 })}};
 assert.equal(await readBoundedResponse(response,bytes.length,'too_large'),'hello 🌍');
});
