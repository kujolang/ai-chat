const {createHash}=require('node:crypto');
// Text evidence, not a language parser or a semantic equivalence detector.
// Callers explicitly choose production files; tests/fixtures are not inferred.
function duplicateSpans(files, width=8) {
 const windows=new Map();
 for(const file of files) {
  const lines=file.content.split(/\r?\n/);
  for(let i=0;i+width<=lines.length;i++) {
   const text=lines.slice(i,i+width).join('\n');
   if(text.length<160)continue;
   const hash=createHash('sha256').update(text).digest('hex');
   const group=windows.get(hash)||new Map();
   if(!group.has(file.path))group.set(file.path,{path:file.path,line:i+1});windows.set(hash,group);
  }
 }
 const matches=[];
 for(const locations of windows.values()) {
  if(locations.size<2)continue;
  const group=[...locations.values()];
  // Only expose starting windows; consecutive matches add no useful context.
  if(matches.some(m=>group.every(g=>m.locations.some(p=>p.path===g.path && g.line>=p.line && g.line<p.line+width))))continue;
  matches.push({lines:width,locations:group});if(matches.length===20)break;
 }
 return{candidate_spans:matches,limit:20,scope:`Exact ${width}-line cross-file matches of at least 160 characters. Not semantic duplication; shared boilerplate may be legitimate. Inspect each candidate.`};
}
module.exports={duplicateSpans};
