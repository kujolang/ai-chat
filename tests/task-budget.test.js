const {test}=require('node:test');const assert=require('node:assert/strict');const {taskDeadline,taskBudgetMessage}=require('../lib/task-budget');
test('deadline is optional, validated, and does not reset when elapsed',()=>{
 assert.equal(taskDeadline(undefined),null);for(const value of ['12',0,-1,Infinity,1.5])assert.throws(()=>taskDeadline(value));
 assert.equal(taskDeadline(10000),10000);assert.equal(taskBudgetMessage(null),null);
 assert.match(taskBudgetMessage(10000,8000).content,/2 seconds remain/);
 assert.match(taskBudgetMessage(10000,11000).content,/0 seconds remain/);
 assert.match(taskBudgetMessage(10000,8000).content,/calibrate/);
});
