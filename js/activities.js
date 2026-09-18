import { client } from './supabase-client.js';
export async function listActivities() {
  const {data,error}=await client().rpc('list_impulso_activities');
  if(error)throw error;return data || [];
}
export async function getMyRoute() {
  const {data,error}=await client().rpc('get_my_impulso_route');
  if(error)throw error;return data || [];
}
export async function setSelection(activityId,status) {
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
