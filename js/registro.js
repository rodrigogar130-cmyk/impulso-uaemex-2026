import { signUp } from './auth.js';
import { client } from './supabase-client.js';
import { preserveAuthLinks } from './return-to.js';
preserveAuthLinks();
import { bindForm, studentFields, profileData, matchingPassword, message, errorText } from './ui.js';
const form = document.querySelector('form');
studentFields(form);
try { client(); } catch (error) { message(errorText(error), true); }
bindForm(form, async data => {
  try {
    await signUp(String(data.get('email')).trim(), matchingPassword(data), profileData(data));
  } catch (error) {
    // Misma respuesta visible si Auth informa un duplicado: no consultar usuarios.
    if (!['user_already_exists', 'email_exists'].includes(error?.code)) throw error;
  }
  form.hidden = true;
  message('');
  const result = document.querySelector('#signup-result');
  result.hidden = false;
  result.focus();
});
