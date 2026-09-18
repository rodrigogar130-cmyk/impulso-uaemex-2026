begin;
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email text not null default (auth.jwt() ->> 'email'),
  nombre text not null check (length(trim(nombre)) between 1 and 100),
  apellidos text not null check (length(trim(apellidos)) between 1 and 150),
  numero_cuenta text check (length(numero_cuenta) <= 40),
  espacio_academico text check (length(espacio_academico) <= 200),
  tipo_usuario text not null check (tipo_usuario in ('Estudiante','Docente','Administrativo','Investigador','Empresario','Público general')),
  telefono text check (length(telefono) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_fields_required check (tipo_usuario <> 'Estudiante' or (
    nullif(trim(numero_cuenta), '') is not null and nullif(trim(espacio_academico), '') is not null))
);
create function public.set_profile_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_profile_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  fecha_inicio date not null,
  fecha_fin date not null,
  ubicacion text not null,
  status text not null default 'draft' check (status in ('draft','open','closed')),
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);
create sequence public.impulso_2026_folio_seq as bigint start with 1 maxvalue 999999 no cycle;
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id),
  folio text not null unique check (folio ~ '^IMP-2026-[0-9]{6}$'),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id,event_id)
);
create index event_registrations_event_id_idx on public.event_registrations(event_id);
create function public.assign_impulso_folio() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.folio := 'IMP-2026-' || lpad(nextval('public.impulso_2026_folio_seq'::regclass)::text,6,'0');
  new.status := 'confirmed'; new.created_at := now(); return new;
end;
$$;
revoke all on function public.assign_impulso_folio() from public, anon, authenticated;
revoke all on sequence public.impulso_2026_folio_seq from public, anon, authenticated;
create trigger assign_registration_folio before insert on public.event_registrations for each row execute function public.assign_impulso_folio();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
revoke all on table public.profiles,public.events,public.event_registrations from public,anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant insert (nombre,apellidos,numero_cuenta,espacio_academico,tipo_usuario,telefono) on public.profiles to authenticated;
grant update (nombre,apellidos,numero_cuenta,espacio_academico,tipo_usuario,telefono) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated with check (
  id = (select auth.uid()) and email = (select auth.jwt() ->> 'email')
);
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.events to authenticated;
create policy events_read_published on public.events for select to authenticated using (status in ('open','closed'));
grant select on public.event_registrations to authenticated;
grant insert (event_id) on public.event_registrations to authenticated;
create policy registrations_select_own on public.event_registrations for select to authenticated using (user_id = (select auth.uid()));
create policy registrations_insert_own on public.event_registrations for insert to authenticated with check (
  user_id = (select auth.uid()) and status = 'confirmed'
  and exists (select 1 from public.events e where e.id = event_id and e.slug = 'impulso-uaemex-2026' and e.status = 'open')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
);
insert into public.events (nombre,slug,fecha_inicio,fecha_fin,ubicacion,status) values (
  'IMPULSO UAEMÉX 2026','impulso-uaemex-2026','2026-10-15','2026-10-16',
  'Ciudad Universitaria, Toluca, Estado de México','open'
);
commit;
