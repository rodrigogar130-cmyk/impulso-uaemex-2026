import { client } from './supabase-client.js';
export const EVENT_SLUG = 'impulso-uaemex-2026';
export async function ensureRegistration(userId, event) {
  const existing = await getRegistration(userId, event.id);
  if (existing) return existing;
  if (event.status !== 'open') throw new Error('El registro del festival está cerrado. No se pudo completar tu inscripción.');
  return (await registerForEvent(userId, event.id)).registration;
}
export async function getEvent() {
  const { data, error } = await client().from('events').select('*').eq('slug', EVENT_SLUG).single();
  if (error) throw error;
  return data;
}
export async function getRegistration(userId, eventId) {
  const { data, error } = await client().from('event_registrations').select('*').eq('user_id', userId).eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function registerForEvent(userId, eventId) {
  const { data, error } = await client().from('event_registrations').insert({ event_id: eventId }).select().single();
  if (error?.code === '23505') {
    const existing = await getRegistration(userId, eventId);
    if (existing) return { registration: existing, duplicate: true };
  }
  if (error) throw error;
  return { registration: data, duplicate: false };
}
