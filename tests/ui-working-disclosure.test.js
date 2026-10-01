const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/app.css'), 'utf8');
const functions = source.slice(source.indexOf('function renderThinkingBlock('), source.indexOf('function appendThinkingDelta('));
const render = Function(`
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const renderAssistantMarkdown = escapeHtml;
const normalizeAssistantProseSpacing = value => value;
const resolvedThinkingDurationMs = () => 0;
const thinkingToggleIconSvg = () => '<svg></svg>';
const thinkingLoadingIconSvg = '<svg></svg>';
const formatNumber = String;
${functions}
return renderThinkingBlock;
`)();

test('working details stay hidden until completion and explicit expansion', () => {
 const message = { id: 'm', streaming: true, thinking_expanded: true, thinking: 'Full private reasoning', tool_activity: [{label:'Old action'}, {label:'Newest action'}] };
 const live = render(message, 'p');
 assert.doesNotMatch(live, /Full private reasoning|Old action|toggle-thinking/);
 assert.match(live, /Newest action/);
 const completed = {...message, streaming:false, thinking_expanded:false};
 assert.doesNotMatch(render(completed, 'p'), /Full private reasoning|Old action/);
 assert.match(render(completed, 'p'), /aria-expanded="false"/);
 const expanded = render({...completed, thinking_expanded:true}, 'p');
 assert.match(expanded, /Full private reasoning/);
 assert.match(expanded, /Old action/);
 assert.match(expanded, /aria-expanded="true"/);
});

test('live narration replaces earlier lines and safely escapes markup', () => {
 const html = render({streaming:true, live_narration:'Previous update\n\nLatest <script>update</script>\n'}, 'p');
 assert.doesNotMatch(html, /Previous update|<script>/);
 assert.match(html, /Latest &lt;script&gt;/);
 assert.match(render({streaming:true, thinking:'Hidden reasoning'}, 'p'), /Streaming reasoning/);
 assert.doesNotMatch(render({streaming:true, thinking:'Hidden reasoning'}, 'p'), /Hidden reasoning/);
});

test('browser keeps live activity one line and save text visually hidden with errors visible', async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage();
  await page.setContent(`<style>${css}</style><div style="width:220px">${render({streaming:true, live_narration:'Newest activity '.repeat(50)}, 'p')}</div><div class="save-status saved"><span class="save-status-label">Saved</span></div>`);
  const line = page.locator('.message-thinking-statusline');
  assert.equal(await line.evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
  assert.equal(await line.evaluate(el => getComputedStyle(el).textOverflow), 'ellipsis');
  assert.ok(await line.evaluate(el => el.scrollWidth > el.clientWidth));
  const label = page.locator('.save-status-label');
  assert.equal(await label.evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)');
  assert.equal(await page.locator('.save-status').evaluate(el => getComputedStyle(el, '::before').content), 'none');
  await page.locator('.save-status').evaluate(el => {el.className='save-status error'; el.firstChild.textContent='Not saved';});
  assert.equal(await label.evaluate(el => getComputedStyle(el).clipPath), 'none');
 } finally { await browser.close(); }
});

test('completed tool-only work retains elapsed time after serialization', () => {
 const timing = source.slice(source.indexOf('function formatThinkingDurationMs('), source.indexOf('function formatMessageTime('));
 const label = Function(`${timing}; return message => formatThinkingDurationMs(resolvedThinkingDurationMs(message));`)();
 assert.equal(label(JSON.parse(JSON.stringify({streaming:false, response_time_ms:126000, thinking_duration_ms:0, tool_activity:[{label:'Done'}]}))), '2m 6s');
 assert.equal(label({streaming:false, response_time_ms:6000}), '6s');
});

test('stream updates preserve the connected loading animation and completion removes it', async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage();
  const patchSource = source.slice(source.indexOf('function patchStreamingMessageNode('), source.indexOf('function applyStreamingMessagePatches('));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:patchSource});
  const result = await page.evaluate(() => {
   const html = label => `<div class="message assistant"><div class="message-thinking"><div class="message-thinking-head"><div class="thinking-label">${label}</div><span class="thinking-inline-progress"><svg></svg></span></div><div>status</div></div><div>body</div></div>`;
   const root = document.querySelector('#root'); root.innerHTML = html('Working');
   const icon = root.querySelector('svg');
   const mutations = new MutationObserver(() => {}); mutations.observe(root,{childList:true,subtree:true});
   for(let i=1;i<=20;i++) patchStreamingMessageNode(root.firstElementChild,html(`Working for ${i}s`));
   const detached = mutations.takeRecords().some(r => [...r.removedNodes].some(n => n === icon || n.contains?.(icon)));
   const same = root.querySelector('svg') === icon;
   patchStreamingMessageNode(root.firstElementChild,'<div class="message assistant">Worked for 1m 20s</div>');
   return {same,detached,completed:root.textContent,icons:root.querySelectorAll('svg').length};
  });
  assert.deepEqual(result,{same:true,detached:false,completed:'Worked for 1m 20s',icons:0});
 } finally {await browser.close();}
});
