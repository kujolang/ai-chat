#!/usr/bin/env node
"use strict";
const fs=require('node:fs');
const path=require('node:path');
const {tasks}=require('../lib/kujo-script-benchmark');

function summarize(selection,run,grade){
 return selection.models.map(model=>{
  const rows=grade.rows.filter(r=>r.model===model.id);
  const delivered=rows.filter(r=>r.transport_ok);
  return{model:model.id,catalog_available:model.available,catalog_free:model.free,attempted:rows.length,
   delivered:delivered.length,full_tasks:rows.filter(r=>r.complete).length,
   passed_checks:delivered.reduce((n,r)=>n+r.passed,0),delivered_checks:delivered.reduce((n,r)=>n+r.checks,0),
   all_checks:rows.reduce((n,r)=>n+r.checks,0),
   latency_ms:rows.reduce((n,r)=>n+(r.duration_ms||0),0),
   output_tokens:rows.reduce((n,r)=>n+(r.usage?.output_tokens||0),0),
   errors:rows.filter(r=>!r.transport_ok).map(r=>({task:r.task,error:r.error})),
   tasks:tasks.map(t=>{const row=rows.find(r=>r.task===t.id);return{task:t.id,status:!row?'not dispatched':row.complete?'PASS':row.transport_ok?`${row.passed}/${row.checks}`:row.error};})};
 });
}
function markdown(summary,run,grade){
 const esc=x=>String(x).replace(/\|/g,'\\|').replace(/\n/g,' ');
 const lines=['# Hermes free models: Kujo script benchmark · 2026-10-10','',
  'This is a single-draft, no-tools code-generation sample, not a model ranking or an agentic coding evaluation. Each model received the same Kujo guide and ten task contracts. Returned scripts were executed against frozen independent checks. Provider failures are not evidence of coding inability.','',
  `Run: \`${run.run_id}\`. Runtime SHA-256: \`${grade.runtime_sha256}\`.`,
  `Transport: ${run.summary.completed}/${run.summary.total} completed; ${run.summary.failed} failed. Duration: ${Math.round(run.duration_ms/1000)} seconds. Settings: concurrency 1, one attempt, 6000 response tokens, 240-second deadline per response.`, '',
  '| Model in Hermes profile | Delivered / attempted | Full tasks passed | Checks passed on delivered responses |',
  '|---|---:|---:|---:|'];
 for(const m of summary)lines.push(`| \`${esc(m.model)}\` | ${m.attempted?`${m.delivered}/${m.attempted}`:'Not dispatched: absent from live catalog'} | ${m.attempted?`${m.full_tasks}/10`:'—'} | ${m.delivered_checks?`${m.passed_checks}/${m.delivered_checks}`:'—'} |`);
 lines.push('','A full task pass requires every positive, boundary, invalid-input and CLI-contract check. Partial check counts use only delivered responses; missing responses do not receive invented coding scores. A broken script can pass rejection cases by rejecting everything, so full task passes are the primary measure. The task-pass column uses the requested ten-task workload and must be read alongside delivery.','',
  '| Task | '+summary.filter(m=>m.attempted).map(m=>'`'+m.model+'`').join(' | ')+' |',
  '|---|'+summary.filter(m=>m.attempted).map(()=>'---').join('|')+'|');
 for(const t of tasks)lines.push(`| ${t.title} | ${summary.filter(m=>m.attempted).map(m=>esc(m.tasks.find(r=>r.task===t.id).status)).join(' | ')} |`);
 lines.push('','## Reproduction and evidence','',
  '- Suite and rules: [tasks](../../benchmarks/kujo-scripts.md), [protocol](../../benchmarks/kujo-scripts-protocol.md).',
  '- Benchmark implementation: commit `d660cee`; full repository verification: 765 passed, 2 skipped, 0 failed.',
  '- Calibration: all 311 checks passed on ten known-good controls; all ten constant-null controls were rejected.',
  '- Runtime: qualified Kujo 1.7.0, pinned binary; the older app bridge binary was not used for grading.',
  '- Raw local evidence (ignored): `data/hermes-kujo-scripts-20261010/` contains selection, immutable acceptance hashes, command arguments, run.json, grade.json, source files and chat snapshots.',
  '- Ten comparison chats are saved in AI Chat with title prefix `Hermes Kujo 20261010`.',
  '- No retry, repair, model substitution or post-generation acceptance change was performed.',
  '- Prices were checked before dispatch: eight exact configured IDs were advertised with zero prompt/completion price. Catalog presence did not guarantee a working endpoint.',
  '- The fixed token budget and free-service rate limits constrain this sample. Do not infer general model capability from unavailable, rate-limited, empty or truncated responses.',
  '', '## Saved chat IDs','');
 for(const t of run.tests)lines.push(`- ${t.number}. ${t.title}: \`${t.chat_id}\``);
 return lines.join('\n')+'\n';
}
if(require.main===module){
 const root=path.resolve(process.argv[2]||'data/hermes-kujo-scripts-20261010');
 const selection=JSON.parse(fs.readFileSync(path.join(root,'selection.json')));
 const run=JSON.parse(fs.readFileSync(path.join(root,'run.json')));
 const grade=JSON.parse(fs.readFileSync(path.join(root,'grade.json')));
 if(!run.finished_at||grade.rows.length!==run.summary.total)throw Error('Run or grading is incomplete');
 const summary=summarize(selection,run,grade);
 const destination=path.resolve(process.argv[3]||'docs/benchmarks/hermes-kujo-scripts-2026-10-10.md');
 fs.writeFileSync(destination,markdown(summary,run,grade));
 fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({destination,models:summary.map(({model,delivered,full_tasks,passed_checks,delivered_checks})=>({model,delivered,full_tasks,passed_checks,delivered_checks}))}));
}
module.exports={summarize};
