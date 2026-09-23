create or replace function public.confirm_nfc_attendance(
  p_user_id uuid,
  p_activity_id uuid,
  p_request_id uuid,
  p_point_token text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  a public.activities%rowtype;
  v_attendance public.activity_attendances%rowtype;
begin
  -- La identidad del usuario ya fue validada por la Edge Function
  -- mediante /auth/v1/user. Esta RPC solo es ejecutable por service_role.
  if p_user_id is null then
    return jsonb_build_object('code','AUTH_REQUIRED');
  end if;

  select ac.*
  into a
  from public.activities ac
  join public.events e on e.id = ac.event_id
  where ac.id = p_activity_id
    and e.slug = 'impulso-uaemex-2026'
    and e.status in ('open','closed')
  for share of ac;

  if not found then
    return jsonb_build_object('code','ACTIVITY_NOT_FOUND');
  end if;

  if p_point_token is null
     or p_point_token !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1
       from impulso_private.attendance_points
       where activity_id = a.id
         and point_token = p_point_token
     ) then
    return jsonb_build_object('code','POINT_TOKEN_INVALID');
  end if;

  perform 1
  from public.event_registrations
  where user_id = p_user_id
    and event_id = a.event_id
    and status = 'confirmed'
  for share;

  if not found then
    return jsonb_build_object('code','EVENT_REGISTRATION_REQUIRED');
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
    and privacy_notice_version = '2026-09'
    and privacy_acknowledged_at is not null;

  if not found then
    return jsonb_build_object('code','PRIVACY_REQUIRED');
  end if;

  select *
  into v_attendance
  from public.activity_attendances
  where user_id = p_user_id
    and activity_id = a.id;

  if found then
    return jsonb_build_object(
      'code','ALREADY_COMPLETED',
      'attended_at',v_attendance.attended_at
    );
  end if;

  if a.status = 'cancelled' then
    return jsonb_build_object('code','ACTIVITY_UNAVAILABLE');
  end if;

  if not a.attendance_enabled then
    return jsonb_build_object('code','ATTENDANCE_CLOSED');
  end if;

  insert into public.activity_attendances(
    user_id,
    activity_id,
    attended_at,
    request_id
  )
  values(
    p_user_id,
    a.id,
    now(),
    p_request_id
  )
  on conflict(user_id, activity_id) do nothing
  returning * into v_attendance;

  if not found then
    return jsonb_build_object('code','ALREADY_COMPLETED');
  end if;

  return jsonb_build_object(
    'code','RECORDED',
    'attended_at',v_attendance.attended_at
  );
end
$$;

revoke all
on function public.confirm_nfc_attendance(uuid,uuid,uuid,text)
from public, anon, authenticated;

grant execute
on function public.confirm_nfc_attendance(uuid,uuid,uuid,text)
to service_role;

notify pgrst,'reload schema';