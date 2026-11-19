-- Upratovanie: pozvánky ("Pridať člena") a zúženie toho, čo si upratovačka mení sama (zadanie 19. 11. 2026).
-- Upratovačka vypĺňa len osobné údaje (telefón, adresa bydliska). Limity, dni, lokality, inštrukcie a ceny nastavuje manažérka.
-- Aditívne: tri nové stĺpce v cl_staff a nové funkcie; cl_save_my_profile sa zužuje (bez pracovných a voľných dní).

alter table public.cl_staff add column if not exists invite_token uuid unique;
alter table public.cl_staff add column if not exists invited_at timestamptz;
alter table public.cl_staff add column if not exists profile_done boolean not null default true;

-- vlastný profil: LEN osobné údaje
create or replace function public.cl_save_my_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  me text := public.cl_email();
begin
  if not exists (select 1 from public.cl_staff where email = me and active) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.cl_staff set
    phone = case when p ? 'phone' then left(nullif(btrim(p ->> 'phone'), ''), 40) else phone end,
    address = case when p ? 'address' then left(nullif(btrim(p ->> 'address'), ''), 200) else address end,
    city = case when p ? 'city' then left(nullif(btrim(p ->> 'city'), ''), 80) else city end,
    lat = case when p ? 'lat' then nullif(p ->> 'lat', '')::numeric else lat end,
    lng = case when p ? 'lng' then nullif(p ->> 'lng', '')::numeric else lng end,
    geo_source = case when p ? 'geo_source' then nullif(p ->> 'geo_source', '') else geo_source end,
    updated_at = now()
   where email = me;
  return jsonb_build_object('ok', true);
end $fn$;

-- pridanie člena: existujúci používateľ appky sa len zaradí do tímu; nový dostane prístup a pozvánku s odkazom na vyplnenie údajov
create or replace function public.cl_invite(p_name text, p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  nm text := nullif(btrim(coalesce(p_name, '')), '');
  ph text := left(nullif(btrim(coalesce(p_phone, '')), ''), 40);
  u public.app_users;
  s public.cl_staff;
  tok uuid;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 120 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;
  select * into u from public.app_users where lower(email) = e;
  if found then
    if not u.active then
      return jsonb_build_object('ok', false, 'status', 'inactive');
    end if;
    select * into s from public.cl_staff where email = lower(u.email);
    if found then
      if s.profile_done or s.invite_token is null then
        return jsonb_build_object('ok', true, 'status', 'already', 'name', s.name);
      end if;
      tok := gen_random_uuid();
      update public.cl_staff set invite_token = tok, invited_at = now(), phone = coalesce(ph, phone), updated_at = now() where email = s.email;
      perform public.cl_log(null, 'invite_resent', jsonb_build_object('email', e));
      return jsonb_build_object('ok', true, 'status', 'reinvited', 'token', tok, 'name', s.name);
    end if;
    insert into public.cl_staff (email, name, role, phone) values (lower(u.email), u.name, 'cleaner', ph);
    perform public.cl_log(null, 'member_added', jsonb_build_object('email', e, 'existing', true));
    return jsonb_build_object('ok', true, 'status', 'existing', 'name', u.name);
  end if;
  if nm is null or char_length(nm) < 2 or char_length(nm) > 120 then
    return jsonb_build_object('ok', false, 'status', 'name_required');
  end if;
  tok := gen_random_uuid();
  insert into public.app_users (email, name, roles, active) values (e, nm, array['cleaning'], true);
  insert into public.cl_staff (email, name, role, phone, profile_done, invite_token, invited_at) values (e, nm, 'cleaner', ph, false, tok, now());
  perform public.cl_log(null, 'member_invited', jsonb_build_object('email', e));
  return jsonb_build_object('ok', true, 'status', 'invited', 'token', tok, 'name', nm);
end $fn$;

-- verejné: meno k pozvánke (na pozdrav vo formulári); nič iné sa neprezradí
create or replace function public.cl_invite_info(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  s public.cl_staff;
begin
  select * into s from public.cl_staff where invite_token = p_token and not profile_done and active;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;
  return jsonb_build_object('ok', true, 'name', s.name);
end $fn$;

-- verejné: upratovačka vyplní z pozvánky osobné údaje; odkaz platí na jedno vyplnenie
create or replace function public.cl_complete_profile(p_token uuid, p_phone text, p_address text, p_city text, p_note text, p_lat numeric, p_lng numeric, p_hp text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  s public.cl_staff;
  h text := md5(coalesce(p_token::text, ''));
  has_geo boolean := p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180;
begin
  if btrim(coalesce(p_hp, '')) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.cl_apply_log where at > now() - interval '1 hour') >= 60
     or (select count(*) from public.cl_apply_log where email_hash = h and at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'status', 'too_many');
  end if;
  insert into public.cl_apply_log (email_hash) values (h);
  if char_length(btrim(coalesce(p_phone, ''))) not between 6 and 30 or char_length(btrim(coalesce(p_address, ''))) not between 5 and 200 then
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
    profile_done = true, invite_token = null, updated_at = now()
   where email = s.email;
  perform public.cl_log(null, 'profile_completed', jsonb_build_object('email', s.email));
  return jsonb_build_object('ok', true);
end $fn$;

do $do$
declare
  f text;
begin
  foreach f in array array['cl_save_my_profile(jsonb)', 'cl_invite(text, text, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['cl_invite_info(uuid)', 'cl_complete_profile(uuid, text, text, text, text, numeric, numeric, text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $do$;
