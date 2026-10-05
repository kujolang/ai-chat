#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
function prepare(root, { guidance = false } = {}) {
 root = path.resolve(root);
 if (fs.existsSync(root)) throw Error('Use a fresh evaluation directory');
 fs.mkdirSync(root, { recursive: true });
 const seed = path.resolve(__dirname, '../benchmarks/fixtures/engineering');
 for (let i=1;i<=6;i++) fs.mkdirSync(path.join(root, String(i).padStart(2,'0')));
 for (const [task,files] of [[1,['config.cjs','consumer.cjs']], [2,['main.kujo']], [5,['counter.cjs']]])
  for (const file of files) fs.copyFileSync(path.join(seed,file),path.join(root,String(task).padStart(2,'0'),file));
 const docs = {
  '01':'resolve(options={}) returns a fresh configuration. Defaults: enabled=true, retries=3, label="default". Own option keys only; reject unknown keys and invalid values with TypeError. enabled is boolean; retries integer 0..10; label any string, including empty. No mutation of input/defaults/previous results. consumer.cjs is an existing downstream interface.\n',
  '02':'Existing public CLI: kujo run main.kujo -- JSON. One validated array returns {"count":N}. Keep validate as the authoritative input validator.\n',
  '05':'createCounter(initial,persist) is consumed through increment(delta):Promise<number> and read():number. persist is an async injected sink. Multiple callers may overlap.\n',
  '06':'Export rows can share an id without being duplicate: historical revisions and distinct records are legitimate. The original file is the source of truth. No deletion policy has been agreed.\n'
 };
 for(const [task,doc] of Object.entries(docs)) fs.writeFileSync(path.join(root,task,'README.md'),doc);
 fs.writeFileSync(path.join(root,'06/records.json'),JSON.stringify([{id:'a',value:1},{id:'a',value:2},{value:1,id:'a'}]));
 const intro = 'Use authorized local tools. Read and write only the assigned task directory; language runtime guides are allowed. Do not inspect prior answers, other tasks, benchmark scripts, calibration fixtures or graders. Do not change app settings, install dependencies, commit, push or touch live data. Leave code and tests in files. Report concise execution evidence and limitations.\n';
 const extra = guidance ? fs.readFileSync(path.resolve(__dirname,'../benchmarks/engineering-decision-guidance.md'),'utf8') : '';
 const raw = fs.readFileSync(path.resolve(__dirname,'../benchmarks/engineering-judgment-tasks.md'),'utf8').replaceAll('TASK_ROOT',root);
 const suite = raw.replace(/(# TEST \d+: [^\n]+\n)/g, '$1\n'+intro+'\n'+extra+'\n');
 fs.writeFileSync(path.join(root,'suite.md'),suite);
 return path.join(root,'suite.md');
}
if(require.main===module) console.log(prepare(process.argv[2],{guidance:process.argv.includes('--guidance')}));
module.exports={prepare};
