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
