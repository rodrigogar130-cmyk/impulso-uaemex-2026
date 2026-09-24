import { requireUser, onAuthStateChange, signOut } from './auth.js?v=20260921-4';
import { bindForm, message, errorText } from './ui.js?v=20260921-4';
import { ensureProfile } from './profile.js?v=20260921-4';
import { requirePrivacyAcknowledgement } from './privacy.js?v=20260921-4';
import { privacyLink,privateDestination } from './return-to.js?v=20260921-4';
export async function privatePage() {
  const user = await requireUser();
  if (!user) {
    if(privateDestination()==='pasaporte.html')location.replace(privacyLink('pasaporte.html').replace('aceptar-privacidad.html','login.html'));
    return null;
  }
  if(!await requirePrivacyAcknowledgement(user,await ensureProfile(user)))return null;
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      document.querySelector('[data-private]').hidden = true;
      location.replace('login.html');
    } else if (session && session.user.id !== user.id) {
      document.querySelector('[data-private]').hidden = true;
      location.reload();
    }
  });
  document.querySelector('[data-private]').hidden = false;
  bindForm(document.querySelector('#logout-form'), async () => {
    await signOut(); location.replace('login.html');
  });
  message('');
  return user;
}
export function privateError(error) { message(errorText(error), true); }
