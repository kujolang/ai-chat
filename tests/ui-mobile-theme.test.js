const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('mobile status sits left of both selectors and native/enhanced selects stay dark', async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage();
  const footer = read('public/index.html').match(/<footer class="composer">[\s\S]*?<\/footer>/)[0];
  await page.setContent(`<style>${read('node_modules/select2/dist/css/select2.css')}\n${read('public/app.css')}</style>${footer}<div class="usage-filters-grid"><select id="stats"><option>All providers</option></select></div><div class="settings-default-project-field"><select id="settings"><option>Default</option></select></div>`);
  await page.addScriptTag({path:path.join(root,'node_modules/jquery/dist/jquery.js')});
  await page.addScriptTag({path:path.join(root,'node_modules/select2/dist/js/select2.full.js')});
  await page.evaluate(() => {jQuery('#stats, #settings').select2({containerCssClass:'app-single-select2'});});
  for (const width of [375, 720, 900]) {
   await page.setViewportSize({width,height:800});
   const dot = await page.locator('#save-status').boundingBox();
   for (const id of ['#retrieval-language','#composer-profile-select']) {
    const box = await page.locator(id).boundingBox();
    assert.ok(dot.x + dot.width <= box.x, `${width}: dot left of ${id}`);
    assert.ok(box.x + box.width <= width, `${width}: selector fits`);
   }
  }
  for (const selector of ['#retrieval-language','.select2-selection--single']) {
   for (const el of await page.locator(selector).all()) {
    const colors = await el.evaluate(node => ({bg:getComputedStyle(node).backgroundColor,fg:getComputedStyle(node).color}));
    assert.notEqual(colors.bg,'rgb(255, 255, 255)');
    assert.notEqual(colors.bg,'rgba(0, 0, 0, 0)');
    assert.notEqual(colors.fg,'rgb(0, 0, 0)');
   }
  }
 } finally {await browser.close();}
});
