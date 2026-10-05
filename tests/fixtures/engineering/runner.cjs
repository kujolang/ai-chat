const {spawn}=require('node:child_process');
async function run(file,args,{signal,maxBytes=65536}={}){
 if(!Number.isInteger(maxBytes)||maxBytes<1)throw new TypeError('maxBytes');
 const failure=code=>Object.assign(Error(code),{code});if(signal?.aborted)throw failure('ABORT_ERR');
 return new Promise((resolve,reject)=>{let child,error,timer,total=0;const out=[],err=[];
  const terminate=code=>{if(error)return;error=failure(code);child.kill('SIGTERM');timer=setTimeout(()=>child.kill('SIGKILL'),250);};
  const abort=()=>terminate('ABORT_ERR');
  try{child=spawn(file,args,{shell:false,stdio:['ignore','pipe','pipe']});}catch(e){reject(e);return;}
  child.once('error',e=>error ||= e);
  for(const [stream,chunks] of [[child.stdout,out],[child.stderr,err]])stream.on('data',chunk=>{total+=chunk.length;if(total>maxBytes)terminate('OUTPUT_LIMIT');else chunks.push(chunk);});
  child.once('close',(code)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve({code,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')});});
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}
module.exports={run};
