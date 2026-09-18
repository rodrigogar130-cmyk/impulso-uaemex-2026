import { adminCall } from './admin-api.js';
import './site-header.js';
import { getSession, onAuthStateChange } from './auth.js';
import { supabase } from './supabase-client.js';
function render(session) {
  if(!session)document.querySelectorAll('[data-admin-link]').forEach(el=>el.hidden=true);
  document.querySelectorAll('[data-auth-guest]').forEach(el => el.hidden = Boolean(session));
  document.querySelectorAll('[data-auth-user]').forEach(el => el.hidden = !session);
  document.querySelectorAll('[data-auth-passport]').forEach(el => {
    el.textContent = session ? 'Mi pasaporte' : 'Pasaporte digital';
    el.href = session ? 'pasaporte.html' : el.dataset.publicHref;
    if (session && location.pathname?.endsWith('/pasaporte.html')) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}
if (supabase) {
  let revision = 0;
  async function refresh() {
    const current = ++revision;
    try {
      const session = await getSession();
      if (current === revision) render(session);
      if(session){
        let allowed=false;try{allowed=['super_admin','staff'].includes(await adminCall('admin_get_access'));}catch{}
        if(current===revision)document.querySelectorAll('[data-admin-link]').forEach(el=>el.hidden=!allowed);
      }
    } catch {
      if (current === revision) render(null);
    }
  }
  onAuthStateChange((_event, session) => {
    if (!session) { revision++; render(null); }
    // No llamar métodos Auth dentro del callback: evitar el bloqueo del SDK.
    else setTimeout(refresh, 0);
  });
  window.addEventListener('focus', refresh);
  await refresh();
}
