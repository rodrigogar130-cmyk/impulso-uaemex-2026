begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('33333333-3333-4333-8333-333333333333','route-a@example.invalid',now(),'{}'),
 ('44444444-4444-4444-8444-444444444444','route-b@example.invalid',now(),'{}'),
 ('55555555-5555-4555-8555-555555555555','route-c@example.invalid',null,'{}');
insert into public.profiles(id,email,nombre,apellidos,tipo_usuario) values
 ('33333333-3333-4333-8333-333333333333','route-a@example.invalid','Ruta A','Prueba','Público general'),
 ('44444444-4444-4444-8444-444444444444','route-b@example.invalid','Ruta B','Prueba','Público general'),
 ('55555555-5555-4555-8555-555555555555','route-c@example.invalid','Ruta C','Prueba','Público general');
insert into public.event_registrations(user_id,event_id)
 select u.id,e.id from public.events e cross join (values
 ('33333333-3333-4333-8333-333333333333'::uuid),('44444444-4444-4444-8444-444444444444'::uuid))u(id)
 where e.slug='impulso-uaemex-2026';
insert into public.activities(id,event_id,title,slug,scenario,activity_date,start_time,end_time,location,status)
 select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,'Prueba de ruta','test-route','tecnologia','2026-10-15','10:00','11:00','Sede de prueba','open'
 from public.events where slug='impulso-uaemex-2026';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333"}',true);
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','registered');
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','registered');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444"}',true);
do $$ begin
 if exists(select 1 from public.activity_registrations) then raise exception 'FAIL aislamiento';end if;
end $$;
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','registered');
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cancelled');
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cancelled');
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','registered');
reset role;
do $$ begin
 if (select count(*) from public.activity_registrations where activity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>2 then raise exception 'FAIL duplicados';end if;

end $$;

-- Estado cerrado: rechazar registro, permitir cancelar.
update public.activities set status='closed' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
do $$ begin
 begin
  perform public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','registered');
  raise exception 'FAIL permite cerrado';
 exception when raise_exception then if sqlerrm<>'ACTIVITY_UNAVAILABLE' then raise;end if;end;
 begin
  update public.activity_registrations set status='cancelled';
  raise exception 'FAIL escritura directa';
 exception when insufficient_privilege then null;end;
end $$;
select public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cancelled');
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555"}',true);
do $$ begin
 begin
  perform public.set_my_activity_registration('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','registered');
  raise exception 'FAIL correo';
 exception when raise_exception then if sqlerrm<>'CONFIRMED_EMAIL_REQUIRED' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: sin límites, aislamiento, idempotencia y reactivación' as result;
