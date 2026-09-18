-- Aplicar DESPUÉS de users_events_phase_one. No recrea tablas de fase 1.
begin;
create table public.activities (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 title text not null check(length(trim(title)) > 0),
 slug text not null,
 description text,
 scenario text not null,
 speaker text,
 activity_date date,
 start_time time,
 end_time time,
 timezone text not null default 'America/Mexico_City' check(timezone='America/Mexico_City'),
 location text,
 status text not null default 'draft' check(status in ('draft','open','closed','cancelled')),
 created_at timestamptz not null default now(),
 unique(event_id,slug),
 check(start_time is null or end_time is null or end_time > start_time),
 check(status <> 'open' or (activity_date is not null and start_time is not null))
);
create table public.activity_registrations (
 id uuid primary key default gen_random_uuid(),
 activity_id uuid not null references public.activities(id),
 user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'registered' check(status in ('registered','cancelled')),
 reminder_enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,activity_id)
);
create index activity_registrations_activity_status_idx on public.activity_registrations(activity_id,status);
create index activities_event_date_idx on public.activities(event_id,activity_date,start_time);

alter table public.activities enable row level security;
alter table public.activity_registrations enable row level security;
revoke all on public.activities,public.activity_registrations from public,anon,authenticated;
grant select on public.activities to anon,authenticated;
create policy activities_read_open on public.activities for select to anon,authenticated using(status='open');
grant select on public.activity_registrations to authenticated;
create policy activity_registrations_read_own on public.activity_registrations for select to authenticated
 using(user_id=(select auth.uid()));

create function public.set_my_activity_registration(p_activity_id uuid,p_status text,p_reminder_enabled boolean default true)
returns public.activity_registrations language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_activity public.activities%rowtype; v_registration public.activity_registrations%rowtype;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
  raise exception 'CONFIRMED_EMAIL_REQUIRED';
 end if;
 if p_status is null or p_status not in ('registered','cancelled') then raise exception 'INVALID_REGISTRATION_STATUS'; end if;
 select a.* into v_activity from public.activities a join public.events e on e.id=a.event_id
  where a.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of a;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 select * into v_registration from public.activity_registrations
  where user_id=v_user and activity_id=p_activity_id for update;
 if p_status='cancelled' then
  if v_registration.id is null or v_registration.status='cancelled' then return v_registration; end if;
  update public.activity_registrations set status='cancelled',updated_at=now() where id=v_registration.id returning * into v_registration;
  return v_registration;
 end if;
 if not exists(select 1 from public.event_registrations where user_id=v_user
  and event_id=v_activity.event_id and status='confirmed') then raise exception 'EVENT_REGISTRATION_REQUIRED'; end if;
 if v_activity.status<>'open' then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 if v_registration.id is not null and v_registration.status='registered' then return v_registration; end if;
 if v_registration.id is null then
  insert into public.activity_registrations(activity_id,user_id,reminder_enabled)
   values(p_activity_id,v_user,coalesce(p_reminder_enabled,true)) returning * into v_registration;
 else
  update public.activity_registrations set status='registered',updated_at=now(),reminder_enabled=coalesce(p_reminder_enabled,true)
   where id=v_registration.id returning * into v_registration;
 end if;
 return v_registration;
end; $$;
revoke all on function public.set_my_activity_registration(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_my_activity_registration(uuid,text,boolean) to authenticated;

-- Catálogo público sin ampliar los permisos de la tabla events de fase 1.
create function public.list_impulso_activities() returns setof public.activities
language sql stable security definer set search_path='' as $$
 select a.* from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026' and e.status in ('open','closed') and a.status='open'
 order by a.activity_date,a.start_time,a.id;
$$;
revoke all on function public.list_impulso_activities() from public,anon,authenticated;
grant execute on function public.list_impulso_activities() to anon,authenticated;

-- Devuelve solo la ruta propia y no revela detalles de actividades no abiertas.
create function public.get_my_impulso_route() returns table(
 id uuid,activity_id uuid,status text,reminder_enabled boolean,created_at timestamptz,activity jsonb
) language sql stable security definer set search_path='' as $$
 select r.id,r.activity_id,r.status,r.reminder_enabled,r.created_at,
   case when a.status='open' then to_jsonb(a) else null end
 from public.activity_registrations r join public.activities a on a.id=r.activity_id
 join public.events e on e.id=a.event_id
 where r.user_id=auth.uid() and e.slug='impulso-uaemex-2026' and r.status='registered'
 order by a.activity_date nulls last,a.start_time nulls last,r.id;
$$;
revoke all on function public.get_my_impulso_route() from public,anon,authenticated;
grant execute on function public.get_my_impulso_route() to authenticated;
commit;
