const test=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../scripts/report-kujo-scripts');
test('script report separates provider failure from delivered code correctness',()=>{
 const result=summarize({models:[{id:'present',available:true,free:true},{id:'absent',available:false,free:false}]},{},{rows:[
  {model:'present',task:'statistics',transport_ok:true,complete:true,passed:31,checks:31},
  {model:'present',task:'unique',transport_ok:true,complete:false,passed:10,checks:31},
  {model:'present',task:'rotate',transport_ok:false,complete:false,passed:0,checks:31,error:'Provider returned HTTP 404'}
 ]});
 assert.equal(result[0].attempted,3);assert.equal(result[0].delivered,2);
 assert.equal(result[0].full_tasks,1);assert.equal(result[0].passed_checks,41);
 assert.equal(result[0].delivered_checks,62);assert.equal(result[0].all_checks,93);
 assert.equal(result[0].errors.length,1);assert.equal(result[1].attempted,0);
 assert.equal(result[1].tasks[0].status,'not dispatched');
});
