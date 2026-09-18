import { client } from './supabase-client.js';
import { ensureProfile } from './profile.js';
import { getEvent, ensureRegistration } from './event-registration.js';
// Solo después del acceso autenticado; nunca desde signUp.
export async function prepareAccount() {
  const { data, error } = await client().auth.getUser();
  if (error) throw error;
  const user = data.user;
  if (!user?.email_confirmed_at) throw new Error('Confirma tu correo antes de continuar.');
  const profile = await ensureProfile(user);
  if (!profile) return { user, profile: null, event: null, registration: null };
  const event = await getEvent();
  const registration = await ensureRegistration(user.id, event);
  return { user, profile, event, registration };
}
