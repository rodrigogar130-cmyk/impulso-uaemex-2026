import { signInWithGoogle } from './auth.js';
import { message } from './ui.js';

export const googleAuthError = 'No pudimos iniciar sesión con Google. Inténtalo nuevamente o utiliza tu correo y contraseña.';
export function hasOAuthError() {
  return [location.search, location.hash.slice(1)].some(value => {
    const parameters = new URLSearchParams(value);
    return ['error', 'error_code', 'error_description'].some(key => parameters.has(key));
  });
}
export function bindGoogleButton() {
  const button = document.querySelector('[data-google-login]');
  if (!button) return;
  const label = button.querySelector('[data-google-label]');
  let busy = false;
  function reset() {
    busy = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    label.textContent = 'CONTINUAR CON GOOGLE';
  }
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    label.textContent = 'CONECTANDO CON GOOGLE...';
    message('');
    try {
      // The existing SDK performs a normal redirect, never a popup.
      await signInWithGoogle();
    } catch {
      message(googleAuthError, true);
      reset();
    }
  });
  // Safari may restore the disabled button when returning from Google via Back.
  window.addEventListener('pageshow', event => { if (event.persisted) reset(); });
}
