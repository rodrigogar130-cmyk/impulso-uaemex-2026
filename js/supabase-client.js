import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20260921-4';

export const configurationReady = /^https:\/\/[^/]+\/?$/.test(SUPABASE_URL)
  && SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');
// Única instancia: los demás módulos importan esta exportación.
export let supabase = null;
export let connectionError = '';
if (configurationReady) {
  try {
    const createClient = globalThis.supabase?.createClient;
    if (typeof createClient !== 'function') {
      connectionError = 'No se pudo cargar el servicio de cuentas. Comprueba tu conexión y vuelve a cargar la página.';
    } else supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
    });
  } catch {
    connectionError = 'No se pudo conectar. Comprueba tu conexión y vuelve a cargar la página.';
  }
}
export function client() {
  if (!supabase) throw new Error(connectionError || 'El servicio de cuentas aún no está disponible. Inténtalo más tarde.');
  return supabase;
}
