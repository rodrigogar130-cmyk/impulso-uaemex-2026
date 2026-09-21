import { getSession, signInWithPassword, signOut, resendConfirmation } from './auth.js?v=20260921-4';
import { bindForm, message, errorText } from './ui.js?v=20260921-4';
import { client } from './supabase-client.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { afterLogin, preserveAuthLinks, requestedActivity, authLink } from './return-to.js?v=20260921-4';
import { bindGoogleButton, hasOAuthError, googleAuthError } from './google-auth.js?v=20260921-4';
preserveAuthLinks();
bindGoogleButton();
if(requestedActivity()){
  const heading=document.querySelector('h1');heading.textContent='PARA ASISTIR A ESTA ACTIVIDAD';
  const intro=document.createElement('p');intro.textContent='Necesitas acceder a tu cuenta de IMPULSO UAEMÉX 2026.';
  heading.after(intro);
  const signup=document.createElement('a');signup.className='btn secondary';signup.href=authLink('registro.html');signup.textContent='REGISTRARME';
  document.querySelector('form .actions').append(signup);
  document.querySelector('p.small').textContent='Si ya tienes una cuenta, inicia sesión. Si es tu primera vez, crea tu cuenta.';
}

const parameters = new URLSearchParams(location.search);
try {
  if (hasOAuthError()) message(googleAuthError, true);
  else {
  if (parameters.has('confirmed')) message('Inicia sesión para comprobar tu cuenta y continuar.');
  const session = await getSession();
  if (session && parameters.has('confirmed')) {
    const { data, error } = await client().auth.getUser();
    if (error || !data.user?.email_confirmed_at) throw new Error('No se pudo verificar la confirmación del correo. Inicia sesión para continuar.');
    await signOut();
    message('Correo confirmado correctamente.\nYa puedes iniciar sesión.');
  } else if (session) {
    const prepared = await prepareAccount();
    const destination = prepared.profile ? afterLogin() : 'mi-cuenta.html';
    location.replace(destination);
  }
  }
} catch (error) { message(errorText(error), true); }
bindForm(document.querySelector('form'), async data => {
  await signInWithPassword(String(data.get('email')).trim(), String(data.get('password')));
  message('Preparando tu perfil e inscripción al festival…');
  const prepared = await prepareAccount();
  location.replace(prepared.profile ? afterLogin() : 'mi-cuenta.html');
});
bindForm(document.querySelector('#resend-form'), async data => {
  await resendConfirmation(String(data.get('email')).trim());
  message('Si tu cuenta está pendiente de confirmación, recibirás un nuevo enlace por correo.');
});
