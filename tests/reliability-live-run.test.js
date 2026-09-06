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

test('custom live targets reference credentials without admitting secrets to manifests',()=>{
 const {validateTargets}=require('../scripts/reliability-live-run');
 const targets=[{provider:'custom',model:'model',family:'family',base_url:'https://example.com/v1',api_key_env:'LIVE_KEY'},{provider:'xai_oauth',model:'grok',family:'grok'}];
 assert.equal(validateTargets(targets)[0].api_key_env,'LIVE_KEY');
 assert.throws(()=>validateTargets([{...targets[0],api_key:'secret'},targets[1]]),/Unknown target field/);
 assert.throws(()=>validateTargets([{...targets[0],base_url:'https://user:secret@example.com/v1'},targets[1]]),/embedded credentials/);
 assert.throws(()=>validateTargets([{...targets[0],base_url:'http://example.com/v1'},targets[1]]),/HTTPS/);
 assert.throws(()=>validateTargets([targets[0],{...targets[1],family:'family'}]),/model families/);
});

test('failed live requests retain reported round usage without persisting raw text',async()=>{
 const {scoreEvidence}=require('../scripts/reliability-live-run');
 const result=await consume(new Response('event: error\ndata: {"code":"provider_http_error","status":503,"provider_rounds":2,"usage_reported_rounds":1,"usage_complete":false,"usage":{"input_tokens":12,"cost":0.2}}\n\n'),new AbortController().signal,Date.now());
 assert.equal(result.error_payload.provider_rounds,2);
 assert.equal(result.error_payload.usage.input_tokens,12);
 assert.equal(result.error_payload.usage_complete,false);
 const score=scoreEvidence({name:'local-report',expected:'146',expected_file:'orders.csv',required:'local_file_read'},'{"total_revenue":146,"source":"orders.csv"}',[]);
 assert.equal(score.expected_value_present,true);assert.equal(score.revenue_field_matches,false);assert.equal(score.required_tool_completed,false);
 assert.ok(!JSON.stringify(score).includes('total_revenue'));
});
