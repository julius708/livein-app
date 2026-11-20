-- Upratovanie: rozvrh (pracovné a voľné dni) si nastavuje upratovačka sama a zadáva ho už pri prihláške / z pozvánky.
-- Limity bytov, vzdialenosť, lokality, inštrukcie a ceny ostávajú len u manažéra (cl_save_my_profile ich nemení).
-- Aditívne: nový stĺpec v prihláškach, nové verzie verejných funkcií s parametrom pracovných dní (staré verzie sa pre anon vypnú), úprava dvoch funkcií.

alter table public.cl_applications add column if not exists work_days int[];

-- vlastný profil: osobné údaje + rozvrh (pracovné dni, voľné dni)
create or replace function public.cl_save_my_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  me text := public.cl_email();
  wd int[];
begin
  if not exists (select 1 from public.cl_staff where email = me and active) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p ? 'work_days' then
    select coalesce(array_agg(distinct x::int order by x::int), '{}') into wd from jsonb_array_elements_text(p -> 'work_days') x where x ~ '^[1-7]$';
    if coalesce(array_length(wd, 1), 0) = 0 then
      return jsonb_build_object('ok', false, 'status', 'bad_input');
    end if;
  end if;
  update public.cl_staff set
    phone = case when p ? 'phone' then left(nullif(btrim(p ->> 'phone'), ''), 40) else phone end,
    address = case when p ? 'address' then left(nullif(btrim(p ->> 'address'), ''), 200) else address end,
    city = case when p ? 'city' then left(nullif(btrim(p ->> 'city'), ''), 80) else city end,
    lat = case when p ? 'lat' then nullif(p ->> 'lat', '')::numeric else lat end,
    lng = case when p ? 'lng' then nullif(p ->> 'lng', '')::numeric else lng end,
    geo_source = case when p ? 'geo_source' then nullif(p ->> 'geo_source', '') else geo_source end,
    work_days = case when p ? 'work_days' then wd else work_days end,
    days_off = case when p ? 'days_off' then coalesce((select array_agg(distinct x::date order by x::date) from jsonb_array_elements_text(p -> 'days_off') x where x::date >= current_date - 1), '{}') else days_off end,
    updated_at = now()
   where email = me;
  return jsonb_build_object('ok', true);
end $fn$;

-- verejná prihláška s pracovnými dňami (nová verzia; stará bez dní sa pre anon vypína)
create or replace function public.cl_apply(p_name text, p_email text, p_phone text, p_address text, p_city text, p_note text, p_hp text, p_work_days int[]) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  h text := md5(lower(btrim(coalesce(p_email, ''))));
  wd int[];
begin
  if btrim(coalesce(p_hp, '')) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  select coalesce(array_agg(distinct d order by d), '{}') into wd from unnest(coalesce(p_work_days, '{}')) d where d between 1 and 7;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 120
     or char_length(btrim(coalesce(p_phone, ''))) not between 6 and 30 or char_length(btrim(coalesce(p_address, ''))) not between 5 and 200
     or coalesce(array_length(wd, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;
  if (select count(*) from public.cl_apply_log where at > now() - interval '1 hour') >= 30
     or (select count(*) from public.cl_apply_log where email_hash = h and at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'status', 'too_many');
  end if;
  insert into public.cl_apply_log (email_hash) values (h);
  if not exists (select 1 from public.cl_applications where lower(email) = e and status = 'new') and not exists (select 1 from public.cl_staff where email = e) then
    insert into public.cl_applications (name, email, phone, address, city, note, work_days)
    values (btrim(p_name), e, btrim(p_phone), btrim(p_address), left(nullif(btrim(coalesce(p_city, '')), ''), 80), left(nullif(btrim(coalesce(p_note, '')), ''), 500), wd);
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- schválenie prihlášky: pracovné dni z prihlášky sa prenesú do profilu upratovačky
create or replace function public.cl_decide_application(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  a public.cl_applications;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into a from public.cl_applications where id = p_id for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if a.status <> 'new' then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', a.status);
  end if;
  if coalesce(p_approve, false) then
    insert into public.app_users (email, name, roles, active) values (lower(a.email), a.name, array['cleaning'], true)
    on conflict (email) do update set active = true, name = coalesce(public.app_users.name, excluded.name),
      roles = (select array_agg(distinct r) from unnest(public.app_users.roles || array['cleaning']) r);
    insert into public.cl_staff (email, name, role, phone, address, city, work_days)
    values (lower(a.email), a.name, 'cleaner', a.phone, a.address, a.city, coalesce(a.work_days, '{1,2,3,4,5,6,7}'))
    on conflict (email) do update set active = true;
  end if;
  update public.cl_applications set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end, decided_by = public.cl_email(), decided_at = now() where id = p_id;
  perform public.cl_log(null, 'application_decided', jsonb_build_object('email', lower(a.email), 'approved', coalesce(p_approve, false)));
  return jsonb_build_object('ok', true, 'email', lower(a.email), 'approved', coalesce(p_approve, false));
end $fn$;

-- vyplnenie údajov z pozvánky s pracovnými dňami (nová verzia)
create or replace function public.cl_complete_profile(p_token uuid, p_phone text, p_address text, p_city text, p_note text, p_lat numeric, p_lng numeric, p_hp text, p_work_days int[]) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  s public.cl_staff;
  h text := md5(coalesce(p_token::text, ''));
  has_geo boolean := p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180;
  wd int[];
begin
  if btrim(coalesce(p_hp, '')) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.cl_apply_log where at > now() - interval '1 hour') >= 60
     or (select count(*) from public.cl_apply_log where email_hash = h and at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'status', 'too_many');
  end if;
  insert into public.cl_apply_log (email_hash) values (h);
  select coalesce(array_agg(distinct d order by d), '{}') into wd from unnest(coalesce(p_work_days, '{}')) d where d between 1 and 7;
  if char_length(btrim(coalesce(p_phone, ''))) not between 6 and 30 or char_length(btrim(coalesce(p_address, ''))) not between 5 and 200 or coalesce(array_length(wd, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;
  select * into s from public.cl_staff where invite_token = p_token and not profile_done and active for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'invalid_token');
  end if;
  update public.cl_staff set
    phone = btrim(p_phone), address = btrim(p_address), city = left(nullif(btrim(coalesce(p_city, '')), ''), 80),
    lat = case when has_geo then p_lat else null end, lng = case when has_geo then p_lng else null end, geo_source = case when has_geo then 'geocoded' else null end,
    note = case when nullif(btrim(coalesce(p_note, '')), '') is null then note else left('Z formulára: ' || btrim(p_note), 500) end,
    work_days = wd, profile_done = true, invite_token = null, updated_at = now()
   where email = s.email;
  perform public.cl_log(null, 'profile_completed', jsonb_build_object('email', s.email));
  return jsonb_build_object('ok', true);
end $fn$;

-- staré verejné verzie bez pracovných dní už anon nespustí
revoke execute on function public.cl_apply(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.cl_complete_profile(uuid, text, text, text, text, numeric, numeric, text) from public, anon, authenticated;
revoke execute on function public.cl_apply(text, text, text, text, text, text, text, int[]) from public;
grant execute on function public.cl_apply(text, text, text, text, text, text, text, int[]) to anon, authenticated, service_role;
revoke execute on function public.cl_complete_profile(uuid, text, text, text, text, numeric, numeric, text, int[]) from public;
grant execute on function public.cl_complete_profile(uuid, text, text, text, text, numeric, numeric, text, int[]) to anon, authenticated, service_role;
grant execute on function public.cl_save_my_profile(jsonb) to authenticated, service_role;
grant execute on function public.cl_decide_application(uuid, boolean) to authenticated, service_role;
