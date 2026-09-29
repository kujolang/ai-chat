const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {once} = require('node:events');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const root=process.cwd();
const data=fs.mkdtempSync('/tmp/ai-chat-hardening-smoke-');
const env={ENCRYPTION_SECRET:'hardening-fixture-encryption-only',API_AUTH_TOKEN:'hardening-fixture-token-only',AI_CHAT_HOST:'127.0.0.1',PORT:'0',DB_PATH:path.join(data,'db.sqlite'),DB_BACKUP_DIR:path.join(data,'backups'),AUDIT_LOG_PATH:path.join(data,'audit.log'),BENCHMARK_OUTPUT_DIR:path.join(data,'benchmarks'),BROWSER_ARTIFACT_DIR:path.join(data,'browser'),BROWSER_ENABLED:'1',AI_CHAT_SKILLS_ENABLED:'0',AI_CHAT_LOCAL_TOOLS_ENABLED:'0',CODEX_MODEL_CACHE_PATH:path.join(data,'missing-cache'),KUJO_BIN:path.resolve(root,'../kujo/target/release/kujo'),AI_SDK_PATH:path.resolve(root,'../ai-sdk/src')};
const runtime=require(root+'/lib/server-runtime').createServerRuntime({projectRoot:root,env});
const server=http.createServer(runtime.app);
(async()=>{
 try {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const smokeEnv={PATH:process.env.PATH,API_AUTH_TOKEN:env.API_AUTH_TOKEN,SMOKE_BASE_URL:`http://127.0.0.1:${server.address().port}`};
  for(const browser of ['0','1']) { const result=await promisify(execFile)(process.execPath,['scripts/smoke-test.js'],{env:{...smokeEnv,BROWSER_EXPECTED:browser},timeout:60000}); console.log(`browser_expected=${browser}\n${result.stdout}`); }
  await runtime.close();
  for(const file of ['scripts/backup-db.js','scripts/vacuum-db.js']) {const result=await promisify(execFile)(process.execPath,[file],{env:{PATH:process.env.PATH,DB_PATH:env.DB_PATH,DB_BACKUP_DIR:env.DB_BACKUP_DIR}}); console.log(result.stdout.trim());}
 } finally {await runtime.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message,error.stdout||'',error.stderr||'');process.exitCode=1;});
