const fs=require('node:fs');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
try{if(process.argv.length!==3)throw Error('one file required');const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(!Array.isArray(data)||data.some(x=>!x||Array.isArray(x)||typeof x!=='object'))throw Error('object array required');const seen=new Set(),duplicates=[];data.forEach((row,i)=>{const key=JSON.stringify(stable(row));if(seen.has(key))duplicates.push(i);else seen.add(key);});console.log(JSON.stringify({duplicates}));}
catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
