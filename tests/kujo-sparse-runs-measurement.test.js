const {test}=require('node:test');const assert=require('node:assert/strict');
const {measure}=require('../scripts/measure-kujo-sparse-runs');
test('sparse measurement verifies all output, failures and actual entry-point arguments',()=>{
 let calls=0;
 const good=measure('runtime','candidate.kujo',(_bin,args)=>{
  calls++;assert.deepEqual(args.slice(0,3),['run','candidate.kujo','--']);
  const values=JSON.parse(args[3]);return{status:0,stdout:JSON.stringify(values.map(x=>[x,x])),stderr:''};
 });assert.equal(good.passed,true);assert.equal(calls,9);
 for(const result of [{status:0,stdout:'[]',stderr:''},{status:0,stdout:'[[0,0]]',stderr:''},{status:null,stdout:'',stderr:'',signal:'SIGTERM'}])assert.equal(measure('runtime','candidate.kujo',()=>result).passed,false);
});
