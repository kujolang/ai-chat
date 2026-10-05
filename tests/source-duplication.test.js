const {test}=require('node:test');const assert=require('node:assert/strict');const {duplicateSpans}=require('../lib/source-duplication');
test('duplicate candidates preserve locations without pretending to parse source semantics',()=>{
 const code=Array.from({length:12},(_,i)=>`let value${i} := meaningful_computation(${i})`).join('\n');
 const result=duplicateSpans([{path:'main.kujo',content:'// entry\n'+code},{path:'helper.kujo',content:code}]);
 assert.equal(result.candidate_spans.length,1);assert.deepEqual(result.candidate_spans[0].locations,[{path:'main.kujo',line:2},{path:'helper.kujo',line:1}]);
 assert.equal(duplicateSpans([{path:'one.kujo',content:code+'\n'+code}]).candidate_spans.length,0);
 assert.equal(duplicateSpans([{path:'a',content:'\n'.repeat(20)},{path:'b',content:'\n'.repeat(20)}]).candidate_spans.length,0);
});
