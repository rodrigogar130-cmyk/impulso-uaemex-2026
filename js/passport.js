import { privatePage, privateError } from './private-page.js';
import { prepareAccount } from './prepare-account.js';
import { loadMyRoute } from './my-route.js';
try {
 const user = await privatePage();
 if (user) {
  const { profile, registration } = await prepareAccount(user);
  if (!profile) location.replace('mi-cuenta.html');
  else {
   const confirmed = registration?.status === 'confirmed';
   document.querySelector('#passport-locked').hidden = confirmed;
   document.querySelector('#passport-content').hidden = !confirmed;
   if (confirmed) {
    document.querySelector('#passport-folio').textContent = registration.folio;
    await loadMyRoute();
   }
  }
 }
} catch (error) { privateError(error); }
