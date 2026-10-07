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
