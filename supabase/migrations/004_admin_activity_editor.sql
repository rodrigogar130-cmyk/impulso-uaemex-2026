-- Editor ampliado. Aplicar después de 003; no modifica slug ni datos existentes.
begin;
-- Retirar la firma desplegada para evitar overloads ambiguos. Sin CASCADE.
drop function public.admin_update_activity(uuid,text,date,time,time,text,text,text,timestamptz);

create function public.admin_update_activity(p_activity_id uuid,p_title text,p_scenario text,p_speaker text,p_activity_date date,
 p_start_time time,p_end_time time,p_location text,p_description text,p_status text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_activity public.activities%rowtype;
begin
 perform public.require_impulso_admin();
 select a.* into v_activity from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of a;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 if not (v_activity.updated_at is not distinct from p_expected_updated_at) then raise exception 'EDIT_CONFLICT'; end if;
 if p_title is null or trim(p_title)='' then raise exception 'ACTIVITY_TITLE_REQUIRED'; end if;
 if p_scenario is null or p_scenario not in ('cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar') then raise exception 'INVALID_ACTIVITY_SCENARIO'; end if;
 if p_status is null or p_status not in ('draft','open','closed','cancelled') then raise exception 'INVALID_ACTIVITY_STATUS'; end if;
 if p_status='open' and p_activity_date is null then raise exception 'ACTIVITY_DATE_REQUIRED'; end if;
 if p_start_time is not null and p_end_time is not null and p_end_time<=p_start_time then raise exception 'INVALID_ACTIVITY_TIME'; end if;
 update public.activities set title=trim(p_title),scenario=p_scenario,speaker=nullif(trim(p_speaker),''),activity_date=p_activity_date,
 start_time=p_start_time,end_time=p_end_time,location=nullif(trim(p_location),''),description=nullif(trim(p_description),''),
 status=p_status,updated_at=now(),updated_by=auth.uid() where id=p_activity_id;
 return public.admin_get_activity(p_activity_id);
end $$;

revoke all on function public.admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
