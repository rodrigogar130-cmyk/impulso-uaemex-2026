import { getVerifiedSession } from './auth.js?v=20260921-4';
import { ensureProfile } from './profile.js?v=20260921-4';
import { getEvent, ensureRegistration } from './event-registration.js?v=20260921-4';
// Solo después del acceso autenticado; nunca desde signUp.
export async function prepareAccount(verifiedUser) {
  // Only pass a user just returned by requireUser/getVerifiedSession in this operation.
  const user = verifiedUser || (await getVerifiedSession())?.user;
  if (!user?.email_confirmed_at) throw new Error('Confirma tu correo antes de continuar.');
  const profile = await ensureProfile(user);
  if (!profile) return { user, profile: null, event: null, registration: null };
  const event = await getEvent();
  const registration = await ensureRegistration(user.id, event);
  return { user, profile, event, registration };
}
