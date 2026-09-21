import { getSession, onAuthStateChange, requestRecovery, updatePassword, signOut } from './auth.js?v=20260921-4';
import { bindForm, matchingPassword, message, errorText } from './ui.js?v=20260921-4';
const requestForm = document.querySelector('#request-form');
const resetForm = document.querySelector('#reset-form');
const params = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
function showReset() { requestForm.hidden = true; resetForm.hidden = false; message('Establece tu nueva contraseña.'); }
try {
  onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showReset(); });
  const session = await getSession();
  if (params.get('mode') === 'reset' && session) showReset();
  else if (params.get('mode') === 'reset' || fragment.has('error')) message('El enlace ha caducado o no es válido. Solicita uno nuevo.', true);
} catch (error) { message(errorText(error), true); }
bindForm(requestForm, async data => {
  await requestRecovery(String(data.get('email')).trim());
  message('Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.');
});
bindForm(resetForm, async data => {
  await updatePassword(matchingPassword(data));
  await signOut();
  resetForm.hidden = true;
  message('Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.');
});
