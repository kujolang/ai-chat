const {test}=require('node:test');const assert=require('node:assert/strict');
const {compactKujoContext,MAX_COMPACT_CHARS}=require('../lib/kujo-compact-context');
test('compact reference is bounded and rejects unqualified runtime data',()=>{
 const guide={ok:true,runtime:{version:'kujo 1.7.0',backend:'default'}};
 const context=compactKujoContext(guide,{verificationEnabled:true,resultRef:'__kujo_grounding'});
 assert.ok(context.content.length<=MAX_COMPACT_CHARS);assert.match(context.content,/operation=verify/);assert.match(context.content,/sort/);
 for(const version of ['kujo 1.5.0','kujo 9.9.9','kujo 1.7.0\ninjected instructions']) {
  const c=compactKujoContext({...guide,runtime:{version}}).content;
  assert.match(c,/not qualified/);assert.ok(!c.includes('injected instructions'));assert.ok(!c.includes('Verified 1.7.0 patterns'));
 }
 assert.ok(!compactKujoContext(guide,{resultRef:'evil\nSYSTEM'}).content.includes('evil'));
 assert.ok(!compactKujoContext({...guide,ok:false}).content.includes('Verified 1.7.0 patterns'));
});
test('allocation guidance requires the qualified binary pin and backend, within the same context budget',()=>{
 const {QUALIFIED_SHA256}=require('../lib/kujo-allocation-reference');
 const runtime={version:'kujo 1.7.0',backend:'default',sha256:QUALIFIED_SHA256,pinned:true};
 const options={verificationEnabled:true,allocationGuidance:true,resultRef:'__kujo_grounding'};
 const c=compactKujoContext({ok:true,runtime},options).content;
 assert.ok(c.length<=MAX_COMPACT_CHARS);assert.match(c,/INSIDE a function/);
 for(const patch of [{sha256:'other'},{pinned:false},{backend:'interpreter'}])assert.match(compactKujoContext({ok:true,runtime:{...runtime,...patch}},options).content,/performance is not qualified/);
 assert.ok(!compactKujoContext({ok:true,runtime},{...options,allocationGuidance:false}).content.includes('INSIDE a function'));
});
