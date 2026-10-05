const {test}=require('node:test');const assert=require('node:assert/strict');
const {tasks,evaluate}=require('../scripts/verify-kujo-collections');
// Independent small-domain frequency table implementation, unlike the grader's sort/Set.
function reference(task,args) {
 try {
  if(args.length!==1)throw Error('arity');const value=JSON.parse(args[0]);let xs=value;
  if(task==='merge') {
   if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='left,right')throw Error('shape');
   for(const a of [value.left,value.right])if(!Array.isArray(a)||a.some((x,i)=>i&&a[i-1]>x))throw Error('order');
   xs=value.left.concat(value.right);
  }
  if(!Array.isArray(xs)||xs.some(x=>!Number.isInteger(x)||x<0||x>1000000))throw Error('number');
  const counts=new Uint32Array(1000001);for(const x of xs)counts[x]++;
  const out=[];for(let x=0;x<counts.length;x++)if(counts[x]) {
   if(task==='merge')out.push(x);
   else if(task==='frequencies')out.push([x,counts[x]]);
   else if(out.length&&out.at(-1)[1]===x-1)out.at(-1)[1]=x;else out.push([x,x]);
  }
  return{status:0,stdout:JSON.stringify(out),stderr:''};
 }catch{return{status:1,stdout:'',stderr:'{"error":"invalid"}'};}
}
test('fresh collection oracles accept independent implementation and reject plausible mutants',()=>{
 for(const task of tasks) {
  const good=evaluate(task,args=>reference(task,args));assert.equal(good.passed,good.checks);
  for(const mutant of [()=>({status:0,stdout:'[]',stderr:''}),args=>reference(task,args.map(x=>x.replace(/true/g,'1'))),args=>({...reference(task,args),stderr:'debug'}),()=>({status:null,signal:'SIGTERM',stdout:'',stderr:''})])assert.ok(evaluate(task,mutant).passed<good.checks);
 }
});
