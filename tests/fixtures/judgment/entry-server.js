// Test-only reference and deliberate mutant for the independent HTTP oracle.
const fs=require('node:fs'),http=require('node:http');const file=process.argv[process.argv.indexOf('--file')+1];
let state={entries:{}};try{if(fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));if(!state||Object.keys(state).join(',')!=='entries'||!state.entries||Array.isArray(state.entries)||Object.entries(state.entries).some(([k,v])=>!/^[a-z][a-z0-9_]{0,31}$/.test(k)||typeof v!=='string'||v.length>128))throw Error();}catch{process.exit(1);}
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
const server=http.createServer((req,res)=>{
 if(req.url!=='/entries')return send(res,404,{error:'not found'});
 if(req.method==='GET')return send(res,200,state);
 if(req.method!=='POST')return send(res,404,{error:'not found'});
 let text='';req.on('data',d=>text+=d);req.on('end',()=>{
  let body;try{body=JSON.parse(text);if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='key,value'||typeof body.key!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(body.key)||typeof body.value!=='string'||body.value.length>128)throw Error();}catch{return send(res,400,{error:'bad input'});}
  const next={entries:{...state.entries,[body.key]:body.value}};
  if(process.env.JUDGMENT_MUTATION==='memory')state=next;
  const temp=file+'.owned-tmp';try{fs.writeFileSync(temp,JSON.stringify(next),{flag:'wx'});fs.renameSync(temp,file);state=next;send(res,200,state);}catch{send(res,500,{error:'write failed'});}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 });
});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
