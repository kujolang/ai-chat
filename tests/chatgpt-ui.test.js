const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

test('ChatGPT connection UI distinguishes consent, creates explicit profile, acknowledges once, and reports local-only disconnect', async t => {
 const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
 const page = await browser.newPage();
 await page.route('http://127.0.0.1:4173/fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
 await page.goto('http://127.0.0.1:4173/fixture');
 await page.addScriptTag({ path: path.join(__dirname, '../public/chatgpt-connections.js') });
 await page.evaluate(async () => {
  const connection = { id: 'connection-test', label: 'test@example.invalid · abc123', status: 'connected', plan_usage_enabled: true, plan_notice_required: true };
  window.calls = []; window.created = null;
  window.panel = window.ChatGPTConnections.create({ root: document.getElementById('root'), async apiFetch(url, init) {
   window.calls.push({ url, body: init?.body });
   if (url.endsWith('/acknowledge-plan')) { connection.plan_notice_required = false; return Response.json({ ok: true, acknowledged: true }); }
   if (url.endsWith('/models')) return Response.json({ ok: true, models: [{ slug: 'test-model', display_name: 'Test Model' }] });
   if (url.endsWith('/disconnect')) { connection.status = 'disconnected'; connection.plan_usage_enabled = false; return Response.json({ ok: true, remote_revocation_confirmed: false }); }
   return Response.json({ ok: true, enabled: true, connections: [connection] });
  }, async useConnection(connection, models) { window.created = { id: connection.id, models }; } });
  await window.panel.refresh();
 });
 await page.getByRole('button', { name: 'Got it', exact: true }).click();
 await page.waitForFunction(() => !document.querySelector('dialog'));
 await page.evaluate(() => window.panel.refresh()); assert.equal(await page.locator('dialog').count(), 0);
 await page.getByRole('button', { name: 'Use for chat / refresh models' }).click();
 await page.waitForFunction(() => window.created !== null);
 assert.deepEqual(await page.evaluate(() => window.created.models), [{ slug: 'test-model', display_name: 'Test Model' }]);
 assert.equal(await page.evaluate(() => window.panel.modelName('connection-test', 'test-model')), 'Test Model');
 await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
 await page.getByRole('status').filter({ hasText: 'Remote revocation was not confirmed' }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Enable plan usage' }).count(), 1);
 assert.equal(await page.evaluate(() => localStorage.length), 0);
 assert.equal(await page.getByRole('link', { name: 'Manage ChatGPT usage' }).getAttribute('href'), 'https://chatgpt.com/settings/usage');
});

test('ChatGPT UI keeps sign-in attempt cancellable without persisting authorization URLs', async t => {
 const browser = await chromium.launch({ headless: true }); t.after(() => browser.close()); const page = await browser.newPage();
 await page.route('http://127.0.0.1:4173/fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })); await page.goto('http://127.0.0.1:4173/fixture');
 await page.addScriptTag({ path: path.join(__dirname, '../public/chatgpt-connections.js') });
 await page.evaluate(async () => {
  window.open = () => null; window.cancelled = false;
  const panel = window.ChatGPTConnections.create({ root: document.getElementById('root'), async apiFetch(url) {
   if (url.endsWith('/login')) return Response.json({ ok: true, attempt_id: 'attempt', authorization_url: 'https://auth.openai.com/api/accounts/authorize?state=test-state' });
   if (url.endsWith('/cancel')) { window.cancelled = true; return Response.json({ ok: true }); }
   return Response.json({ ok: true, enabled: true, connections: [], status: 'pending' });
  }, async useConnection() {} }); await panel.refresh();
 });
 await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
 await page.getByRole('link', { name: 'Open ChatGPT sign-in' }).waitFor();
 await page.getByRole('button', { name: 'Cancel sign-in' }).click();
 await page.waitForFunction(() => window.cancelled);
 // The mock request is observed before its JSON body and final render settle.
 await page.getByRole('link', { name: 'Open ChatGPT sign-in' }).waitFor({ state: 'hidden' });
 assert.equal(await page.getByRole('link', { name: 'Open ChatGPT sign-in' }).count(), 0);
 assert.equal(await page.evaluate(() => localStorage.length), 0);
});

for (const fixture of [
 { name: 'HTML from a stale server', type: 'text/html', body: '<!doctype html><html>app shell</html>', message: 'Restart the AI Chat server' },
 { name: 'malformed upstream JSON', type: 'application/json', body: '{broken', message: 'returned invalid JSON' }
]) test(`ChatGPT settings explains ${fixture.name} once without enabling sign-in`, async t => {
 const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
 const page = await browser.newPage();
 await page.setContent('<div id="root"></div>');
 await page.addScriptTag({ path: path.join(__dirname, '../public/chatgpt-connections.js') });
 await page.evaluate(async fixture => {
  const panel = window.ChatGPTConnections.create({ root: document.getElementById('root'),
   apiFetch: async () => new Response(fixture.body, { headers: { 'Content-Type': fixture.type } }),
   useConnection: async () => { throw new Error('Unexpected profile mutation'); }
  });
  await panel.refresh();
 }, fixture);
 assert.equal(await page.getByText(fixture.message, { exact: false }).count(), 1);
 assert.equal(await page.getByRole('button', { name: 'Continue with ChatGPT' }).count(), 0);
 assert.equal(await page.getByRole('status').count(), 1);
});
