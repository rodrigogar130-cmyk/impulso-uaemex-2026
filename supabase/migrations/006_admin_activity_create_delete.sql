-- Pendiente de aplicar. Requiere 005; no modifica actividades existentes ni FKs.
begin;

create function public.admin_create_activity(
 p_title text,p_scenario text,p_speaker text,p_activity_date date,
 p_start_time time,p_end_time time,p_location text,p_description text,p_status text default 'draft'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_event uuid;
 v_base text;
 v_slug text;
 v_suffix bigint:=0;
 v_activity public.activities%rowtype;
begin
 perform public.require_impulso_admin();
 if p_title is null or trim(p_title)='' then raise exception 'ACTIVITY_TITLE_REQUIRED'; end if;
 if p_scenario is null or p_scenario not in ('cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar') then raise exception 'INVALID_ACTIVITY_SCENARIO'; end if;
 perform public.require_impulso_scenario_access(p_scenario);
 if p_status is null or p_status not in ('draft','open','closed','cancelled') then raise exception 'INVALID_ACTIVITY_STATUS'; end if;
 if p_status='open' and p_activity_date is null then raise exception 'ACTIVITY_DATE_REQUIRED'; end if;
 if p_start_time is not null and p_end_time is not null and p_end_time<=p_start_time then raise exception 'INVALID_ACTIVITY_TIME'; end if;
 select id into v_event from public.events where slug='impulso-uaemex-2026';
 if v_event is null then raise exception 'EVENT_UNAVAILABLE'; end if;

 -- Unicode NFD elimina acentos sin instalar extensiones; límite compatible con enlaces.
 v_base:=regexp_replace(normalize(lower(trim(p_title)),NFD),U&'[\0300-\036f]','','g');
 v_base:=trim(both '-' from left(regexp_replace(v_base,'[^a-z0-9]+','-','g'),140));
 if v_base='' then v_base:='actividad'; end if;
 loop
  v_slug:=v_base||case when v_suffix=0 then '' else '-'||v_suffix::text end;
  insert into public.activities(event_id,title,slug,scenario,speaker,activity_date,
   start_time,end_time,location,description,status,timezone,updated_at,updated_by)
  values(v_event,trim(p_title),v_slug,p_scenario,nullif(trim(p_speaker),''),p_activity_date,
   p_start_time,p_end_time,nullif(trim(p_location),''),nullif(trim(p_description),''),p_status,
   'America/Mexico_City',now(),auth.uid())
  on conflict(event_id,slug) do nothing returning * into v_activity;
  if found then exit; end if;
  -- El índice único también resuelve colisiones entre solicitudes concurrentes.
  v_suffix:=v_suffix+1;
 end loop;
 return to_jsonb(v_activity);
end $$;

create function public.admin_delete_activity(p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_activity public.activities%rowtype; v_selected_count bigint;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 -- Mismo bloqueo de fila que set_my_activity_registration: serializa selección/borrado.
 select a.* into v_activity from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of a;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 -- Incluye selecciones canceladas: ningún historial puede perderse por un DELETE.
 select count(*) into v_selected_count from public.activity_registrations where activity_id=p_activity_id;
 if v_selected_count>0 then raise exception 'ACTIVITY_HAS_REGISTRATIONS'; end if;
 delete from public.activities where id=v_activity.id;
 return jsonb_build_object('id',v_activity.id,'deleted',true);
end $$;

revoke all on function public.admin_create_activity(text,text,text,date,time,time,text,text,text),
 public.admin_delete_activity(uuid) from public,anon,authenticated;
grant execute on function public.admin_create_activity(text,text,text,date,time,time,text,text,text),
 public.admin_delete_activity(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
