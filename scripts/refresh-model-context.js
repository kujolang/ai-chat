// Refresh all configured profiles through the authenticated local server. Never
// read/decrypt provider credentials here or alter profiles/model selections.
const fs = require('node:fs');
const { readBoundedResponse } = require('../lib/bounded-response');
async function main() {
 let token = process.env.API_AUTH_TOKEN;
 if (!token && fs.existsSync('.env')) {
  const line = fs.readFileSync('.env','utf8').split(/\r?\n/).find(line => /^API_AUTH_TOKEN=/.test(line));
  token = line?.slice('API_AUTH_TOKEN='.length).trim().replace(/^(['"])(.*)\1$/, '$2');
 }
 if (!token) throw Error('API_AUTH_TOKEN is required.');
 const url = new URL(process.env.AI_CHAT_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4173}`);
 if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error('Use a loopback AI_CHAT_BASE_URL.');
 const response = await fetch(new URL('/api/model-context/refresh',url), {method:'POST',headers:{'X-API-Token':token},redirect:'error',signal:AbortSignal.timeout(300000)});
 const result = JSON.parse(await readBoundedResponse(response,8*1024*1024,'context_report_too_large'));
 if (!response.ok || !result.ok) throw Error(result.error?.message || 'Context refresh failed.');
 const known = result.models.filter(row => row.known).length;
 console.log(`Context coverage: ${known}/${result.models.length} configured model selections verified or explicitly configured.`);
 for (const row of result.models.filter(row => !row.known)) console.log(`Unknown: ${row.provider_id} / ${row.model} (${row.window_tokens} fallback)`);
 if (process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{mode:0o600});
}
if (require.main === module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
