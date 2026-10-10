"use strict";

// Controller-only cases and calibration implementations. Never include in prompts.
const integer = x => Number.isInteger(x) && x >= -1000 && x <= 1000;
const numbers = x => Array.isArray(x) && x.length <= 100 && x.every(integer);
const object = x => x && !Array.isArray(x) && typeof x === "object";
const exact = (x, names) => object(x) && Object.keys(x).sort().join() === [...names].sort().join();
const tasks = [
 { id: "statistics", title: "Integer statistics", spec: 'Input is an integer array. Return {"count":N,"sum":S,"min":MIN,"max":MAX}; min and max are null for an empty array.', valid: numbers,
   oracle: x => ({count:x.length,sum:x.reduce((a,b)=>a+b,0),min:x.length?Math.min(...x):null,max:x.length?Math.max(...x):null}), samples:[[],[4,-2,4,0],[-1000,1000]],
   body: 'check_numbers(x)\nmut total := 0\nmut lo := null\nmut hi := null\nfor v in x { total += v; if lo == null { lo = v; hi = v } else { if v < lo { lo = v }; if v > hi { hi = v } } }\nreturn {"count":len(x),"sum":total,"min":lo,"max":hi}' },
 { id: "unique", title: "Stable deduplication", spec: 'Input is an integer array. Return each distinct value once, preserving its first occurrence order.', valid:numbers,
   oracle:x=>[...new Set(x)], samples:[[],[3,1,3,-1,1,0],[-1000,1000,-1000]],
   body:'check_numbers(x)\nmut out := []\nmut seen := {}\nfor v in x { let key := to_string(v); if has_key(seen,key) == 0 { seen[key] = true; out = push(out,v) } }\nreturn out' },
 { id: "frequencies", title: "Sorted frequency table", spec:'Input is an integer array. Return [value,count] pairs in ascending numeric value order.',valid:numbers,
   oracle:x=>[...new Set(x)].sort((a,b)=>a-b).map(v=>[v,x.filter(n=>n===v).length]),samples:[[],[8,2,8,-2,2],[-1000,1000,0,0]],
   body:'check_numbers(x)\nmut out := []\nlet sorted := sort(x)\nmut i := 0\nwhile i < len(sorted) { let v := sorted[i]; mut count := 0; while i < len(sorted) { if sorted[i] != v { break }; count += 1; i += 1 }; out = push(out,[v,count]) }\nreturn out' },
 { id: "prefix",title:"Prefix sums",spec:'Input is an integer array. Return cumulative sums, one per input element. Empty input returns [].',valid:numbers,
   oracle:x=>x.map((_,i)=>x.slice(0,i+1).reduce((a,b)=>a+b,0)),samples:[[],[2,-3,5,0],[-1000,1000,1000]],
   body:'check_numbers(x)\nmut out := []\nmut sum := 0\nfor v in x { sum += v; out = push(out,sum) }\nreturn out' },
 { id:"rotate",title:"Signed array rotation",spec:'Input has exactly keys values (an integer array) and steps (an integer -1000..1000). Rotate values right by steps; negative steps rotate left. Empty values returns [].',valid:x=>exact(x,['values','steps'])&&numbers(x.values)&&integer(x.steps),
   oracle:x=>x.values.length?x.values.map((_,i)=>x.values[((i-x.steps)%x.values.length+x.values.length)%x.values.length]):[],samples:[{values:[],steps:4},{values:[1,2,3],steps:-1},{values:[1,2,3],steps:1000}],
   body:'check_object(x,["values","steps"])\ncheck_numbers(x["values"])\ncheck_integer(x["steps"])\nlet a := x["values"]\nlet n := len(a)\nmut out := []\nif n == 0 { return out }\nlet k := ((x["steps"] % n) + n) % n\nmut i := 0\nwhile i < n { out = push(out,a[(i - k + n) % n]); i += 1 }\nreturn out' },
 { id:"rle",title:"Run length encoding",spec:'Input is an integer array. Return [value,count] pairs for adjacent equal-value runs, preserving run order. Separated repeats remain separate runs.',valid:numbers,
   oracle:x=>{const r=[];for(const v of x){if(r.at(-1)?.[0]===v)r.at(-1)[1]++;else r.push([v,1]);}return r;},samples:[[],[1,1,2,1,1,1],[-1000,-1000,1000]],
   body:'check_numbers(x)\nmut out := []\nmut i := 0\nwhile i < len(x) { let v := x[i]; mut count := 0; while i < len(x) { if x[i] != v { break }; count += 1; i += 1 }; out = push(out,[v,count]) }\nreturn out' },
 { id:"intervals",title:"Merge closed intervals",spec:'Input is an array of at most 100 [start,end] pairs. Both endpoints are integers -1000..1000 with start <= end. Return intervals sorted by start, merging overlapping or touching endpoints (e.g. [1,2] and [2,3]); do not merge [1,2] and [3,4].',valid:x=>Array.isArray(x)&&x.length<=100&&x.every(a=>Array.isArray(a)&&a.length===2&&a.every(integer)&&a[0]<=a[1]),
   oracle:x=>{const r=[];for(const a of x.map(a=>[...a]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])){if(r.length&&a[0]<=r.at(-1)[1])r.at(-1)[1]=Math.max(r.at(-1)[1],a[1]);else r.push(a);}return r;},samples:[[],[[4,8],[1,2],[2,5],[9,9]],[[-1000,1000],[0,0]]],
   body:'if !is_array(x) { fail("array required") }; if len(x) > 100 { fail("too long") }\nmut a := []\nfor row in x { check_numbers(row); if len(row) != 2 { fail("pair required") }; if row[0] > row[1] { fail("reversed") }; a = push(a,row) }\nmut i := 0\nwhile i < len(a) { mut j := i + 1; while j < len(a) { if a[j][0] < a[i][0] { let tmp := a[i]; a[i] = a[j]; a[j] = tmp }; j += 1 }; i += 1 }\nmut out := []\nfor row in a { if len(out) == 0 { out = push(out,row) } else { let last := out[len(out)-1]; if row[0] <= last[1] { mut end := last[1]; if row[1] > end { end = row[1] }; out[len(out)-1] = [last[0],end] } else { out = push(out,row) } } }\nreturn out' },
 { id:"dot",title:"Vector dot product",spec:'Input has exactly keys left and right, each an integer array of equal length. Return their scalar dot product. Two empty arrays return 0.',valid:x=>exact(x,['left','right'])&&numbers(x.left)&&numbers(x.right)&&x.left.length===x.right.length,
   oracle:x=>x.left.reduce((s,v,i)=>s+v*x.right[i],0),samples:[{left:[],right:[]},{left:[1,-2,3],right:[4,5,6]},{left:[1000],right:[-1000]}],
   body:'check_object(x,["left","right"])\ncheck_numbers(x["left"])\ncheck_numbers(x["right"])\nif len(x["left"]) != len(x["right"]) { fail("length mismatch") }\nmut sum := 0\nmut i := 0\nwhile i < len(x["left"]) { sum += x["left"][i] * x["right"][i]; i += 1 }\nreturn sum' },
 { id:"balance",title:"Balanced parentheses",spec:'Input is an ASCII string of at most 100 characters containing only ( and ). Return {"balanced":BOOLEAN,"max_depth":N}. max_depth is the maximum running opening-minus-closing count, with a floor of zero, even for unbalanced strings. balanced is true only if no prefix goes negative and final count is zero.',valid:x=>typeof x==='string'&&x.length<=100&&/^[()]*$/.test(x),
   oracle:x=>{let n=0,max=0,ok=true;for(const c of x){n+=c==='('?1:-1;max=Math.max(max,n);if(n<0)ok=false;}return{balanced:ok&&n===0,max_depth:max};},samples:['','(()())','())(',')))((('],
   body:'if !is_string(x) { fail("string required") }; if len(x) > 100 { fail("too long") }\nmut depth := 0\nmut highest := 0\nmut ok := true\nmut i := 0\nwhile i < len(x) { let c := x[i]; if c == "(" { depth += 1 } else { if c != ")" { fail("invalid character") }; depth -= 1 }; if depth < 0 { ok = false }; if depth > highest { highest = depth }; i += 1 }\nlet balanced := ok && depth == 0\nreturn {"balanced":balanced,"max_depth":highest}' },
 { id:"ledger",title:"Bounded sequential ledger",spec:'Input has exactly keys initial (integer 0..1000) and deltas (an integer array). Apply deltas in order; reject if ANY intermediate balance leaves 0..1000, even if final balance would be valid. Return {"balance":FINAL,"history":ARRAY_OF_POST_DELTA_BALANCES}.',valid:x=>{if(!exact(x,['initial','deltas'])||!integer(x.initial)||x.initial<0||!numbers(x.deltas))return false;let n=x.initial;return x.deltas.every(d=>(n+=d)>=0&&n<=1000);},
   oracle:x=>{let n=x.initial;return{balance:x.initial+x.deltas.reduce((a,b)=>a+b,0),history:x.deltas.map(d=>n+=d)};},samples:[{initial:0,deltas:[]},{initial:10,deltas:[-5,20,-25]},{initial:1000,deltas:[-1000,1000]}],
   body:'check_object(x,["initial","deltas"])\ncheck_integer(x["initial"])\ncheck_numbers(x["deltas"])\nmut n := x["initial"]\nif n < 0 { fail("negative balance") }\nmut history := []\nfor d in x["deltas"] { n += d; if n < 0 || n > 1000 { fail("out of range") }; history = push(history,n) }\nreturn {"balance":n,"history":history}' }
];
const prelude = `func fail(message) { eprint(to_json({"error":message})); exit(1) }
func check_integer(v) { if !is_int(v) { fail("integer required") }; if v < -1000 || v > 1000 { fail("out of range") } }
func check_numbers(a) { if !is_array(a) { fail("array required") }; if len(a) > 100 { fail("too long") }; for v in a { check_integer(v) } }
func check_object(x,names) { if !is_dict(x) { fail("object required") }; if len(keys(x)) != len(names) { fail("wrong keys") }; for name in names { if has_key(x,name) != 1 { fail("missing key") } } }
`;
function control(task) { return `${prelude}\nfunc solve(x) {\n${task.body}\n}\ntry { let argv := args(); if len(argv) != 1 { fail("one argument required") }; let x := parse_json(argv[0]); print(to_json(solve(x))) } except e { fail("invalid input") }\n`; }
function cases(task) {
 const values=[...task.samples,null,true,{},[],"x",[true],[1.5],[-1001],[1001],Array(101).fill(0),{values:[1],steps:false},{left:[1],right:[]},{initial:0,deltas:[-1,1]},[[2,1]],'()x'];
 // Deterministic extra inputs frozen before dispatch, with no provider-derived cases.
 for(let i=0;i<10;i++) {
  const a=Array.from({length:i+1},(_,j)=>((j*17+i*3)%13)-6);
  values.push(task.id==='rotate'?{values:a,steps:i-5}:task.id==='dot'?{left:a,right:[...a].reverse()}:task.id==='ledger'?{initial:500,deltas:a}:task.id==='balance'?'('.repeat(i)+')'.repeat(i):task.id==='intervals'?a.map(n=>[n,n+2]):a);
 }
 const rows=values.map(input=>task.valid(input)?{args:[JSON.stringify(input)],expected:task.oracle(input)}:{args:[JSON.stringify(input)],invalid:true});
 rows.push({args:[],invalid:true},{args:['[]','extra'],invalid:true},{args:['{broken'],invalid:true});
 return rows;
}
const guidance = `Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).`;
function suite() { return tasks.map((t,i)=>`# TEST ${i+1}: ${t.title}\n\n## Prompt\n\n${guidance}\n\nTask: ${t.spec}\n`).join('\n'); }
module.exports={tasks,cases,control,suite};
