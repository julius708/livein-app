-- Upratovanie: pomoc pre tím. Upozornenia upratovačky manažérovi (meškám, potrebujem pomoc, chýba tovar, nemôžem prísť), kontakty na manažérov,
-- údaje pre večerný beh (návrh rozdelenia na zajtra, pripomienky), import recenzií z Guesty, nastavenie upozornení.
-- Aditívne: tri stĺpce v cl_tasks, jeden v cl_reviews, nové funkcie, rozšírenie cl_sync_tasks a cl_save_setting o servisný prístup / nový kľúč.

alter table public.cl_tasks add column if not exists alert_kind text check (alert_kind is null or alert_kind in ('late', 'cant', 'help', 'supplies'));
alter table public.cl_tasks add column if not exists alert_text text;
alter table public.cl_tasks add column if not exists alert_at timestamptz;
alter table public.cl_reviews add column if not exists external_id text;
create unique index if not exists cl_reviews_external on public.cl_reviews (external_id) where external_id is not null;

-- upozornenie od upratovačky k jej úlohe
create or replace function public.cl_task_alert(p_task uuid, p_kind text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
  txt text := left(nullif(btrim(coalesce(p_text, '')), ''), 300);
begin
  select * into t from public.cl_tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.cleaner_email is distinct from public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('late', 'cant', 'help', 'supplies') then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if t.status in ('done', 'cancelled') then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  update public.cl_tasks set alert_kind = p_kind, alert_text = txt, alert_at = now(), updated_at = now() where id = p_task;
  perform public.cl_log(p_task, 'alert', jsonb_build_object('kind', p_kind, 'text', txt));
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.cl_clear_alert(p_task uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.cl_tasks set alert_kind = null, alert_text = null, alert_at = null, updated_at = now() where id = p_task;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  perform public.cl_log(p_task, 'alert_cleared', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $fn$;

-- kontakty na manažérov pre upratovačky (meno a telefón); telefóny ostatných upratovačiek sa neprezrádzajú
create or replace function public.cl_contacts() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not (public.cl_is_manager() or public.cl_is_cleaner()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'phone', s.phone) order by s.name) from public.cl_staff s where s.role = 'manager' and s.active), '[]'::jsonb);
end $fn$;

-- údaje pre večerný beh a pripomienky: manažér alebo servis (servisný kľúč, účet bot)
create or replace function public.cl_plan_data(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not (public.cl_is_manager() or public.has_app_role('bot') or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('ok', false, 'status', 'bad_range');
  end if;
  return jsonb_build_object(
    'ok', true,
    'tasks', coalesce((select jsonb_agg((to_jsonb(t) - 'snapshot')) from public.cl_tasks t where t.date between p_from and p_to and t.status <> 'cancelled'), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('listing_id', h.listing_id, 'date', h.date, 'cleaner_email', h.cleaner_email)) from public.cl_tasks h where h.date between p_from - 45 and p_from - 1 and h.cleaner_email is not null), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(to_jsonb(s) - 'invite_token' - 'note') from public.cl_staff s where s.active), '[]'::jsonb),
    'flats', coalesce((select jsonb_agg(jsonb_build_object('listing_id', f.listing_id, 'listing_name', f.listing_name, 'address', f.address, 'city', f.city, 'lat', f.lat, 'lng', f.lng, 'est_minutes', f.est_minutes)) from public.cl_flats f), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(k.key, k.value) from public.cl_settings k where k.key in ('notify')), '{}'::jsonb)
  );
end $fn$;

-- synchronizácia môže spustiť aj servis (večerný beh), nielen manažér a upratovačka
create or replace function public.cl_sync_tasks(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  n_new int := 0;
  n_upd int := 0;
  n_cancel int := 0;
begin
  if not (public.cl_is_manager() or public.cl_is_cleaner() or public.has_app_role('bot') or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('ok', false, 'status', 'bad_range');
  end if;

  insert into public.cl_flats (listing_id, listing_name, address, city, lat, lng)
  select distinct on (l.guesty_id) l.guesty_id, l.name, coalesce(gu.address, gc.address), coalesce(gu.city, l.city), gc.lat, gc.lng
    from public.listings l
    left join public.guide_units gu on gu.listing_id = l.guesty_id
    left join public.guide_cards gc on gc.listing_id = l.guesty_id
   where l.in_scope
  on conflict (listing_id) do update set
    listing_name = excluded.listing_name,
    address = coalesce(excluded.address, public.cl_flats.address),
    city = coalesce(excluded.city, public.cl_flats.city),
    lat = coalesce(excluded.lat, public.cl_flats.lat),
    lng = coalesce(excluded.lng, public.cl_flats.lng);

  with picked as (
    select distinct on (p.listing_id, p.date) p.id, p.listing_id, p.date
      from public.packages p
     where p.date between p_from and p_to and p.status <> 'cancelled' and not p.hidden
     order by p.listing_id, p.date, (p.status = 'packed') desc, p.updated_at desc, p.id
  )
  update public.cl_tasks t set package_id = null, updated_at = now()
    from picked k
   where t.package_id = k.id and (t.listing_id, t.date) is distinct from (k.listing_id, k.date);

  with src as (
    select distinct on (p.listing_id, p.date) p.id, p.listing_id, p.listing_name, p.date, p.target_people, p.computed_items, p.note
      from public.packages p
     where p.date between p_from and p_to and p.status <> 'cancelled' and not p.hidden
     order by p.listing_id, p.date, (p.status = 'packed') desc, p.updated_at desc, p.id
  ), ins as (
    insert into public.cl_tasks (listing_id, listing_name, date, package_id, people, snapshot, pack_note)
    select s.listing_id, s.listing_name, s.date, s.id, s.target_people, s.computed_items, nullif(s.note, '') from src s
    on conflict (listing_id, date) do update set
      package_id = excluded.package_id,
      listing_name = excluded.listing_name,
      people = excluded.people,
      snapshot = excluded.snapshot,
      pack_note = excluded.pack_note,
      manual = false,
      updated_at = now()
     where public.cl_tasks.status = 'todo' and (public.cl_tasks.snapshot is distinct from excluded.snapshot or public.cl_tasks.people is distinct from excluded.people or public.cl_tasks.pack_note is distinct from excluded.pack_note or public.cl_tasks.manual)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_new, n_upd from ins;

  update public.cl_tasks t set status = 'cancelled', updated_at = now()
   where t.date between p_from and p_to and t.status = 'todo' and not t.manual
     and not exists (select 1 from public.packages p where p.listing_id = t.listing_id and p.date = t.date and p.status <> 'cancelled' and not p.hidden);
  get diagnostics n_cancel = row_count;

  return jsonb_build_object('ok', true, 'new', n_new, 'updated', n_upd, 'cancelled', n_cancel);
end $fn$;

-- nastavenia: pribudol kľúč "notify" (upozornenia a večerný beh)
create or replace function public.cl_save_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_key not in ('checklist', 'rules', 'report', 'notify') then
    return jsonb_build_object('ok', false, 'status', 'bad_key');
  end if;
  insert into public.cl_settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.cl_log(null, 'setting_saved', jsonb_build_object('key', p_key));
  return jsonb_build_object('ok', true);
end $fn$;

-- import recenzií (z Guesty): [{ external_id, reservation_id, confirmation_code, listing_id, check_in, check_out, source, rating, cleanliness, text }]
-- rezervácia sa nájde podľa ID alebo kódu; opakovaný import tej istej recenzie ju len aktualizuje
create or replace function public.cl_import_reviews(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  it jsonb;
  r record;
  ext text;
  lid text; ci date; co date; code text;
  rt numeric; cl numeric; src text;
  ins int := 0; upd int := 0; skip int := 0; id0 uuid;
begin
  if not (public.cl_is_manager() or public.has_app_role('bot') or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    ext := nullif(btrim(it ->> 'external_id'), '');
    rt := nullif(it ->> 'rating', '')::numeric;
    cl := nullif(it ->> 'cleanliness', '')::numeric;
    src := coalesce(nullif(it ->> 'source', ''), 'other');
    if ext is null or rt is null or rt < 1 or rt > 5 or (cl is not null and (cl < 1 or cl > 5)) or src not in ('airbnb', 'booking', 'google', 'direct', 'other') then
      skip := skip + 1; continue;
    end if;
    code := nullif(btrim(it ->> 'confirmation_code'), '');
    lid := nullif(btrim(it ->> 'listing_id'), ''); ci := nullif(it ->> 'check_in', '')::date; co := nullif(it ->> 'check_out', '')::date;
    select * into r from public.reservations where (guesty_id = nullif(it ->> 'reservation_id', '') or (code is not null and confirmation_code = code)) order by (status = 'confirmed') desc limit 1;
    if found then
      lid := r.listing_id; ci := r.check_in_date; co := r.check_out_date; code := coalesce(r.confirmation_code, code);
    end if;
    if lid is null or ci is null then
      skip := skip + 1; continue;
    end if;
    select id into id0 from public.cl_reviews where external_id = ext;
    if found then
      update public.cl_reviews set rating = rt, cleanliness = cl, text = left(coalesce(it ->> 'text', ''), 2000), source = src, removed_at = removed_at where id = id0;
      upd := upd + 1;
    else
      insert into public.cl_reviews (listing_id, reservation_code, check_in, check_out, source, rating, cleanliness, text, created_by, external_id)
      values (lid, code, ci, co, src, rt, cl, left(coalesce(it ->> 'text', ''), 2000), 'guesty', ext);
      ins := ins + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', ins, 'updated', upd, 'skipped', skip);
end $fn$;

do $do$
declare
  f text;
begin
  foreach f in array array['cl_task_alert(uuid, text, text)', 'cl_clear_alert(uuid)', 'cl_contacts()', 'cl_plan_data(date, date)', 'cl_sync_tasks(date, date)', 'cl_save_setting(text, jsonb)', 'cl_import_reviews(jsonb)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $do$;
