#!/usr/bin/env node
// Controller-only cases. Development feedback may be shown; holdout cases may not.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const ok=(id,input,expected)=>({id,input,expected}),bad=(id,input)=>({id,input,reject:true});
const cases={
 1:{development:[ok('explicit-values',{enabled:false,retries:0,label:''},{enabled:false,retries:0,label:''}),bad('reject-unknown',{extra:1})],holdout:[ok('defaults',{}, {enabled:true,retries:3,label:'default'}),ok('partial',{label:'雪'},{enabled:true,retries:3,label:'雪'}),...['enabled','retries','label'].map(k=>bad('null-'+k,{[k]:null})),bad('bool-count',{retries:true}),bad('fraction',{retries:1.5}),bad('too-many',{retries:11})]},
 2:{development:[ok('last-page',{items:[2,3,4],offset:1,limit:2},{items:[3,4],total:3,next:-1}),ok('zero-limit',{items:[5],limit:0},{items:[],total:1,next:0})],holdout:[ok('empty',{items:[]},{items:[],total:0,next:-1}),ok('middle',{items:[8,8,-1,2],offset:1,limit:2},{items:[8,-1],total:4,next:3}),ok('end-offset',{items:[4],offset:1,limit:10},{items:[],total:1,next:-1}),bad('offset-past-end',{items:[],offset:1}),bad('bool-offset',{items:[1],offset:false}),bad('invalid-item',{items:[true]}),bad('over-bound',{items:Array(5001).fill(0)})]},
 3:{development:[bad('transient-underflow',{stock:{a:2},changes:[{sku:'a',delta:-3},{sku:'a',delta:3}]}),ok('ordered',{stock:{a:3,b:4},changes:[{sku:'a',delta:2},{sku:'a',delta:-1}]},{stock:{a:4,b:4}})],holdout:[bad('late-failure',{stock:{a:9},changes:[{sku:'a',delta:1},{sku:'a',delta:-11}]}),bad('unknown-sku',{stock:{a:0},changes:[{sku:'b',delta:0}]}),bad('boolean-delta',{stock:{a:2},changes:[{sku:'a',delta:true}]}),bad('upper-bound',{stock:{a:1000},changes:[{sku:'a',delta:1}]}),ok('edges',{stock:{a:1000,b:0},changes:[{sku:'a',delta:-1000},{sku:'b',delta:1000}]},{stock:{a:0,b:1000}}),bad('unknown-change-field',{stock:{a:2},changes:[{sku:'a',delta:0,extra:1}]}),ok('empty-batch',{stock:{},changes:[]},{stock:{}})]},
 4:{development:[ok('false-and-empty',{version:1,rows:[{id:'a',name:'',active:false,meta:{tag:[1]}}]},{version:2,rows:[{id:'a',label:'',active:false,meta:{tag:[1]}}]}),bad('duplicate-id',{version:1,rows:[{id:'a',name:'x'},{id:'a',name:'y'}]})],holdout:[ok('defaults',{version:1,rows:[{id:'z',name:'雪'}]},{version:2,rows:[{id:'z',label:'雪',active:true,meta:{}}]}),ok('idempotent-v2',{version:2,rows:[{id:'q',label:'x',active:false,meta:{a:{b:[false,0,null]}}}]},{version:2,rows:[{id:'q',label:'x',active:false,meta:{a:{b:[false,0,null]}}}]}),bad('v2-missing-active',{version:2,rows:[{id:'x',label:'a',meta:{}}]}),bad('boolean-version',{version:true,rows:[]}),bad('row-unknown',{version:1,rows:[{id:'a',name:'x',extra:0}]}),bad('invalid-meta',{version:1,rows:[{id:'a',name:'x',meta:[]}]}),ok('empty',{version:1,rows:[]},{version:2,rows:[]})]},
 5:{development:[{id:'conflict',state:{revision:1,label:'old',meta:{}},input:{expected:0,label:'new'},reject:true},{id:'blocked-parent',state:{revision:1,label:'old',meta:{}},input:{expected:1,label:'new'},blocked:true,reject:true},{id:'normal-save',state:{revision:1,label:'old',meta:{}},input:{expected:1,label:''},expected:{revision:2,label:'',meta:{}}}],holdout:[{id:'same-file',same:true,state:{revision:999,label:'old',meta:{x:[false,0]}},input:{expected:999,label:'雪'},expected:{revision:1000,label:'雪',meta:{x:[false,0]}}},{id:'bool-expected',state:{revision:0,label:'old',meta:{}},input:{expected:false,label:'x'},reject:true},{id:'unknown-patch',state:{revision:2,label:'old',meta:{}},input:{expected:2,label:'x',extra:1},reject:true},{id:'invalid-source',state:{revision:1000,label:'old',meta:{}},input:{expected:1000,label:'x'},reject:true},{id:'invalid-label',state:{revision:2,label:'old',meta:{}},input:{expected:2,label:0},reject:true},{id:'broken-source',rawState:'{',input:{expected:0,label:'x'},reject:true}]},
 6:{development:[ok('embedded-quote',{rows:[{name:'a"b',note:'x,y'}],header:false},{csv:'"a""b","x,y"\r\n'}),ok('empty-no-header',{rows:[],header:false},{csv:''})],holdout:[ok('unicode-newlines',{rows:[{name:'雪\nline',note:'\r"Q"'},{name:'=1+1',note:''}]},{csv:'"name","note"\r\n"雪\nline","\r""Q"""\r\n"=1+1",""\r\n'}),ok('header-only',{rows:[]},{csv:'"name","note"\r\n'}),bad('false-is-not-string',{rows:[{name:false,note:''}]}),bad('header-not-bool',{rows:[],header:0}),bad('unknown-row',{rows:[{name:'x',note:'y',extra:1}]}),bad('too-many',{rows:Array.from({length:1001},()=>({name:'',note:''}))})]}
};
function verify(file,task,phase,binary,{deadline=Date.now()+120000}={}){
 if(!['development','holdout'].includes(phase)||!cases[task])throw Error('Choose a known task and phase');
 const failures=[],results=[];let completed=true;
 const hash=()=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 let before;try{if(!fs.lstatSync(file).isFile())throw Error('not regular');before=hash();}catch{return {completed:false,failures:[{id:'missing-source',actual:'No regular main.kujo'}],results};}
 for(const c of cases[task][phase]){
  if(Date.now()>=deadline){completed=false;break;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-maintenance-'));
  let actual={};
  try{
   const source=path.join(dir,'source.json'),dest=c.same?source:c.blocked?path.join(dir,'blocked','target.json'):path.join(dir,'dest.json');
   const original=c.rawState??JSON.stringify(c.state);if(task===5){fs.writeFileSync(source,original);fs.writeFileSync(path.join(dir,'blocked'),'not a directory');if(!c.same&&!c.blocked)fs.writeFileSync(dest,'previous destination');}
   const args=task===5?[source,dest,JSON.stringify(c.input)]:[JSON.stringify(c.input)];
   const r=spawnSync(binary,['run',path.resolve(file),'--',...args],{cwd:dir,encoding:'utf8',timeout:Math.max(1,Math.min(5000,deadline-Date.now())),maxBuffer:256*1024,killSignal:'SIGKILL',detached:process.platform!=='win32'});
   if(process.platform!=='win32'&&r.pid)try{process.kill(-r.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}
   actual={status:r.status,stdout:(r.stdout||'').slice(0,1800),stderr:(r.stderr||'').slice(0,1000),...(r.error?{process_error:r.error.code}: {})};
   assert.ifError(r.error);assert.equal(r.signal,null);
   if(c.reject){assert.equal(r.status,1);assert.equal(r.stdout,'');const e=JSON.parse(r.stderr);assert.deepEqual(Object.keys(e),['error']);assert.ok(typeof e.error==='string'&&e.error.trim());}
   else{assert.equal(r.status,0);assert.equal(r.stderr,'');assert.deepEqual(JSON.parse(r.stdout),c.expected);}
   if(task===5){if(!c.same||c.reject)assert.equal(fs.readFileSync(source,'utf8'),original);if(!c.reject)assert.deepEqual(JSON.parse(fs.readFileSync(dest,'utf8')),c.expected);else if(!c.same&&!c.blocked)assert.equal(fs.readFileSync(dest,'utf8'),'previous destination');}
   assert.equal(hash(),before,'Candidate changed during verification');results.push({id:c.id,passed:true});
  }catch(e){const failure={id:c.id,input:task===5?{patch:c.input,source:c.rawState??c.state,destination:c.blocked?'parent is a regular file':c.same?'same as source':'existing owned file'}:c.input,expected:c.reject?{exit:1,stdout:'',stderr:{error:'nonempty string'},state:'unchanged'}:c.expected,actual,reason:String(e.message).slice(0,300)};failures.push(failure);results.push({id:c.id,passed:false});}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 try{if(hash()!==before)completed=false;}catch{completed=false;}
 return {completed,checks:results.length,passed:results.filter(r=>r.passed).length,failures,results,source_sha256:before};
}
if(require.main===module){const [file,task,phase,binary]=process.argv.slice(2);const r=verify(file,Number(task),phase,binary);console.log(JSON.stringify(r,null,2));process.exitCode=r.completed&&!r.failures.length?0:1;}
module.exports={verify,cases};
