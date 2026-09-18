import { client } from './supabase-client.js';
const fields = ['nombre', 'apellidos', 'tipo_usuario', 'numero_cuenta', 'espacio_academico', 'telefono'];
export async function getProfile(userId) {
  const { data, error } = await client().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function ensureProfile(user) {
  const existing = await getProfile(user.id);
  if (existing) return existing;
  const values = Object.fromEntries(fields.map(key => [key, user.user_metadata?.[key] || null]));
  if (!values.nombre || !values.apellidos || !values.tipo_usuario) return null;
  if (values.tipo_usuario === 'Estudiante' && (!values.numero_cuenta || !values.espacio_academico)) return null;
  const { data, error } = await client().from('profiles').insert(values).select().single();
  if (error?.code === '23505') return getProfile(user.id);
  if (error) throw error;
  return data;
}
export async function saveProfile(userId, values, exists) {
  const query = exists ? client().from('profiles').update(values).eq('id', userId) : client().from('profiles').insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
