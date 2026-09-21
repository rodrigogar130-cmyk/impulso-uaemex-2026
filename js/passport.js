import { privatePage, privateError } from './private-page.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { loadMyRoute } from './my-route.js?v=20260921-4';
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
