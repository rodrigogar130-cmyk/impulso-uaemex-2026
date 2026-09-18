import { client } from './supabase-client.js';
import { confirmationPath } from './return-to.js';
export const landing = 'index-impulso-uaemex-365.html';
export function localUrl(page) { return new URL(page, window.location.href).href; }
export async function getSession() {
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  // La sesión almacenada puede sobrevivir a la eliminación del usuario remoto.
  const { data: verified, error: verificationError } = await client().auth.getUser();
  if (verificationError) {
    const invalid = [401, 403, 404].includes(verificationError.status)
      || ['user_not_found', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(verificationError.code);
    if (!invalid) throw verificationError; // Un fallo de red no borra una sesión válida.
    await client().auth.signOut({ scope: 'local' });
    return null;
  }
  if (!verified?.user) {
    await client().auth.signOut({ scope: 'local' });
    return null;
  }
  return data.session;
}
export async function requireUser() {
  if (!await getSession()) { location.replace('login.html'); return null; }
  const { data, error } = await client().auth.getUser();
  if (error || !data.user?.email_confirmed_at) { location.replace('login.html'); return null; }
  return data.user;
}
export async function signUp(email, password, profile) {
  const { data, error } = await client().auth.signUp({ email, password,
    options: { data: profile, emailRedirectTo: localUrl(confirmationPath()) } });
  if (error) throw error;
  // No permitir que una configuración remota sin confirmación inicie una sesión aquí.
  if (data.session) await signOut();
  return data;
}
export async function signInWithPassword(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user.email_confirmed_at) { await signOut(); throw new Error('Confirma tu correo antes de iniciar sesión.'); }
  return data;
}
export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}
export function onAuthStateChange(callback) { return client().auth.onAuthStateChange(callback); }
export async function requestRecovery(email) {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: localUrl('recuperar-password.html?mode=reset') });
  if (error) throw error;
}
export async function resendConfirmation(email) {
  const { error } = await client().auth.resend({ type: 'signup', email,
    options: { emailRedirectTo: localUrl(confirmationPath()) } });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}
