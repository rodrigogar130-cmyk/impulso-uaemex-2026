import { client } from './supabase-client.js?v=20260921-4';
export async function adminCall(name,args={}) {
  const {data,error}=await client().rpc(name,args);
  if(error)throw error;
  return data;
}
export function adminError(error){
  const code=error?.message||'';
  if(code.includes('SCENARIO_ADMIN_REQUIRED'))return 'No tienes permiso para administrar este escenario. Vuelve a escenarios para consultar tus accesos.';
  if(code.includes('SUPER_ADMIN_REQUIRED'))return 'Esta consulta requiere permisos de superadministrador.';
  if(code.includes('ADMIN_REQUIRED'))return 'No tienes permisos para acceder a esta sección.';
  if(code.includes('EDIT_CONFLICT'))return 'Otro administrador modificó esta actividad. Recarga sus datos antes de guardar.';
  if(code.includes('ACTIVITY_DATE_REQUIRED'))return 'Una actividad OPEN necesita fecha.';
  if(code.includes('INVALID_ACTIVITY_TIME'))return 'La hora de término debe ser posterior al inicio.';
  if(code.includes('ACTIVITY_TITLE_REQUIRED'))return 'El título es obligatorio.';
  if(code.includes('INVALID_ACTIVITY_SCENARIO'))return 'Selecciona un escenario válido.';
  if(code.includes('ACTIVITY_UNAVAILABLE'))return 'No se encontró esta actividad dentro del festival.';
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}
