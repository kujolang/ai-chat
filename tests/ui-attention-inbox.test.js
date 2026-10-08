const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('attention filters select before failed requests and ignore stale responses', async () => {
 const browser = await chromium.launch({headless: true});
 try {
  const page = await browser.newPage();
  await page.setContent(read('public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, ''));
  await page.addStyleTag({content: read('public/app.css')});
  const source = read('public/app.js');
  await page.addScriptTag({content: `
   let attentionFilter = '', attentionEvents = [], attentionLoadSequence = 0;
   const nodes = {attentionList: document.querySelector('#attention-list'), attentionCount: document.querySelector('#attention-count')};
   const getChatById = () => null, maybeNotifyAttention = () => {}, escapeHtml = value => String(value).replaceAll('<', '&lt;');
   window.pending = [];
   const apiFetch = () => new Promise(resolve => pending.push(resolve));
   ${source.slice(source.indexOf('async function loadAttention('), source.indexOf('async function openAttentionInbox('))}
   ${source.slice(source.indexOf('function renderAttentionInbox('), source.indexOf('async function handleAttentionAction('))}
   document.querySelector('#attention-modal').classList.remove('hidden');
   document.querySelectorAll('[data-attention-filter]').forEach(button => button.onclick = () => {attentionFilter = button.dataset.attentionFilter; void loadAttention();});
  `});
  await page.locator('[data-attention-filter=task_failed]').click();
  assert.equal(await page.locator('[data-attention-filter=task_failed]').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => pending.shift()({ok:false,json:async()=>({error:{message:'Unavailable'}})}));
  assert.equal(await page.locator('#attention-list').innerText(), 'Unavailable');
  await page.locator('[data-attention-filter=question_asked]').click();
  await page.locator('[data-attention-filter=task_completed]').click();
  await page.evaluate(() => pending.pop()({ok:true,json:async()=>({events:[{id:'done',kind:'task_completed',title:'Finished'}],unread_count:1})}));
  await page.evaluate(() => pending.shift()({ok:false,json:async()=>({error:{message:'Stale error'}})}));
  assert.match(await page.locator('#attention-list').innerText(), /Finished/);
  assert.equal(await page.locator('[data-attention-filter=task_completed]').getAttribute('aria-pressed'), 'true');
  await page.locator('.notification-settings summary').click();
  for (const width of [375, 1440]) {
   await page.setViewportSize({width,height:900});
   assert.equal(await page.locator('.notification-settings label').first().evaluate(el=>getComputedStyle(el).justifyContent), 'flex-start');
   for (const selector of ['.notification-settings input[type=checkbox]', '.notification-settings input[type=time]']) {
    assert.equal(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).colorScheme), 'dark');
   }
   const checkbox = await page.locator('#desktop-notifications-enabled').boundingBox();
   assert.equal(checkbox.width, 16);
   const time = await page.locator('#notification-quiet-start').evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.equal(time, 'rgb(13, 14, 16)');
  }
 } finally {await browser.close();}
});

test('recovered execution renders approval decisions and retains its plan', async () => {
 const vm = require('node:vm');
 const source = read('public/app.js');
 const message={id:'message',content:'',execution_cursor:0};
 const pane={id:'pane',messages:[message]};
 const chat={id:'chat',panes:[pane]};
 const approval={id:'approval',status:'pending',summary:'Write script'};
 const plan={steps:[{id:'execute',state:'blocked'}]};
 let observed=false;
 const context=vm.createContext({AbortController,AbortSignal,Date,Set,console,
  activeStreamControllers:new Set(),activeStreamCount:0,stopStreamingRequested:false,
  messageApprovals:m=>m.approvals||m.usage?.approvals||[],
  normalizeCodeDiffSet:()=>({files:[]}),schedulePersist:()=>{},renderWorkspace:()=>{},updateStreamingControls:()=>{},scheduleStreamingPersist:()=>{},
  scheduleStreamingMessagePatch:()=>{if(message.approvals?.some(a=>a.status==='pending'))observed=true;},
  apiFetch:async()=>({}),
  window:{AIChatExecutionStream:{consumeExecutionResponse:async(_r,{onEvent})=>{
   onEvent({sequence:1,event:'approval',data:{approval}});
   assert.equal(message.usage.approvals[0].status,'pending');
   onEvent({sequence:2,event:'approval',data:{approval:{...approval,status:'expired'}}});
   onEvent({sequence:3,event:'plan',data:{plan}});
   onEvent({sequence:4,event:'error',data:{code:'tool_approval_expired'}});
  }}}
 });
 vm.runInContext(source.slice(source.indexOf('async function continueSavedExecution(')),context);
 await context.continueSavedExecution(chat,pane,message,{execution:{id:'run',status:'interrupted',checkpoint:{}},last_cursor:0,approvals:[]});
 assert.equal(observed,true);
 assert.equal(message.usage.approvals[0].status,'expired');
 assert.equal(message.usage.execution_plan.steps[0].state,'blocked');
 assert.equal(message.usage.error.code,'tool_approval_expired');
 assert.equal(message.streaming,false);
});
