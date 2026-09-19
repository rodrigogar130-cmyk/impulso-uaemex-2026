import { client } from './supabase-client.js';
import { confirmationPath, googleReturnPath } from './return-to.js';
export const landing = 'index.html';
export function localUrl(page) { return new URL(page, window.location.href).href; }
let localSession, localPromise, verifiedPromise, subscription;
let sessionRevision = 0, identityRevision = 0;
const authListeners = new Set();
function rememberSession(session) {
  const identityChanged = localSession === undefined || localSession?.user.id !== session?.user.id;
  if (identityChanged || localSession?.access_token !== session?.access_token) {
    sessionRevision++;
  }
  if (identityChanged) {
    identityRevision++;
    verifiedPromise = null;
  }
  localSession = session;
}
function watchSession() {
  if (subscription) return;
  subscription = client().auth.onAuthStateChange((event, session) => {
    rememberSession(session);
    // Callbacks must not await Auth methods while the SDK holds its lock.
    for (const callback of authListeners) callback(event, session);
  });
}
// UI only: never use this cached session as authorization for private access.
export function getLocalSession() {
  watchSession();
  if (localSession !== undefined) return Promise.resolve(localSession);
  if (!localPromise) {
    const revision = sessionRevision;
    localPromise = client().auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (revision === sessionRevision) rememberSession(data.session);
      return localSession;
    }).finally(() => { localPromise = null; });
  }
  return localPromise;
}
async function verifySession() {
  const session = await getLocalSession();
  if (!session) return null;
  const revision = identityRevision;
  // La sesión almacenada puede sobrevivir a la eliminación del usuario remoto.
  const { data: verified, error: verificationError } = await client().auth.getUser();
  if (revision !== identityRevision) return null;
  if (verificationError) {
    const invalid = [401, 403, 404].includes(verificationError.status)
      || ['user_not_found', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(verificationError.code);
    if (!invalid) throw verificationError; // Un fallo de red no borra una sesión válida.
    await client().auth.signOut({ scope: 'local' });
    rememberSession(null);
    return null;
  }
  if (!verified?.user) {
    await client().auth.signOut({ scope: 'local' });
    rememberSession(null);
    return null;
  }
  if (verified.user.id !== session.user.id) return null;
  return { ...localSession, user: verified.user };
}
// Share only concurrent verification, not a long-lived authorization cache.
export async function getVerifiedSession() {
  await getLocalSession();
  if (!verifiedPromise) {
    const request = verifySession().finally(() => {
      if (verifiedPromise === request) verifiedPromise = null;
    });
    verifiedPromise = request;
  }
  return verifiedPromise;
}
export const getSession = getVerifiedSession;
export async function requireUser() {
  const session = await getVerifiedSession();
  if (!session?.user.email_confirmed_at) { location.replace('login.html'); return null; }
  return session.user;
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
export async function signInWithGoogle() {
  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: localUrl(googleReturnPath()) }
  });
  if (error) throw error;
  return data;
}
export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}
export function onAuthStateChange(callback) {
  authListeners.add(callback);
  watchSession();
  return { data: { subscription: { unsubscribe() { authListeners.delete(callback); } } } };
}
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
