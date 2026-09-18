-- Ejecutar después de la migración en SQL Editor.
select relname, relrowsecurity from pg_class
where oid in ('public.profiles'::regclass,'public.events'::regclass,'public.event_registrations'::regclass);
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('profiles','events','event_registrations');
select table_name, column_name, privilege_type from information_schema.column_privileges
where grantee = 'authenticated' and table_schema = 'public'
and table_name in ('profiles','events','event_registrations') order by table_name,column_name,privilege_type;
select nombre,slug,status,fecha_inicio,fecha_fin from public.events where slug = 'impulso-uaemex-2026';
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.event_registrations'::regclass;
select sequencename,max_value,cycle from pg_sequences where schemaname='public' and sequencename='impulso_2026_folio_seq';
