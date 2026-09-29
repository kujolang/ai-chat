/* Provider connections never replace AI Chat's App Access token. */
(function () {
 'use strict';
 function create({ root, apiFetch, useConnection, onChange }) {
  let connections = []; let enabled = false; let attempt = null; let timer; let busy = false; let notice = ''; let welcome;
  const catalogs = new Map();
  async function request(path = '', body) {
   const response = await apiFetch(`/api/connections/chatgpt${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
   const data = await response.json();
   if (!response.ok || !data.ok) throw new Error(data.error?.message || 'ChatGPT connection failed.');
   return data;
  }
  function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
  function button(label, action) {
   const node = element('button', label, 'btn ghost'); node.type = 'button'; node.disabled = busy;
   node.addEventListener('click', async () => {
    if (busy) return;
    busy = true; notice = ''; render();
    try { await action(); } catch (error) { notice = error.message; }
    finally { busy = false; render(); }
   }); return node;
  }
  function render() {
   root.replaceChildren(element('h3', 'ChatGPT Plan · Preview'));
   root.append(element('p', 'Connect your account and explicitly authorize eligible Plus/Pro plan usage. OpenAI API keys and local Codex login remain separate. Temperature and output-token settings do not apply to this plan route.', 'settings-note'));
   if (!enabled) root.append(element('p', notice || 'Enable CHATGPT_SIGN_IN_ENABLED=1 on a local server to connect. Open AI Chat on the same computer as the server.', 'settings-note'));
   else {
    const signIn = button('Continue with ChatGPT', () => login()); signIn.classList.add('chatgpt-sign-in'); const logo = document.createElement('img'); logo.src = '/assets/chatgpt-logo-white.svg'; logo.alt = ''; logo.width = 20; logo.height = 20; signIn.prepend(logo); root.append(signIn);
    for (const connection of connections) {
     const row = element('div', '', 'chatgpt-connection');
     row.append(element('strong', connection.label || 'ChatGPT account'));
     row.append(element('p', `${connection.status.replaceAll('_', ' ')} · Plan usage ${connection.plan_usage_enabled ? 'authorized (subject to limits)' : 'not enabled'}`, 'settings-note'));
     row.append(button('Use for chat / refresh models', async () => {
      const { models } = await request(`/${encodeURIComponent(connection.id)}/models`);
      catalogs.set(connection.id, models);
      if (!models.length) throw new Error('This account returned no selectable models.');
      await useConnection(connection, models); notice = 'ChatGPT profile saved. Select it in a chat to use this connection.';
     }));
     row.append(button(connection.plan_usage_enabled ? 'Reconnect' : 'Enable plan usage', () => login(connection)));
     if (connection.status === 'connected') row.append(button('Disconnect', async () => {
      const result = await request(`/${encodeURIComponent(connection.id)}/disconnect`, {});
      catalogs.delete(connection.id); await refresh();
      notice = result.remote_revocation_confirmed ? 'Disconnected. OpenAI confirmed revocation.' : 'Disconnected locally. Remote revocation was not confirmed; remove access in ChatGPT settings.';
     }));
     const link = element('a', 'Manage ChatGPT usage'); link.href = 'https://chatgpt.com/settings/usage'; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link);
     root.append(row);
    }
   }
   if (attempt) {
    const link = element('a', 'Open ChatGPT sign-in'); link.href = attempt.authorization_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; root.append(link);
    root.append(button('Cancel sign-in', async () => { const current = attempt; attempt = null; clearTimeout(timer); await request(`/attempts/${current.attempt_id}/cancel`, {}); notice = 'Sign-in cancelled.'; }));
   }
   const status = element('p', notice, 'settings-note'); status.setAttribute('role', 'status'); root.append(status);
  }
  async function refresh() {
   try { const data = await request(); enabled = data.enabled; connections = data.connections; onChange?.(); showWelcome(); }
   catch (error) { notice = error.message; }
   render();
  }
  function showWelcome() {
   const connection = connections.find(c => c.plan_notice_required);
   if (!connection || welcome) return;
   welcome = element('dialog', '', 'chatgpt-welcome');
   const title = element('h3', "You're using your ChatGPT plan"); title.id = 'chatgpt-welcome-title'; welcome.setAttribute('aria-labelledby', title.id);
   welcome.append(title, element('p', 'Requests using your ChatGPT profile draw on your eligible ChatGPT plan allowance. You can manage this app’s usage in ChatGPT settings. API-key and native Codex profiles keep their own billing and authentication.'));
   const link = element('a', 'Manage usage'); link.href = 'https://chatgpt.com/settings/usage'; link.target = '_blank'; link.rel = 'noopener noreferrer'; welcome.append(link);
   const dismiss = element('button', 'Got it', 'btn'); dismiss.type = 'button';
   async function acknowledge(event) {
    event?.preventDefault(); dismiss.disabled = true;
    try { await request(`/${encodeURIComponent(connection.id)}/acknowledge-plan`, {}); welcome.close(); welcome.remove(); welcome = null; connection.plan_notice_required = false; }
    catch (error) { notice = error.message; dismiss.disabled = false; render(); }
   }
   dismiss.addEventListener('click', acknowledge); welcome.addEventListener('cancel', acknowledge); welcome.append(dismiss); document.body.append(welcome); welcome.showModal();
  }
  async function login(connection) {
   // Open synchronously from a click; a fallback link survives popup blocking.
   const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
   try {
    const next = await request('/login', { ...(connection ? { connection_id: connection.id } : {}), reconsent: connection && !connection.plan_usage_enabled });
    const url = new URL(next.authorization_url);
    if (url.origin !== 'https://auth.openai.com') throw new Error('Unexpected sign-in URL.');
    attempt = next; if (popup) popup.location = url.href;
    notice = 'Finish sign-in in your browser. No ChatGPT credentials are stored in browser storage.';
    clearTimeout(timer); timer = setTimeout(poll, 1500);
   } catch (error) { popup?.close(); throw error; }
  }
  async function poll() {
   const current = attempt; if (!current) return;
   try {
    const result = await request(`/attempts/${current.attempt_id}`);
    if (attempt !== current) return;
    if (['pending', 'exchanging'].includes(result.status)) { timer = setTimeout(poll, 1500); return; }
    attempt = null; notice = result.status === 'completed' ? 'Connected. Choose “Use for chat” to add its model profile.' : result.error || `Sign-in ${result.status}.`;
    await refresh();
   } catch (error) { if (attempt === current) { attempt = null; notice = error.message; render(); } }
  }
  return { refresh, label(id) { return connections.find(c => c.id === id)?.label || 'ChatGPT connection'; }, modelName(id, slug) { return catalogs.get(id)?.find(m => m.slug === slug)?.display_name || slug; } };
 }
 window.ChatGPTConnections = { create };
})();
