import { adminCall } from './admin-api.js?v=20260921-4';
import './site-header.js?v=20260921-4';
import { getLocalSession, onAuthStateChange } from './auth.js?v=20260921-4';
import { supabase } from './supabase-client.js?v=20260921-4';
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
  let accessUser = null, accessPromise = null;
  let accessInFlight = null, accessExpiresAt = 0;
  const accessTTL = 120000;
  function resetAccess(session) {
    const id = session?.user.id || null;
    if (id !== accessUser) {
      accessUser = id; accessPromise = null; accessExpiresAt = 0;
      document.querySelectorAll('[data-admin-link]').forEach(el=>el.hidden=true);
    }
  }
  async function refresh() {
    const current = ++revision;
    try {
      const session = await getLocalSession();
      if (current !== revision) return;
      resetAccess(session); render(session);
      if(session){
        // UI hint only. admin.html always checks its own permissions remotely.
        // Finish any previous user's request before starting another one.
        if (accessInFlight && !accessPromise) {
          await accessInFlight;
          if (current !== revision) return;
        }
        if (!accessPromise || (!accessInFlight && Date.now() >= accessExpiresAt)) {
          const request = adminCall('admin_get_access').then(role=>['super_admin','staff'].includes(role)).catch(()=>false).finally(()=>{
            if (accessInFlight === request) accessInFlight = null;
            if (accessPromise === request) accessExpiresAt = Date.now() + accessTTL;
          });
          accessPromise = request; accessInFlight = request;
        }
        const allowed = await accessPromise;
        if(current===revision)document.querySelectorAll('[data-admin-link]').forEach(el=>el.hidden=!allowed);
      }
    } catch {
      if (current === revision) render(null);
    }
  }
  onAuthStateChange((_event, session) => {
    revision++; resetAccess(session); render(session);
    // No llamar métodos Auth dentro del callback: evitar el bloqueo del SDK.
    if (session) setTimeout(refresh, 0);
  });
  function refreshOnReturn() {
    if (!document.hidden && accessUser && !accessInFlight && Date.now() >= accessExpiresAt) void refresh();
  }
  window.addEventListener('focus', refreshOnReturn);
  document.addEventListener('visibilitychange', refreshOnReturn);
  await refresh();
}
