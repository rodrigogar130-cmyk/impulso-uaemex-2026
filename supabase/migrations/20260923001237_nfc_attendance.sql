-- Requiere 001..007. Preparada localmente; no aplicada a producción.
begin;
alter table public.activities
 add column attendance_enabled boolean not null default false;

create table public.activity_attendances (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 activity_id uuid not null references public.activities(id),
 attended_at timestamptz not null default now(),
 method text not null default 'NFC_QR' check(method='NFC_QR'),
 request_id uuid not null,
 unique(user_id,activity_id)
);
create index activity_attendances_activity_idx on public.activity_attendances(activity_id);
alter table public.activity_attendances enable row level security;
revoke all on public.activity_attendances from public,anon,authenticated;
grant select on public.activity_attendances to authenticated;
grant select,insert on public.activity_attendances to service_role;
create policy attendances_read_own on public.activity_attendances for select to authenticated
 using(user_id=(select auth.uid()));

-- Un contador por usuario; no depende de IP compartida en el campus ni de memoria de una instancia.
create schema if not exists impulso_private;
revoke all on schema impulso_private from public,anon,authenticated;
grant usage on schema impulso_private to service_role;
-- Tokens de punto, recuperables solo por RPC administrativa autorizada. Nunca en el catálogo.
create table impulso_private.attendance_points (
 activity_id uuid primary key references public.activities(id) on delete cascade,
 point_token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 check(point_token ~ '^[a-f0-9]{64}$')
);
create table impulso_private.attendance_control_log (
 id bigint generated always as identity primary key,
 activity_id uuid not null references public.activities(id) on delete cascade,
 enabled boolean not null,
 changed_by uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default now()
);
create index attendance_control_log_activity_idx on impulso_private.attendance_control_log(activity_id,id desc);
alter table impulso_private.attendance_points enable row level security;
alter table impulso_private.attendance_control_log enable row level security;
revoke all on impulso_private.attendance_points,impulso_private.attendance_control_log from public,anon,authenticated;
grant select on impulso_private.attendance_points to service_role;
create table impulso_private.nfc_rate_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null
);
alter table impulso_private.nfc_rate_limits enable row level security;
revoke all on impulso_private.nfc_rate_limits from public,anon,authenticated;
grant select,insert,update on impulso_private.nfc_rate_limits to service_role;
create function public.consume_nfc_attempt(p_user_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_attempts integer; v_now timestamptz:=clock_timestamp();
begin
 insert into impulso_private.nfc_rate_limits as r(user_id,window_start,attempts)
 values(p_user_id,v_now,1)
 on conflict(user_id) do update set
 attempts=case when r.window_start<=v_now-interval '1 minute' then 1 else least(r.attempts+1,31) end,
 window_start=case when r.window_start<=v_now-interval '1 minute' then v_now else r.window_start end
 returning attempts into v_attempts;
 return v_attempts<=30;
end $$;
revoke all on function public.consume_nfc_attempt(uuid) from public,anon,authenticated;
grant execute on function public.consume_nfc_attempt(uuid) to service_role;

-- Solo el backend con usuario verificado y Siteverify válido puede ejecutar esta operación.
create function public.confirm_nfc_attendance(p_user_id uuid,p_activity_id uuid,p_request_id uuid,p_point_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.activities%rowtype; v_attendance public.activity_attendances%rowtype;
begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then
  return jsonb_build_object('code','AUTH_REQUIRED'); end if;
 -- Mismo orden que selección/cancelación/borrado de actividades. SHARE permite escaneos concurrentes.
 select ac.* into a from public.activities ac join public.events e on e.id=ac.event_id
 where ac.id=p_activity_id and e.slug='impulso-uaemex-2026' and e.status in ('open','closed') for share of ac;
 if not found then return jsonb_build_object('code','ACTIVITY_NOT_FOUND'); end if;
 if p_point_token is null or p_point_token !~ '^[a-f0-9]{64}$' or not exists(
  select 1 from impulso_private.attendance_points where activity_id=a.id and point_token=p_point_token
 ) then return jsonb_build_object('code','POINT_TOKEN_INVALID'); end if;
 perform 1 from public.event_registrations where user_id=p_user_id and event_id=a.event_id and status='confirmed' for share;
 if not found then return jsonb_build_object('code','EVENT_REGISTRATION_REQUIRED'); end if;
 perform 1 from public.profiles where id=p_user_id and privacy_notice_version='2026-09' and privacy_acknowledged_at is not null;
 if not found then return jsonb_build_object('code','PRIVACY_REQUIRED'); end if;
 select * into v_attendance from public.activity_attendances where user_id=p_user_id and activity_id=a.id;
 if found then return jsonb_build_object('code','ALREADY_COMPLETED','attended_at',v_attendance.attended_at); end if;
 if a.status='cancelled' then return jsonb_build_object('code','ACTIVITY_UNAVAILABLE'); end if;
 if not a.attendance_enabled then return jsonb_build_object('code','ATTENDANCE_CLOSED'); end if;
 insert into public.activity_attendances(user_id,activity_id,attended_at,request_id)
 values(p_user_id,a.id,now(),p_request_id) on conflict(user_id,activity_id) do nothing returning * into v_attendance;
 if not found then return jsonb_build_object('code','ALREADY_COMPLETED'); end if;
 return jsonb_build_object('code','RECORDED','attended_at',v_attendance.attended_at);
end $$;
revoke all on function public.confirm_nfc_attendance(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_nfc_attendance(uuid,uuid,uuid,text) to service_role;

-- Usa la autorización administrativa ya existente; no altera el horario publicado.
create function public.admin_get_attendance_control(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype; v_token text; v_log jsonb;
begin
 perform public.require_impulso_admin();
 select ac.* into a from public.activities ac join public.events e on e.id=ac.event_id
 where ac.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of ac;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(a.scenario);
 insert into impulso_private.attendance_points(activity_id) values(a.id) on conflict(activity_id) do nothing;
 select point_token into v_token from impulso_private.attendance_points where activity_id=a.id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc),'[]'::jsonb) into v_log from
 (select l.id,l.enabled,l.changed_by,l.changed_at,p.nombre,p.apellidos from impulso_private.attendance_control_log l
 left join public.profiles p on p.id=l.changed_by where l.activity_id=a.id order by l.id desc limit 50) x;
 return jsonb_build_object('id',a.id,'attendance_enabled',a.attendance_enabled,'point_token',v_token,'audit',v_log);
end $$;
revoke all on function public.admin_get_attendance_control(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_attendance_control(uuid) to authenticated;
create function public.admin_set_attendance_enabled(p_activity_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.activities%rowtype;
begin
 perform public.require_impulso_admin();
 select ac.* into a from public.activities ac join public.events e on e.id=ac.event_id
 where ac.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of ac;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(a.scenario);
 if p_enabled is null then raise exception 'INVALID_ATTENDANCE_STATE'; end if;
 if p_enabled and a.status='cancelled' then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 if a.attendance_enabled is distinct from p_enabled then
  update public.activities set attendance_enabled=p_enabled where id=a.id;
  insert into impulso_private.attendance_control_log(activity_id,enabled,changed_by) values(a.id,p_enabled,auth.uid());
 end if;
 return public.admin_get_attendance_control(a.id);
end $$;
revoke all on function public.admin_set_attendance_enabled(uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_attendance_enabled(uuid,boolean) to authenticated;

create function public.get_attendance_activity(p_scenario text,p_slug text)
returns table(id uuid,title text,scenario text,slug text,description text,activity_date date,start_time time,end_time time,location text,speaker text,attendance_enabled boolean)
language sql stable security definer set search_path='' as $$
 select a.id,a.title,a.scenario,a.slug,a.description,a.activity_date,a.start_time,a.end_time,a.location,a.speaker,a.attendance_enabled
 from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026' and e.status in ('open','closed') and (a.status in ('open','closed') or (a.status='draft' and a.attendance_enabled)) and a.scenario=p_scenario and a.slug=p_slug;
$$;
revoke all on function public.get_attendance_activity(text,text) from public,anon,authenticated;
grant execute on function public.get_attendance_activity(text,text) to anon,authenticated;

create function public.get_my_passport_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('attendance_count',count(distinct x.activity_id),'badge_unlocked',count(distinct x.activity_id)>=12)
 from public.activity_attendances x join public.activities a on a.id=x.activity_id join public.events e on e.id=a.event_id
 where x.user_id=auth.uid() and e.slug='impulso-uaemex-2026';
$$;
revoke all on function public.get_my_passport_status() from public,anon,authenticated;
grant execute on function public.get_my_passport_status() to authenticated;
create function public.get_my_impulso_attendances() returns table(activity_id uuid,attended_at timestamptz,method text,title text)
language sql stable security definer set search_path='' as $$
 select x.activity_id,x.attended_at,x.method,a.title from public.activity_attendances x
 join public.activities a on a.id=x.activity_id join public.events e on e.id=a.event_id
 where x.user_id=auth.uid() and e.slug='impulso-uaemex-2026' order by x.attended_at desc;
$$;
revoke all on function public.get_my_impulso_attendances() from public,anon,authenticated;
grant execute on function public.get_my_impulso_attendances() to authenticated;
create or replace function public.admin_get_dashboard_stats() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event uuid;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 select id into v_event from public.events where slug='impulso-uaemex-2026';
 return jsonb_build_object(
 'users',(select count(*) from public.event_registrations where event_id=v_event and status='confirmed'),
 'routes',(select count(distinct r.user_id) from public.activity_registrations r join public.activities a on a.id=r.activity_id where a.event_id=v_event and r.status='registered'),
 'selections',(select count(*) from public.activity_registrations r join public.activities a on a.id=r.activity_id where a.event_id=v_event and r.status='registered'),
 'activities',(select count(*) from public.activities where event_id=v_event and status='open'),
 'attendance',(select count(*) from public.activity_attendances x join public.activities a on a.id=x.activity_id where a.event_id=v_event));
end $$;
create or replace function public.admin_get_activity(p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.require_impulso_admin();
 select to_jsonb(a)||jsonb_build_object('attendance_count',(select count(*) from public.activity_attendances x where x.activity_id=a.id),'selected_count',
 (select count(*) from public.activity_registrations r where r.activity_id=a.id and r.status='registered'))
 into v_result from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026';
 if v_result is null then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(v_result->>'scenario');
 return v_result;
end $$;
notify pgrst,'reload schema';
commit;
