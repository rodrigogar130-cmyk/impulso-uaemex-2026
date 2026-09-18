-- Prueba transaccional con dos usuarios temporales. Ejecutar como postgres.
-- Las filas se revierten; los números de secuencia consumidos NO se reciclan.
begin;
do $$
begin
  if (select count(*) from pg_class where oid in ('public.profiles'::regclass,'public.events'::regclass,'public.event_registrations'::regclass) and relrowsecurity) <> 3 then
    raise exception 'FAIL: RLS no está habilitado en las tres tablas';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename in ('profiles','events','event_registrations')) <> 6 then
    raise exception 'FAIL: políticas inesperadas';
  end if;
  if not exists(select 1 from public.events where slug='impulso-uaemex-2026' and status='open') then
    raise exception 'FAIL: evento inicial';
  end if;
  if has_column_privilege('authenticated','public.profiles','email','UPDATE')
    or has_column_privilege('authenticated','public.event_registrations','folio','INSERT')
    or has_column_privilege('authenticated','public.event_registrations','user_id','INSERT')
    or has_table_privilege('authenticated','public.event_registrations','UPDATE')
    or has_table_privilege('anon','public.profiles','SELECT') then
    raise exception 'FAIL: permisos excesivos';
  end if;
end $$;

insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111','phase1-a@example.invalid',now(),'{}'),
       ('22222222-2222-4222-8222-222222222222','phase1-b@example.invalid',now(),'{}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"phase1-a@example.invalid","role":"authenticated"}',true);
insert into public.profiles(nombre,apellidos,tipo_usuario) values ('Usuario A','Prueba','Público general');
do $$ begin
  if exists(select 1 from public.event_registrations) then raise exception 'FAIL: registro automático'; end if;
end $$;
insert into public.event_registrations(event_id) select id from public.events where slug='impulso-uaemex-2026';

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"phase1-b@example.invalid","role":"authenticated"}',true);
insert into public.profiles(nombre,apellidos,tipo_usuario,numero_cuenta,espacio_academico)
values ('Usuario B','Prueba','Estudiante','TEST-2026','Espacio de prueba');
insert into public.event_registrations(event_id) select id from public.events where slug='impulso-uaemex-2026';
do $$
declare n integer;
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: B ve perfiles ajenos'; end if;
  if (select count(*) from public.event_registrations) <> 1 then raise exception 'FAIL: B ve registros ajenos'; end if;
  update public.profiles set nombre='Intrusión B' where id='11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B puede modificar A'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"phase1-a@example.invalid","role":"authenticated"}',true);
do $$
declare n integer;
begin
  if exists(select 1 from public.profiles where id='22222222-2222-4222-8222-222222222222') then raise exception 'FAIL: A ve perfil B'; end if;
  if exists(select 1 from public.event_registrations where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'FAIL: A ve registro B'; end if;
  update public.profiles set nombre='Intrusión A' where id='22222222-2222-4222-8222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A puede modificar B'; end if;
  update public.profiles set nombre='Usuario A editado' where id=auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A no puede editar su perfil'; end if;
  begin
    insert into public.event_registrations(event_id) select id from public.events where slug='impulso-uaemex-2026';
    raise exception 'FAIL: registro duplicado permitido';
  exception when unique_violation then null; end;
  begin
    insert into public.event_registrations(event_id,user_id)
      select id,'22222222-2222-4222-8222-222222222222'::uuid from public.events where slug='impulso-uaemex-2026';
    raise exception 'FAIL: suplantación permitida';
  exception when insufficient_privilege then null; end;
  begin
    update public.event_registrations set status='cancelled' where user_id=auth.uid();
    raise exception 'FAIL: cambio de estado permitido';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set email='otro@example.invalid' where id=auth.uid();
    raise exception 'FAIL: cambio de correo permitido';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set tipo_usuario='Estudiante',numero_cuenta=null,espacio_academico=null where id=auth.uid();
    raise exception 'FAIL: estudiante incompleto permitido';
  exception when check_violation then null; end;
end $$;
reset role;
do $$
begin
  if (select count(distinct folio) from public.event_registrations where user_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')) <> 2 then
    raise exception 'FAIL: folios duplicados';
  end if;
  if exists(select 1 from public.event_registrations where folio !~ '^IMP-2026-[0-9]{6}$') then raise exception 'FAIL: formato de folio'; end if;
  if (select nombre from public.profiles where id='22222222-2222-4222-8222-222222222222') <> 'Usuario B' then raise exception 'FAIL: perfil B alterado'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: visitante puede leer perfiles';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: RLS, permisos, dos usuarios, folios, validación y duplicados' as resultado;
