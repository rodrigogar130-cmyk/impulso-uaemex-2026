import { privatePage, privateError } from './private-page.js';
import { saveProfile } from './profile.js';
import { prepareAccount } from './prepare-account.js';
import { loadRouteCount } from './my-route.js';
import { bindForm, studentFields, profileData, message } from './ui.js';
try {
 const user = await privatePage();
 if (user) {
  const form = document.querySelector('#profile-form');
  const updateStudent = studentFields(form);
  let profile = null;
  function render(state) {
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
  render(await prepareAccount());
  await loadRouteCount();
 }
} catch (error) {
 const status = document.querySelector('#event-status');
 if (status) status.textContent = 'No se pudo completar la carga de tu cuenta. Recarga la página para reintentar.';
 privateError(error);
}
