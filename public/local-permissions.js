(() => {
 const card=document.getElementById('local-command-permissions');
 if(!card) return;
 const skip=card.querySelector('[name=skip_allowlist]');
 const destructive=card.querySelector('[name=allow_destructive]');
 const status=card.querySelector('[role=status]');
 const save=card.querySelector('button');
	const grantsList=card.querySelector('[data-approval-grants-list]');
 let stored={skip_allowlist:false,allow_destructive:false};
 function render() {
  destructive.disabled=!skip.checked;
  if(!skip.checked) destructive.checked=false;
  for(const key of ['skip_allowlist','allow_destructive']) {
   const input=card.querySelector(`[name=${key}]`);
   card.querySelector(`[data-confirmation=${key}]`).hidden=!input.checked || stored[key];
  }
 }
 function apply(payload) {
  stored=payload.permissions;
  skip.checked=stored.skip_allowlist;
  destructive.checked=stored.allow_destructive;
  for(const input of card.querySelectorAll('input[type=text]')) input.value='';
  status.textContent=payload.shell_enabled ? 'Local shell is enabled. These permissions apply to future command dispatches across all chats.' : 'Local shell remains disabled on this server. These switches do not enable it.';
  render();
 }
 async function load() {
  save.disabled=true;
  try {
   const response=await apiFetch('/api/local/permissions');
   if(!response.ok) throw Error('Could not load local command permissions.');
   apply(await response.json());
	   await loadGrants();
   save.disabled=false;
  } catch(error) {status.textContent=error.message;}
 }
	async function loadGrants() {
	 try {
	  const response=await apiFetch('/api/approvals');
	  if(!response.ok) throw Error('Could not load saved action approvals.');
	  const grants=(await response.json()).grants || [];
	  grantsList.replaceChildren();
	  if(!grants.length) {
	   const empty=document.createElement('span');
	   empty.className='muted';
	   empty.textContent='No saved action approvals.';
	   grantsList.append(empty);
	   return;
	  }
	  for(const grant of grants) {
	   const row=document.createElement('div');
	   row.className='approval-grant-row';
	   const label=document.createElement('span');
	   label.textContent=`${grant.tool_name} · ${grant.grant_scope} · ${grant.workspace_id || grant.chat_id || 'current scope'}`;
	   const revoke=document.createElement('button');
	   revoke.type='button';
	   revoke.className='btn ghost';
	   revoke.textContent='Revoke';
	   revoke.setAttribute('aria-label',`Revoke saved approval for ${grant.tool_name}`);
	   revoke.addEventListener('click',async()=>{
	    revoke.disabled=true;
	    const result=await apiFetch(`/api/approval-grants/${encodeURIComponent(grant.id)}`,{method:'DELETE'});
	    if(result.ok) await loadGrants();
	    else { status.textContent='Could not revoke the saved approval.'; revoke.disabled=false; }
	   });
	   row.append(label,revoke);
	   grantsList.append(row);
	  }
	 } catch(error) { grantsList.textContent=error.message; }
	}
 skip.addEventListener('change',render);
 destructive.addEventListener('change',render);
 save.addEventListener('click',async()=>{
  save.disabled=true;
  try {
   const body={skip_allowlist:skip.checked,allow_destructive:destructive.checked};
   for(const key of ['skip_allowlist','allow_destructive']) body[`${key}_confirmation`]=card.querySelector(`[name=${key}_confirmation]`).value;
   const response=await apiFetch('/api/local/permissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const payload=await response.json();
   if(!response.ok) throw Error(payload.error || 'Could not save permissions.');
   apply(payload);
   status.textContent='Permissions saved. '+status.textContent;
   await loadRuntimeCapabilities();
  } catch(error) {status.textContent=error.message;}
  finally {save.disabled=false;}
 });
 document.getElementById('open-settings-btn').addEventListener('click',load);
 document.querySelector('[data-settings-tab=tools]').addEventListener('click',load);
 render();
})();
