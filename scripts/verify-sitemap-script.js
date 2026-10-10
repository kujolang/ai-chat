#!/usr/bin/env node
'use strict';
// Frozen acceptance fixtures; not included in the provider prompt.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {assess} = require('./verify-kujo-scripts');
const ns = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const summary = (entries, urls, duplicate_urls, missing_loc, missing_lastmod) =>
  ({entries, unique_urls:urls.length, urls, duplicate_urls, missing_loc, missing_lastmod});
const fixtures = [
  {name:'empty', xml:'<urlset/>', expected:summary(0,[],[],0,0)},
  {name:'ordinary', xml:`<urlset xmlns="${ns}"><url><loc>https://example.com/</loc><lastmod>2026-10-10</lastmod></url><url><loc>https://example.com/blog</loc></url></urlset>`, expected:summary(2,['https://example.com/','https://example.com/blog'],[],0,1)},
  {name:'duplicates', xml:'<urlset><url><loc>b</loc></url><url><loc>a</loc></url><url><loc>a</loc></url><url><loc>b</loc></url><url><loc>a</loc></url></urlset>', expected:summary(5,['b','a'],['a','b'],0,5)},
  {name:'missing', xml:'<urlset><url/><url><loc>  </loc><lastmod> </lastmod></url><url><lastmod>anything</lastmod></url></urlset>', expected:summary(3,[],[],3,2)},
  {name:'entities-cdata', xml:'<?xml version="1.0"?><urlset><!-- ignore --><url><loc> https://example.com/?a=1&amp;b=2 </loc><lastmod><![CDATA[ x ]]></lastmod></url><url><loc><![CDATA[https://example.com/?a=1&b=2]]></loc></url><url><loc>https://example.com/caf&#233;</loc></url></urlset>', expected:summary(3,['https://example.com/?a=1&b=2','https://example.com/café'],['https://example.com/?a=1&b=2'],0,2)},
  {name:'prefixed-extensions', xml:`<s:urlset xmlns:s="${ns}" xmlns:x="urn:extension"><s:url><x:loc>ignore</x:loc><s:loc>keep</s:loc><x:lastmod>x</x:lastmod></s:url><x:url><s:loc>ignore2</s:loc></x:url><s:wrapper><s:url><s:loc>ignore3</s:loc></s:url></s:wrapper></s:urlset>`, expected:summary(1,['keep'],[],0,1)},
  {name:'namespace-reset', xml:`<urlset xmlns="${ns}"><url xmlns=""><loc>ignore</loc></url><url><loc xmlns="">ignore</loc><lastmod>x</lastmod></url></urlset>`, expected:summary(1,[],[],1,0)},
  {name:'first-direct-child', xml:'<urlset><url><wrapper><loc>ignore</loc></wrapper><loc> </loc><loc>later</loc><lastmod/><lastmod>x</lastmod></url></urlset>', expected:summary(1,[],[],1,1)},
  {name:'literal-comparison', xml:'<urlset><url><loc>https://EXAMPLE.com/</loc></url><url><loc>https://example.com/</loc></url><url><loc>https://example.com</loc></url></urlset>', expected:summary(3,['https://EXAMPLE.com/','https://example.com/','https://example.com'],[],0,3)},
  ...[['index','<sitemapindex/>'],['wrong-root','<root/>'],['wrong-namespace','<urlset xmlns="urn:no"/>'],['malformed','<urlset><url></urlset>'],['dtd','<!DOCTYPE urlset [<!ENTITY x "test">]><urlset/>'],['multiple-roots','<urlset/><urlset/>']].map(([name,xml])=>({name,xml,invalid:true})),
  {name:'missing-file', missing:true, invalid:true},
  {name:'no-arguments', args:[], invalid:true},
  {name:'extra-arguments', xml:'<urlset/>', extra:true, invalid:true}
];
function invoke(binary, script, fixture, args) {
  if(process.platform !== 'darwin') throw Error('macOS sandbox required');
  const files=[binary,script,...(fixture?[fixture]:[])].map(x=>`(literal ${JSON.stringify(fs.realpathSync(x))})`).join(' ');
  const policy=`(version 1)(allow default)(deny network*)(deny file-write*)(deny file-read* (subpath "/Users") (subpath "/private/tmp"))(allow file-read-metadata)(allow file-read* ${files})`;
  return spawnSync('/usr/bin/sandbox-exec',['-p',policy,binary,'run',script,'--',...args],{encoding:'utf8',timeout:5000,maxBuffer:65536,cwd:path.dirname(script),env:{PATH:'/usr/bin:/bin',HOME:path.dirname(script),TMPDIR:path.dirname(script)}});
}
function evaluate(binary,script,root,calibrate=false) {
  fs.mkdirSync(root,{recursive:true});
  return fixtures.map(row=>{
    const file=path.join(root,row.name+'.xml');
    if(row.xml)fs.writeFileSync(file,row.xml);
    const args=row.args || (row.extra?[file,'extra']:[file]);
    if(calibrate) fs.writeFileSync(script,row.invalid?'eprint("{\\\"error\\\":\\\"invalid input\\\"}"); exit(1)':`print(${JSON.stringify(JSON.stringify(row.expected))})`);
    const result=invoke(binary,script,row.xml?file:null,args);
    try {assess(row,result); return {name:row.name,passed:true};}
    catch(e){return {name:row.name,passed:false,error:e.message,stdout:result.stdout?.slice(0,1000),stderr:result.stderr?.slice(0,1000)};}
  });
}
if(require.main===module){
 const [mode,binaryArg,scriptArg,rootArg]=process.argv.slice(2);
 if(!['grade','calibrate'].includes(mode)||!rootArg)throw Error('Usage: verify-sitemap-script.js grade|calibrate BINARY SCRIPT OUTPUT_DIR');
 const binary=fs.realpathSync(binaryArg),script=path.resolve(scriptArg),root=path.resolve(rootArg);
 const rows=evaluate(binary,script,root,mode==='calibrate');
 let negative_control_rejected;
 if(mode==='calibrate') {fs.writeFileSync(script,'print("null")');negative_control_rejected=evaluate(binary,script,root).every(r=>!r.passed);}
 const report={mode,passed:rows.filter(r=>r.passed).length,checks:rows.length,negative_control_rejected,rows};
 fs.writeFileSync(path.join(root,mode+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 if(report.passed!==report.checks||negative_control_rejected===false)process.exitCode=1;
}
module.exports={fixtures,evaluate};
