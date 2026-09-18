-- Solo lectura. Ejecutar en SQL Editor después de 002 y de la semilla.
select relname,relrowsecurity from pg_class where oid in
 ('public.activities'::regclass,'public.activity_registrations'::regclass);
select tablename,policyname,cmd,roles,qual from pg_policies
 where schemaname='public' and tablename in ('activities','activity_registrations');
select status,count(*) from public.activities
 where event_id=(select id from public.events where slug='impulso-uaemex-2026') group by status;
select count(*) filter(where activity_date is not null and start_time is not null and end_time is not null) as horario_completo
 from public.activities where event_id=(select id from public.events where slug='impulso-uaemex-2026');
select a.id,a.title,count(r.id) as registrados
 from public.activities a left join public.activity_registrations r on r.activity_id=a.id and r.status='registered'
 group by a.id;
select has_table_privilege('authenticated','public.activity_registrations','INSERT') as insert_directo,
 has_table_privilege('authenticated','public.activity_registrations','UPDATE') as update_directo,
 has_table_privilege('anon','public.activity_registrations','SELECT') as lectura_anonima,
 has_function_privilege('authenticated','public.set_my_activity_registration(uuid,text,boolean)','EXECUTE') as rpc_autenticado;
-- Esperado: false, false, false, true.
