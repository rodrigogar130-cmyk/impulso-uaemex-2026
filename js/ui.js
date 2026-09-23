export function message(text, error = false, target = document.querySelector('[data-message]')) {
  if (!target) return;
  target.textContent = text;
  target.dataset.error = String(error);
  target.hidden = !text;
}
export function errorText(error) {
  const codes = { invalid_credentials: 'Correo o contraseña incorrectos.', email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
    captcha_failed: 'No pudimos completar la verificación de seguridad. Inténtalo nuevamente.',
    user_already_exists: 'Revisa tu correo electrónico. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.',
    email_exists: 'Revisa tu correo electrónico. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.',
    weak_password: 'La contraseña no cumple los requisitos de seguridad.',
    same_password: 'Elige una contraseña diferente a la anterior.',
    over_email_send_rate_limit: 'Se alcanzó temporalmente el límite de envío de correos. Inténtalo más tarde.',
    over_request_rate_limit: 'Hay demasiados intentos. Espera unos minutos.',
    '42501': 'No tienes permiso para realizar esta operación.',
    '23514': 'Revisa los datos requeridos del formulario.' };
  if (codes[error?.code]) return codes[error.code];
  if (/error sending (confirmation|recovery|magic link) (email|mail)/i.test(error?.message || '')) {
    return 'No se pudo enviar el correo de verificación o recuperación. El servicio de correo necesita revisión. Inténtalo más tarde.';
  }
  if (error?.status >= 500 || error?.code === 'unexpected_failure') {
    return 'El servicio de autenticación no pudo completar la solicitud. Inténtalo más tarde. Referencia: AUTH-SERVER.';
  }
  if (error instanceof Error && !error.code && !error.status && !/fetch|network/i.test(error.message)) return error.message;
  return 'No se pudo completar la operación. Comprueba tu conexión e inténtalo de nuevo.';
}
export function bindForm(form, action) {
  let busy = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);
    form.setAttribute('aria-busy', 'true');
    message('Procesando…');
    try { await action(new FormData(form)); }
    catch (error) { message(errorText(error), true); }
    finally { busy = false; buttons.forEach(button => button.disabled = false); form.removeAttribute('aria-busy'); }
  });
}
export function studentFields(form) {
  const select = form.elements.tipo_usuario;
  const group = form.querySelector('[data-student]');
  const update = () => {
    const student = select.value === 'Estudiante';
    group.hidden = !student;
    group.querySelectorAll('input').forEach(input => { input.required = student; input.disabled = !student; });
  };
  select.addEventListener('change', update);
  update();
  return update;
}
export function profileData(data) {
  const result = {};
  for (const name of ['nombre', 'apellidos', 'tipo_usuario', 'numero_cuenta', 'espacio_academico', 'telefono']) {
    result[name] = String(data.get(name) || '').trim() || null;
  }
  if (result.tipo_usuario !== 'Estudiante') { result.numero_cuenta = null; result.espacio_academico = null; }
  if (!result.nombre || !result.apellidos) throw new Error('Escribe tu nombre y apellidos.');
  if (!['Estudiante', 'Docente', 'Administrativo', 'Investigador', 'Empresario', 'Público general'].includes(result.tipo_usuario)) throw new Error('Selecciona tu tipo de usuario.');
  if (result.tipo_usuario === 'Estudiante' && (!result.numero_cuenta || !result.espacio_academico)) throw new Error('Completa tu número de cuenta y espacio académico.');
  return result;
}
export function matchingPassword(data) {
  const password = String(data.get('password') || '');
  if (password.length < 8) throw new Error('Utiliza al menos 8 caracteres en la contraseña.');
  if (password !== data.get('confirm_password')) throw new Error('Las contraseñas no coinciden.');
  return password;
}
