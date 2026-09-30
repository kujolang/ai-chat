const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
test('Tools exposes independent permission confirmations and clears destructive selection when skipping is disabled',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
  await page.setContent(html);
  await page.evaluate(()=>{
   window.requests=[];window.loadRuntimeCapabilities=async()=>{};
   window.apiFetch=async(url,opts)=>{if(opts)requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({permissions:{skip_allowlist:false,allow_destructive:false},shell_enabled:true})};};
  });
  await page.addScriptTag({path:path.join(__dirname,'../public/local-permissions.js')});
  await page.locator('[data-settings-tab=tools]').click();
  const card=page.locator('#local-command-permissions');
  await card.locator('button').waitFor();
  assert.equal(await card.locator('[name=allow_destructive]').isDisabled(),true);
  await card.locator('[name=skip_allowlist]').check();
  assert.ok(await card.locator('[data-confirmation=skip_allowlist]').isVisible());
  await card.locator('[name=allow_destructive]').check();
  assert.ok(await card.locator('[data-confirmation=allow_destructive]').isVisible());
  await card.locator('[name=skip_allowlist]').uncheck();
  assert.equal(await card.locator('[name=allow_destructive]').isChecked(),false);
  assert.equal(await card.locator('[name=allow_destructive]').isDisabled(),true);
  await card.locator('button').click();
  assert.deepEqual(await page.evaluate(()=>requests.at(-1)),{skip_allowlist:false,allow_destructive:false,skip_allowlist_confirmation:'',allow_destructive_confirmation:''});
 }finally{await browser.close();}
});
