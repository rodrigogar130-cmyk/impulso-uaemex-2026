import { message } from './ui.js?v=20260921-4';

const parameters = new URLSearchParams(location.search);
let tokenHash = (parameters.get('token_hash') || '').trim();
const valid = tokenHash && parameters.get('type') === 'email'
  && parameters.getAll('token_hash').length === 1 && parameters.getAll('type').length === 1;
const button = document.querySelector('#confirm-email');
const login = document.querySelector('#confirmation-login');
const help = document.querySelector('#confirmation-help');
let busy = false;

if (!valid) {
  button.hidden = true;
  login.hidden = false;
  message('Este enlace de confirmación no es válido o está incompleto.', true);
} else {
  button.disabled = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = 'CONFIRMANDO...';
    button.setAttribute('aria-busy', 'true');
    message('');
    try {
      // Loading this page must not initialize Auth or consume the email token.
      // Import the existing shared client only after the user's button activation.
      const { client } = await import('./supabase-client.js?v=20260921-4');
      const { error } = await client().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error) throw error;
      tokenHash = '';
      message('Correo confirmado correctamente.');
      // The login page discards the confirmation session before a real login.
      setTimeout(() => location.replace('login.html?confirmed=1'), 700);
    } catch (error) {
      const temporary = error?.status === 429 || error?.status >= 500
        || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code);
      const invalidToken = !temporary && (['otp_expired', 'token_expired', 'access_denied'].includes(error?.code)
        || [400, 401, 403, 404, 422].includes(error?.status));
      if (invalidToken) {
        message('Este enlace ya fue utilizado o ha expirado.', true);
        help.hidden = false;
        login.hidden = false;
        button.hidden = true;
      } else {
        message('No pudimos confirmar tu correo en este momento. Espera unos minutos e inténtalo de nuevo.', true);
        busy = false;
        button.disabled = false;
      }
    } finally {
      button.removeAttribute('aria-busy');
      button.textContent = 'CONFIRMAR MI CUENTA';
    }
  });
}
