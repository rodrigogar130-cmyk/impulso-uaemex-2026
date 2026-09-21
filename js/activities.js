import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20260921-4';
export async function listActivities({onFallback}={}) {
  try{
    return await fetchCatalog(SUPABASE_URL+'/rest/v1/rpc/list_impulso_activities',{
      method:'POST',credentials:'omit',
      headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,
        'Content-Type':'application/json',Accept:'application/json'},body:'{}'
    },true);
  }catch{
    const data=await fetchCatalog('data/activities-public.json',{
      credentials:'omit',headers:{Accept:'application/json'}
    });
    if(!data.length||data.some(a=>a.status!=='open'))throw new Error('Invalid public snapshot');
    onFallback?.();
    return data;
  }
}
async function fetchCatalog(url,options,live=false){
  // Public RPC: never wait for the SDK's session initialization or Auth lock.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    if(!response.ok){
      if(live)console.error('Agenda public catalog load failed',response.status);
      throw new Error('Public catalog request failed');
    }
    const data=await response.json();
    if(!Array.isArray(data)||data.some(a=>!a||typeof a.slug!=='string'||typeof a.status!=='string'))throw new Error('Invalid public catalog response');
    return data;
  }finally{clearTimeout(timeout);}
}
export async function getMyRoute() {
  const { client }=await import('./supabase-client.js?v=20260921-4');
  const {data,error}=await client().rpc('get_my_impulso_route');
  if(error)throw error;return data || [];
}
export async function setSelection(activityId,status) {
  const { client }=await import('./supabase-client.js?v=20260921-4');
  const {data,error}=await client().rpc('set_my_activity_registration',{p_activity_id:activityId,p_status:status,p_reminder_enabled:true});
  if(error)throw error;return data;
}
export function routeError(error) {
  if(/ACTIVITY_UNAVAILABLE/.test(error?.message || ''))return 'Esta actividad ya no está disponible. Actualiza la agenda.';
  if(/EVENT_REGISTRATION_REQUIRED/.test(error?.message || ''))return 'Tu acceso al festival no está confirmado. Revisa Mi cuenta.';
  if(/AUTH_REQUIRED|CONFIRMED_EMAIL_REQUIRED/.test(error?.message || ''))return 'Inicia sesión con tu correo confirmado para continuar.';
  if(['PGRST202','42P01','42883'].includes(error?.code))return 'No se pudo cargar tu ruta. Inténtalo de nuevo.';
  return 'No se pudo actualizar tu ruta. Inténtalo de nuevo.';
}
