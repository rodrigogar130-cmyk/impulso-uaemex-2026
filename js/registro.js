import { signUp } from './auth.js?v=20260921-4';
import { client } from './supabase-client.js?v=20260921-4';
import { preserveAuthLinks } from './return-to.js?v=20260921-4';
import { bindGoogleButton, hasOAuthError, googleAuthError } from './google-auth.js?v=20260921-4';
import { PRIVACY_NOTICE_VERSION,bindPrivacyCheckbox,requirePrivacyCheckbox } from './privacy-notice.js?v=20260921-4';
preserveAuthLinks();
bindGoogleButton();
import { bindForm, studentFields, profileData, matchingPassword, message, errorText } from './ui.js?v=20260921-4';
const form = document.querySelector('form');
bindPrivacyCheckbox(form);
form.querySelectorAll('[data-password-toggle]').forEach(button => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  button.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Ocultar' : 'Mostrar';
    button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
});
studentFields(form);
try { client(); } catch (error) { message(errorText(error), true); }
if (hasOAuthError()) message(googleAuthError, true);
bindForm(form, async data => {
  requirePrivacyCheckbox(form);
  try {
    await signUp(String(data.get('email')).trim(), matchingPassword(data), {...profileData(data),privacy_notice_pending_version:PRIVACY_NOTICE_VERSION});
  } catch (error) {
    if (error?.status >= 500 || /error sending (confirmation|recovery|magic link) (email|mail)/i.test(error?.message || '')) {
      throw new Error('No pudimos enviar el correo de confirmación. Espera unos minutos e inténtalo de nuevo.');
    }
    // Misma respuesta visible si Auth informa un duplicado: no consultar usuarios.
    if (!['user_already_exists', 'email_exists'].includes(error?.code)) throw error;
  }
  form.hidden = true;
  message('');
  const result = document.querySelector('#signup-result');
  result.hidden = false;
  result.focus();
});
