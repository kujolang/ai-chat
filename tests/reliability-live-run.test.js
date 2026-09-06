const {test}=require('node:test');
const assert=require('node:assert/strict');
const {options,summarize,consume}=require('../scripts/reliability-live-run');

test('live validation refuses short soak substitutes and preserves absent billing evidence',()=>{
 assert.throws(()=>options(['--mode','soak','--targets','models.json','--output','fresh','--hours','1']),/8–24/);
 const report=summarize([{provider:'p',model:'m',discovery:true,terminal:'done',correct:true,rounds:3,usage:{input_tokens:12,output_tokens:4},reported_cost:null,duration_ms:900,discovery_loaded:2,discovery_relevant:1}],60000,'soak');
 assert.equal(report.all_day_elapsed,false);
 assert.equal(report.groups['p:m:deferred'].reported_cost_total,null);
 assert.equal(report.groups['p:m:deferred'].input_tokens,12);
 assert.equal(report.groups['p:m:deferred'].discovery_precision,0.5);
});

test('live evidence parser requires terminal evidence across split UTF-8 frames',async()=>{
 const text='event: token\ndata: {"delta":"café"}\n\nevent: done\ndata: {"provider_rounds":2}\n\n';
 const bytes=new TextEncoder().encode(text);
 const response=new Response(new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}}));
 const result=await consume(response,new AbortController().signal,Date.now());
 assert.equal(result.text,'café');assert.equal(result.terminal,'done');assert.equal(result.done.provider_rounds,2);
 const missing=await consume(new Response('event: token\ndata: {"delta":"partial"}\n\n'),new AbortController().signal,Date.now());
 assert.equal(missing.terminal,'eof');
});

test('live scoring rejects guessed revenue and screenshot claims without receipts',()=>{
 const {scoreTask}=require('../scripts/reliability-live-run');
 const report={name:'local-report',expected:'146',expected_file:'orders-fixture.csv',required:'local_file_read'};
 const calls=[{tool_name:'local_file_read',status:'completed',result:{ok:true}}];
 assert.equal(scoreTask(report,'{"revenue":1146,"source":"orders-fixture.csv"}',calls,''),false);
 assert.equal(scoreTask(report,'{"revenue":146,"source":"orders-fixture.csv"}',calls,''),true);
 assert.equal(scoreTask(report,'{"revenue":146,"source":"orders-fixture.csv"}',[],''),false);
 assert.equal(scoreTask({name:'rendered-evidence',expected:'sample',required:'browser_act'},'sample screenshot', [{tool_name:'browser_act',status:'completed',result:{ok:true}}],''),false);
});
