-- Preparada localmente. Requiere 004; no ejecutar automáticamente.
begin;
create table public.admin_scenario_access (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.admin_users(user_id) on delete cascade,
 scenario text not null check (scenario in ('cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar')),
 created_at timestamptz not null default now(),
 unique(user_id,scenario)
);
alter table public.admin_scenario_access enable row level security;
revoke all on public.admin_scenario_access from public,anon,authenticated;
-- Sin policies ni grants para clientes. Asignaciones manuales por operador autorizado.
create function public.require_impulso_scenario_access(p_scenario text) returns void
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 select role into v_role from public.admin_users where user_id=auth.uid() for share;
 if v_role='super_admin' then return; end if;
 if v_role='staff' then
  perform 1 from public.admin_scenario_access
  where user_id=auth.uid() and scenario=p_scenario for share;
  if found then return; end if;
 end if;
 raise exception 'SCENARIO_ADMIN_REQUIRED';
end $$;
revoke all on function public.require_impulso_scenario_access(text) from public,anon,authenticated;

create function public.admin_list_scenarios() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 v_role:=public.require_impulso_admin();
 return (with scenarios(scenario,label,position) as (values
 ('cultura','Cultura e Innovación Creativa',1),('deporte','Deporte',2),
 ('tecnologia','Tecnología',3),('diseno','Diseño',4),
 ('investigacion','Investigación Aplicada',5),('gobernanza','Gobernanza',6),
 ('bienestar','Bienestar Integral',7)), counts as (
 select s.scenario,s.label,s.position,count(a.id) as total_activities,
 count(a.id) filter(where a.status='open') as open_count,
 count(a.id) filter(where a.status='draft') as draft_count,
 count(a.id) filter(where a.status='closed') as closed_count,
 count(a.id) filter(where a.status='cancelled') as cancelled_count
 from scenarios s left join public.activities a on a.scenario=s.scenario
 and a.event_id=(select id from public.events where slug='impulso-uaemex-2026')
 where v_role='super_admin' or exists(select 1 from public.admin_scenario_access x
 where x.user_id=auth.uid() and x.scenario=s.scenario)
 group by s.scenario,s.label,s.position)
 select coalesce(jsonb_agg(to_jsonb(counts)-'position' order by position),'[]'::jsonb) from counts);
end $$;

-- Retirar la firma anterior: una sola RPC, con filtro opcional.
drop function public.admin_list_activities();
create function public.admin_list_activities(p_scenario text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 v_role:=public.require_impulso_admin();
 if p_scenario is not null then perform public.require_impulso_scenario_access(p_scenario); end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select a.*,(select count(*) from public.activity_registrations r
 where r.activity_id=a.id and r.status='registered') as selected_count
 from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026' and (p_scenario is null or a.scenario=p_scenario)
 and (v_role='super_admin' or exists(select 1 from public.admin_scenario_access x
 where x.user_id=auth.uid() and x.scenario=a.scenario))
 order by a.activity_date nulls last,a.start_time nulls last,a.id
 ) x),'[]'::jsonb);
end $$;

create or replace function public.admin_get_activity(p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.require_impulso_admin();
 select to_jsonb(a)||jsonb_build_object('selected_count',
 (select count(*) from public.activity_registrations r where r.activity_id=a.id and r.status='registered'))
 into v_result from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026';
 if v_result is null then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(v_result->>'scenario');
 return v_result;
end $$;

create or replace function public.admin_update_activity(p_activity_id uuid,p_title text,p_scenario text,p_speaker text,p_activity_date date,
 p_start_time time,p_end_time time,p_location text,p_description text,p_status text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_activity public.activities%rowtype;
begin
 perform public.require_impulso_admin();
 select a.* into v_activity from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of a;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(v_activity.scenario);
 if not (v_activity.updated_at is not distinct from p_expected_updated_at) then raise exception 'EDIT_CONFLICT'; end if;
 if p_title is null or trim(p_title)='' then raise exception 'ACTIVITY_TITLE_REQUIRED'; end if;
 if p_scenario is null or p_scenario not in ('cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar') then raise exception 'INVALID_ACTIVITY_SCENARIO'; end if;
 perform public.require_impulso_scenario_access(p_scenario);
 if p_status is null or p_status not in ('draft','open','closed','cancelled') then raise exception 'INVALID_ACTIVITY_STATUS'; end if;
 if p_status='open' and p_activity_date is null then raise exception 'ACTIVITY_DATE_REQUIRED'; end if;
 if p_start_time is not null and p_end_time is not null and p_end_time<=p_start_time then raise exception 'INVALID_ACTIVITY_TIME'; end if;
 update public.activities set title=trim(p_title),scenario=p_scenario,speaker=nullif(trim(p_speaker),''),activity_date=p_activity_date,
 start_time=p_start_time,end_time=p_end_time,location=nullif(trim(p_location),''),description=nullif(trim(p_description),''),
 status=p_status,updated_at=now(),updated_by=auth.uid() where id=p_activity_id;
 return public.admin_get_activity(p_activity_id);
end $$;

-- Datos globales y personales: exclusivos de super_admin.
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
 'attendance',0);
end $$;

create or replace function public.admin_get_activity_participants(p_activity_id uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_rows jsonb; v_total bigint;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
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

create or replace function public.admin_list_users(p_search text default '',p_offset integer default 0,p_limit integer default 50,p_only_routes boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
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

create or replace function public.admin_get_user_route(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.id,r.status,r.created_at,a.id as activity_id,a.title,a.scenario,a.activity_date,a.start_time,a.end_time,a.location
 from public.activity_registrations r join public.activities a on a.id=r.activity_id
 join public.events e on e.id=a.event_id
 where r.user_id=p_user_id and e.slug='impulso-uaemex-2026' and r.status='registered'
 order by a.activity_date nulls last,a.start_time nulls last,a.id) x),'[]'::jsonb);
end $$;

revoke all on function public.admin_list_scenarios(),public.admin_list_activities(text),
 public.admin_get_activity(uuid),public.admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz),
 public.admin_get_dashboard_stats(),public.admin_get_activity_participants(uuid,integer,integer),
 public.admin_list_users(text,integer,integer,boolean),public.admin_get_user_route(uuid) from public,anon,authenticated;
grant execute on function public.admin_list_scenarios(),public.admin_list_activities(text),
 public.admin_get_activity(uuid),public.admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz),
 public.admin_get_dashboard_stats(),public.admin_get_activity_participants(uuid,integer,integer),
 public.admin_list_users(text,integer,integer,boolean),public.admin_get_user_route(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
