#!/usr/bin/env node
// Provider-free diagnostic. The delay deliberately exceeds the fixture's inbound
// header deadline; it models long inference, not a retry or production sleep.
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {once}=require('node:events');
(async()=>{
 const binary=process.argv[2];if(!binary)throw Error('Pass an explicit qualified Kujo executable');
 const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-keepalive-'));const file=path.join(dir,'server.kujo');
 fs.writeFileSync(file,`server := http_server(${port})\nserver = server.route("GET", "/ready", func(req) { return http_response(200, "ready") })\nserver = server.route("POST", "/slow", func(req) { sleep(400) return http_response(200, "ok") })\nserver.listen()\n`);
 const child=spawn(binary,['run',file,'--interpreter','--allow-net-server','--allow-clock'],{env:{...process.env,KUJO_HTTP_SERVER_READ_TIMEOUT_MS:'100'},stdio:'ignore'});
 const invoke=(agent,route='/slow')=>new Promise(resolve=>{const req=http.request(`http://127.0.0.1:${port}${route}`,{method:route==='/ready'?'GET':'POST',agent,headers:{'Content-Length':route==='/ready'?'0':'2'}},r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>resolve({status:r.statusCode,body}));r.on('error',e=>resolve({error:e.code}));});req.on('error',e=>resolve({error:e.code}));req.setTimeout(2000,()=>req.destroy(Error('fixture timeout')));req.end(route==='/ready'?'':'{}');});
 try {
  const deadline=Date.now()+5000;let ready=false;
  while(Date.now()<deadline){if((await invoke(false,'/ready')).status===200){ready=true;break;}await new Promise(r=>setTimeout(r,20));}
  if(!ready)throw Error('Fixture did not become ready');
  const reports=[];
  for(const fresh of [false,true]) {const agent=fresh?false:new http.Agent({keepAlive:true,maxSockets:1});const results=[];for(let i=0;i<4;i++)results.push(await invoke(agent));if(agent)agent.destroy();reports.push({fresh_connection:fresh,results});}
  console.log(JSON.stringify({scope:'Synthetic local Kujo server; no provider requests or credentials.',reports},null,2));
  if(reports[1].results.some(r=>r.status!==200))process.exitCode=1;
 }finally{child.kill('SIGTERM');await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
