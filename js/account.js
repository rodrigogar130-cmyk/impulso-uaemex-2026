import { privatePage, privateError } from './private-page.js?v=20260921-4';
import { saveProfile } from './profile.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { loadRouteCount } from './my-route.js?v=20260921-4';
import { bindForm, studentFields, profileData, message } from './ui.js?v=20260921-4';
try {
 const user = await privatePage();
 if (user) {
  const form = document.querySelector('#profile-form');
  const updateStudent = studentFields(form);
  let profile = null;
  function render(state) {
   if(state.privacyRequired){document.querySelector('[data-private]').hidden=true;return;}
   profile = state.profile;
   document.querySelector('#greeting').textContent = profile ? 'Hola, ' + profile.nombre : 'Completa tu perfil';
   document.querySelector('#account-email').textContent = user.email;
   if (profile) for (const key of ['nombre','apellidos','tipo_usuario','numero_cuenta','espacio_academico','telefono']) form.elements[key].value = profile[key] || '';
   updateStudent();
   const registration = state.registration;
   const confirmed = registration?.status === 'confirmed';
   document.querySelector('#event-status').textContent = confirmed ? 'REGISTRO CONFIRMADO' : registration ? 'REGISTRO CANCELADO' : 'Completa tu perfil para finalizar automáticamente tu inscripción.';
   document.querySelector('#registration-details').hidden = !confirmed;
   if (confirmed) {
    document.querySelector('#folio').textContent = registration.folio;
    document.querySelector('#registration-date').textContent = new Date(registration.created_at).toLocaleString('es-MX', { timeZone:'America/Mexico_City' });
   }
  }
  bindForm(form, async data => {
   profile = await saveProfile(user.id, profileData(data), Boolean(profile));
   render(await prepareAccount());
   message('Perfil guardado correctamente.');
  });
  const prepared=await prepareAccount(user);
  render(prepared);
  if(!prepared.privacyRequired)await loadRouteCount();
 }
} catch (error) {
 const status = document.querySelector('#event-status');
 if (status) status.textContent = 'No se pudo completar la carga de tu cuenta. Recarga la página para reintentar.';
 privateError(error);
}
