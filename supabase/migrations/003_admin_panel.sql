-- Fase 3A. Aplicar una vez, después de 002 y su catálogo. Sin altas de administradores.
begin;
create table public.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('super_admin','staff')),
 created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public,anon,authenticated;
-- Sin policies: ningún cliente puede leer ni modificar directamente los roles.
alter table public.activities add column updated_at timestamptz,
 add column updated_by uuid references auth.users(id) on delete set null;
-- Identificar por definición exacta el CHECK anónimo de 002, no por nombre supuesto.
do $$
declare v_name text; v_count integer;
begin
 select min(conname::text),count(*) into v_name,v_count from pg_catalog.pg_constraint
 where conrelid='public.activities'::regclass and contype='c'
 and regexp_replace(replace(pg_catalog.pg_get_constraintdef(oid),'::text',''),'[[:space:]()]','','g')
 = 'CHECKstatus<>''open''ORactivity_dateISNOTNULLANDstart_timeISNOTNULL';
 if v_count<>1 then raise exception 'UNEXPECTED_OPEN_CONSTRAINT'; end if;
 execute format('alter table public.activities drop constraint %I',v_name);
end $$;
alter table public.activities add constraint activities_open_requires_date
 check(status<>'open' or activity_date is not null);
-- Se conserva el CHECK de 002: si ambas horas existen, fin > inicio.
revoke all on public.activities from public,anon,authenticated;
revoke all(updated_at,updated_by) on public.activities from public,anon,authenticated;
grant select(id,event_id,title,slug,description,scenario,speaker,activity_date,
 start_time,end_time,timezone,location,status,created_at)
 on public.activities to anon,authenticated;
-- Las policies RLS de actividades, perfiles e inscripciones se conservan.
-- Cambia el tipo de retorno: DROP sin CASCADE y recreación atómica.
drop function public.list_impulso_activities();
create function public.list_impulso_activities() returns table(
 id uuid,event_id uuid,title text,slug text,description text,scenario text,speaker text,
 activity_date date,start_time time,end_time time,timezone text,location text,status text,created_at timestamptz
) language sql stable security definer set search_path='' as $$
 select a.id,a.event_id,a.title,a.slug,a.description,a.scenario,a.speaker,
 a.activity_date,a.start_time,a.end_time,a.timezone,a.location,a.status,a.created_at
 from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026' and e.status in ('open','closed') and a.status='open'
 order by a.activity_date,a.start_time nulls last,a.id;
$$;
create or replace function public.get_my_impulso_route() returns table(
 id uuid,activity_id uuid,status text,reminder_enabled boolean,created_at timestamptz,activity jsonb
) language sql stable security definer set search_path='' as $$
 select r.id,r.activity_id,r.status,r.reminder_enabled,r.created_at,
 case when a.status='open' then jsonb_build_object(
 'id',a.id,'event_id',a.event_id,'title',a.title,'slug',a.slug,'description',a.description,
 'scenario',a.scenario,'speaker',a.speaker,'activity_date',a.activity_date,
 'start_time',a.start_time,'end_time',a.end_time,'timezone',a.timezone,
 'location',a.location,'status',a.status,'created_at',a.created_at) else null end
 from public.activity_registrations r join public.activities a on a.id=r.activity_id
 join public.events e on e.id=a.event_id
 where r.user_id=auth.uid() and e.slug='impulso-uaemex-2026' and r.status='registered'
 order by a.activity_date nulls last,a.start_time nulls last,r.id;
$$;
revoke all on function public.list_impulso_activities(),public.get_my_impulso_route() from public,anon,authenticated;
grant execute on function public.list_impulso_activities() to anon,authenticated;
grant execute on function public.get_my_impulso_route() to authenticated;

-- Helper privado. Todas las RPC administrativas invocan esta comprobación.
create function public.require_impulso_admin() returns text
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 select role into v_role from public.admin_users where user_id=auth.uid() for share;
 if v_role is null then raise exception 'ADMIN_REQUIRED'; end if;
 return v_role;
end $$;
revoke all on function public.require_impulso_admin() from public,anon,authenticated;

create function public.admin_get_access() returns text
language plpgsql security definer set search_path='' as $$
begin return public.require_impulso_admin(); end $$;

create function public.admin_get_dashboard_stats() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event uuid;
begin
 perform public.require_impulso_admin();
 select id into v_event from public.events where slug='impulso-uaemex-2026';
 return jsonb_build_object(
 'users',(select count(*) from public.event_registrations where event_id=v_event and status='confirmed'),
 'routes',(select count(distinct r.user_id) from public.activity_registrations r join public.activities a on a.id=r.activity_id where a.event_id=v_event and r.status='registered'),
 'selections',(select count(*) from public.activity_registrations r join public.activities a on a.id=r.activity_id where a.event_id=v_event and r.status='registered'),
 'activities',(select count(*) from public.activities where event_id=v_event and status='open'),
 'attendance',0);
end $$;

create function public.admin_list_activities() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_impulso_admin();
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select a.*,(select count(*) from public.activity_registrations r where r.activity_id=a.id and r.status='registered') as selected_count
 from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026' order by a.activity_date nulls last,a.start_time nulls last,a.id
 ) x),'[]'::jsonb);
end $$;

create function public.admin_get_activity(p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.require_impulso_admin();
 select to_jsonb(a)||jsonb_build_object('selected_count',
 (select count(*) from public.activity_registrations r where r.activity_id=a.id and r.status='registered'))
 into v_result from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026';
 if v_result is null then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 return v_result;
end $$;

create function public.admin_get_activity_participants(p_activity_id uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_rows jsonb; v_total bigint;
begin
 perform public.require_impulso_admin();
 select a.event_id into v_event from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026';
 if v_event is null then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 select count(*) into v_total from public.activity_registrations where activity_id=p_activity_id and status='registered';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_rows from (
 select p.id as user_id,p.nombre,p.apellidos,p.email,p.tipo_usuario,p.espacio_academico,er.folio,r.status
 from public.activity_registrations r join public.profiles p on p.id=r.user_id
 left join public.event_registrations er on er.user_id=p.id and er.event_id=v_event
 where r.activity_id=p_activity_id and r.status='registered' order by p.apellidos,p.nombre,p.id
 limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)
 ) x;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create function public.admin_list_users(p_search text default '',p_offset integer default 0,p_limit integer default 50,p_only_routes boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.require_impulso_admin();
 with matched as (
 select p.id as user_id,p.nombre,p.apellidos,p.email,p.tipo_usuario,p.espacio_academico,er.folio,er.status,
 (select count(*) from public.activity_registrations r join public.activities a on a.id=r.activity_id
  where r.user_id=p.id and a.event_id=e.id and r.status='registered') as selected_count
 from public.profiles p join public.event_registrations er on er.user_id=p.id
 join public.events e on e.id=er.event_id where e.slug='impulso-uaemex-2026'
 and (coalesce(p_search,'')='' or strpos(lower(p.nombre||' '||p.apellidos||' '||p.email||' '||er.folio),lower(p_search))>0)
 ), filtered as (select * from matched where not coalesce(p_only_routes,false) or selected_count>0),
 paged as (select * from filtered order by apellidos,nombre,user_id
 limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
 'total',(select count(*) from filtered)) into v_result;
 return v_result;
end $$;

create function public.admin_get_user_route(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_impulso_admin();
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.id,r.status,r.created_at,a.id as activity_id,a.title,a.scenario,a.activity_date,a.start_time,a.end_time,a.location
 from public.activity_registrations r join public.activities a on a.id=r.activity_id
 join public.events e on e.id=a.event_id
 where r.user_id=p_user_id and e.slug='impulso-uaemex-2026' and r.status='registered'
 order by a.activity_date nulls last,a.start_time nulls last,a.id) x),'[]'::jsonb);
end $$;

create function public.admin_update_activity(p_activity_id uuid,p_speaker text,p_activity_date date,
 p_start_time time,p_end_time time,p_location text,p_description text,p_status text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_activity public.activities%rowtype;
begin
 perform public.require_impulso_admin();
 select a.* into v_activity from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of a;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 if not (v_activity.updated_at is not distinct from p_expected_updated_at) then raise exception 'EDIT_CONFLICT'; end if;
 if p_status is null or p_status not in ('draft','open','closed','cancelled') then raise exception 'INVALID_ACTIVITY_STATUS'; end if;
 if p_status='open' and p_activity_date is null then raise exception 'ACTIVITY_DATE_REQUIRED'; end if;
 if p_start_time is not null and p_end_time is not null and p_end_time<=p_start_time then raise exception 'INVALID_ACTIVITY_TIME'; end if;
 update public.activities set speaker=nullif(trim(p_speaker),''),activity_date=p_activity_date,
 start_time=p_start_time,end_time=p_end_time,location=nullif(trim(p_location),''),description=nullif(trim(p_description),''),
 status=p_status,updated_at=now(),updated_by=auth.uid() where id=p_activity_id;
 return public.admin_get_activity(p_activity_id);
end $$;

revoke all on function public.admin_get_access(),public.admin_get_dashboard_stats(),public.admin_list_activities(),
 public.admin_get_activity(uuid),public.admin_get_activity_participants(uuid,integer,integer),
 public.admin_list_users(text,integer,integer,boolean),public.admin_get_user_route(uuid),
 public.admin_update_activity(uuid,text,date,time,time,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_get_access(),public.admin_get_dashboard_stats(),public.admin_list_activities(),
 public.admin_get_activity(uuid),public.admin_get_activity_participants(uuid,integer,integer),
 public.admin_list_users(text,integer,integer,boolean),public.admin_get_user_route(uuid),
 public.admin_update_activity(uuid,text,date,time,time,text,text,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
