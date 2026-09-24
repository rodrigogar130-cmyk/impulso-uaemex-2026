import { client } from './supabase-client.js?v=20260921-4';
export async function getMyAttendances(){
 const {data,error}=await client().rpc('get_my_impulso_attendances');
 if(error)throw error;
 return data||[];
}
export async function getPassportStatus(){
 const {data,error}=await client().rpc('get_my_passport_status');if(error)throw error;return data;
}
export const attendanceMessages={
 RECORDED:'✓ Asistencia registrada. Esta actividad ahora forma parte de tu Pasaporte.',
 ALREADY_COMPLETED:'Esta actividad ya fue completada.',
 POINT_TOKEN_INVALID:'Enlace de asistencia inválido. Escanea el NFC o QR proporcionado por el responsable de esta actividad.',
 ATTENDANCE_CLOSED:'La asistencia está cerrada. Solicita al responsable que la habilite.',
 ACTIVITY_NOT_FOUND:'Esta actividad no existe o no está disponible.',
 ACTIVITY_UNAVAILABLE:'Esta actividad no está disponible para registrar asistencia.',
 AUTH_REQUIRED:'Inicia sesión con tu correo confirmado para registrar tu asistencia.',
 EVENT_REGISTRATION_REQUIRED:'Tu inscripción al festival no está activa. Revisa Mi cuenta.',
 PRIVACY_REQUIRED:'Revisa el Aviso de Privacidad en Mi cuenta antes de continuar.',
 TURNSTILE_INVALID:'No pudimos validar la verificación de seguridad. Inténtalo de nuevo.',
 SECURITY_UNAVAILABLE:'La verificación de seguridad no está disponible. Inténtalo nuevamente.',
 RATE_LIMITED:'Has realizado varios intentos. Espera un minuto y vuelve a intentar.',
 NOT_CONFIGURED:'El registro de asistencia aún no está habilitado.',
 ORIGIN_REJECTED:'Abre la actividad desde el sitio oficial de IMPULSO.',
 SERVICE_UNAVAILABLE:'No pudimos registrar tu asistencia. Comprueba tu conexión e inténtalo nuevamente.'
};
export function attendanceMessage(code){return attendanceMessages[code]||attendanceMessages.SERVICE_UNAVAILABLE;}
export function notifyAttendance(){
 try{localStorage.setItem('impulso-attendance-changed',String(Date.now()));}catch{}
 document.dispatchEvent(new Event('impulso-attendance-changed'));
}
