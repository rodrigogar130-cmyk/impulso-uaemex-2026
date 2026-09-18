-- Verificaciones de solo lectura después de 003. No crea usuarios ni roles.
select relrowsecurity from pg_class where oid='public.admin_users'::regclass;
select role,count(*) from public.admin_users group by role;
select has_table_privilege('authenticated','public.activities','UPDATE') as update_directo,
 has_column_privilege('anon','public.activities','updated_by','SELECT') as auditoria_anon,
 has_column_privilege('authenticated','public.activities','updated_by','SELECT') as auditoria_authenticated,
 has_table_privilege('authenticated','public.admin_users','INSERT') as asignacion_roles;
-- Las cuatro columnas anteriores deben ser false.
select count(*) as actividades from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026';
select conname,pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.activities'::regclass and contype='c';
