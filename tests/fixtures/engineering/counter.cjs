function createCounter(initial,persist){
 if(!Number.isSafeInteger(initial))throw new TypeError('initial');let value=initial,tail=Promise.resolve();
 return {read:()=>value,increment(delta){const operation=tail.then(async()=>{if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(value+delta))throw new TypeError('delta');const next=value+delta;await persist(next);value=next;return next;});tail=operation.catch(()=>{});return operation;}};
}
module.exports={createCounter};
