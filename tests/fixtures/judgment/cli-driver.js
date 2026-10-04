// Test-only oracle calibration driver. This is not Kujo and is never model context.
const fs=require('node:fs'),path=require('node:path');
const task=path.basename(path.dirname(process.argv[3]));const args=process.argv.slice(5);
const fail=()=>{process.stderr.write(JSON.stringify({error:'invalid input or state'}));process.exit(1);};
try{
 if(task==='01'){
  const rows=JSON.parse(args[0]);if(!Array.isArray(rows))fail();let total=0n;
  for(const s of rows){if(typeof s!=='string'||!/^\d+\.\d{2}$/.test(s))fail();const n=BigInt(s.replace('.',''));if(n>999999999999999n)fail();total+=n;if(total>9000000000000000n)fail();}
  console.log(JSON.stringify({cents:Number(total)+(process.env.JUDGMENT_MUTATION==='money'?1:0)}));
 }else{
  const [file,text]=args;const obj=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{scores:{}};
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v);const name=n=>/^[a-z][a-z0-9_]{0,15}$/.test(n);
  if(!record(obj)||Object.keys(obj).join(',')!=='scores'||!record(obj.scores))fail();
  for(const [k,v]of Object.entries(obj.scores))if(!name(k)||!Number.isInteger(v)||v<0||v>1000000)fail();
  const rows=JSON.parse(text);if(!Array.isArray(rows))fail();const scores={...obj.scores};
  for(const row of rows){if(!record(row)||typeof row.name!=='string'||!name(row.name)||!Number.isInteger(row.delta)||row.delta< -1000||row.delta>1000)fail();const value=(scores[row.name]||0)+row.delta;if(value<0||value>1000000)fail();scores[row.name]=value;}
  const data=JSON.stringify({scores});const temp=file+'.owned-tmp';try{fs.writeFileSync(temp,data,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  console.log(data);
 }
}catch{fail();}
