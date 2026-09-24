import { client } from './supabase-client.js?v=20260921-4';
import { getVerifiedSession } from './auth.js?v=20260921-4';
import { PRIVACY_NOTICE_VERSION, hasCurrentPrivacyAcknowledgement } from './privacy-notice.js?v=20260921-4';
import { privacyLink, privateDestination } from './return-to.js?v=20260921-4';

export async function acknowledgePrivacyNotice(expectedUserId) {
  const session=await getVerifiedSession();
  if(!session?.user.email_confirmed_at || session.user.id!==expectedUserId)throw new Error('Vuelve a iniciar sesión para registrar el Aviso de Privacidad.');
  const {data,error}=await client().rpc('acknowledge_privacy_notice',{p_version:PRIVACY_NOTICE_VERSION});
  if(error)throw new Error('No pudimos registrar el Aviso de Privacidad. Inténtalo nuevamente.');
  if(data?.id!==expectedUserId || !hasCurrentPrivacyAcknowledgement(data))throw new Error('No pudimos comprobar el reconocimiento del aviso. Inténtalo nuevamente.');
  return data;
}
export async function requirePrivacyAcknowledgement(user,profile,destination=privateDestination()) {
  if(hasCurrentPrivacyAcknowledgement(profile))return true;
  if(!profile){
    location.replace(privacyLink(destination).replace('aceptar-privacidad.html','completar-registro.html'));
    return false;
  }
  // Indicación de signup; nunca se usa como evidencia ni como fecha autoritativa.
  if(user.user_metadata?.privacy_notice_pending_version===PRIVACY_NOTICE_VERSION){
    Object.assign(profile,await acknowledgePrivacyNotice(user.id));
    return true;
  }
  location.replace(privacyLink(destination));
  return false;
}
