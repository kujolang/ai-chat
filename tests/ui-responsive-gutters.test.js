const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

test('mobile and tablet brand, title, chat and composer share both gutters', async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage();
  const html = fs.readFileSync(path.join(root,'public/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
  await page.setContent(html);
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'public/app.css'),'utf8')});
  await page.evaluate(() => {
   document.querySelector('#app').classList.add('chat-open','sidebar-collapsed');
   document.querySelector('#chat-title-input').value = 'New Chat';
   document.querySelector('#pane-grid').innerHTML = '<article class="pane-card"><div class="message-list"><div class="message user"><div class="message-bubble">Write a Kujo script and compare its performance.</div></div><div class="message assistant"><div class="message-bubble">Working on the comparison…</div></div></div></article>';
   document.querySelectorAll('.workspace-actions .pane-detail-action, #open-pane-profiles-btn').forEach(n=>n.classList.add('hidden'));
   document.querySelector('#composer-profile-select').innerHTML = '<option>DeepSeek V4.1 Flash · Watchdog / Ollama Cloud</option>';
  });
  for (const width of [320,393,600,768,1024,1100]) {
   await page.setViewportSize({width,height:850});
   const gutter = Math.max(16,(width-980)/2);
   for (const selector of ['.brand-row h1','#chat-title-input','.pane-card','.composer textarea']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(Math.abs(box.x-gutter)<1, `${width}: ${selector} left ${box.x}, expected ${gutter}`);
   }
   for (const selector of ['.brand-actions','.workspace-actions','.pane-card','.composer textarea','.composer-actions']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(Math.abs(box.x+box.width-(width-gutter))<1, `${width}: ${selector} right alignment`);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   if (process.env.GUTTER_SCREENSHOTS && [393,768,1024].includes(width)) {
    fs.mkdirSync(process.env.GUTTER_SCREENSHOTS,{recursive:true});
    await page.screenshot({path:path.join(process.env.GUTTER_SCREENSHOTS,`alignment-${width}.png`),fullPage:true});
   }
  }
 } finally { await browser.close(); }
});
