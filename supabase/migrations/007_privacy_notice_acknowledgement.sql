-- Pendiente de aplicar en producción. Requiere profiles; no rellena registros existentes.
begin;
alter table public.profiles
 add column privacy_acknowledged_at timestamptz null,
 add column privacy_notice_version text null;

-- La evidencia se escribe solo mediante la RPC, no desde el navegador.
revoke insert(privacy_acknowledged_at,privacy_notice_version),
 update(privacy_acknowledged_at,privacy_notice_version)
 on public.profiles from public,anon,authenticated;

create function public.acknowledge_privacy_notice(p_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_profile public.profiles%rowtype;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_version is distinct from '2026-09' then raise exception 'INVALID_PRIVACY_NOTICE_VERSION'; end if;
 select * into v_profile from public.profiles where id=v_user for update;
 if not found then raise exception 'PROFILE_REQUIRED'; end if;
 -- Conserva el primer reconocimiento de esta versión incluso con dos pestañas.
 if v_profile.privacy_acknowledged_at is null or v_profile.privacy_notice_version is distinct from p_version then
  update public.profiles set privacy_acknowledged_at=now(),privacy_notice_version=p_version
  where id=v_user returning * into v_profile;
 end if;
 return jsonb_build_object('id',v_profile.id,'privacy_acknowledged_at',v_profile.privacy_acknowledged_at,
  'privacy_notice_version',v_profile.privacy_notice_version);
end $$;
revoke all on function public.acknowledge_privacy_notice(text) from public,anon,authenticated;
grant execute on function public.acknowledge_privacy_notice(text) to authenticated;
notify pgrst,'reload schema';
commit;
