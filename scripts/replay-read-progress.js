#!/usr/bin/env node
// Offline replay of a saved execution. Emits counts only, never model reasoning.
const fs=require('node:fs');
const {inspectReadProgress,compactRepeatedReads}=require('../lib/read-progress');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const messages=input.execution?.checkpoint?.messages;
if(!Array.isArray(messages)||!Array.isArray(input.receipts))throw Error('Expected saved execution checkpoint messages and receipts');
const byId=new Map(input.receipts.map(r=>[r.call_id,r]));
const context=[], completed=[], state={};
let rounds=0,compacted=0,beforeBytes=0,afterBytes=0,stopped=false;
for(let i=0;i<messages.length;i++){
 const m=messages[i];context.push(structuredClone(m));
 if(!m.tool_calls)continue;
 rounds++;
 const ids=m.tool_calls.map(c=>c.id);
 for(let j=0;j<ids.length;j++){
  const next=messages[i+1];
  if(next?.role!=='tool'||!ids.includes(next.tool_call_id))throw Error('Incomplete tool response group');
  context.push(structuredClone(next));i++;
 }
 completed.push(...ids.map(id=>byId.get(id)).filter(Boolean));
 const p=inspectReadProgress(state,completed);
 if(p.action==='stop'){stopped=true;break;}
 if(p.action==='recover'){
  const before=Buffer.byteLength(JSON.stringify(context));
  compacted+=compactRepeatedReads(context,p.tail);
  if(!beforeBytes){beforeBytes=before;afterBytes=Buffer.byteLength(JSON.stringify(context));}
 }
}
console.log(JSON.stringify({offline_replay:true,stopped,provider_responses_before_stop:rounds,completed_tool_calls:completed.length,
 unchanged_reads_before_stop:stopped?12:null,compacted_results:compacted,first_recovery_context_bytes:{before:beforeBytes,after:afterBytes},
 limitations:'Recorded continuation only; does not predict model recovery or billable-token savings.'},null,2));
