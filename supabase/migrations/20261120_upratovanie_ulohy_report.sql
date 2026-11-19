-- Upratovanie, doplnok (schválené 19. 11. 2026): ručná úloha mimo Práčovne, zrušenie úlohy, mesačný report (Excel e-mailom).
-- Aditívne: nový stĺpec, nové funkcie, rozšírenie cl_sync_tasks a cl_save_setting. Žiadna zmena rolí ani existujúcich tabuliek okrem jedného stĺpca.

alter table public.cl_tasks add column if not exists manual boolean not null default false;

-- synchronizácia: ručné úlohy (mimo Práčovne) sa nezrušia, keď k nim nie je balík
create or replace function public.cl_sync_tasks(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  n_new int := 0;
  n_upd int := 0;
  n_cancel int := 0;
begin
  if not (public.cl_is_manager() or public.cl_is_cleaner()) then
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

-- ručná úloha: byt z evidencie (listing_id) alebo vlastný názov (napr. "Kancelária", "Generálka")
create or replace function public.cl_add_task(p_listing text, p_name text, p_date date, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  lid text := nullif(btrim(coalesce(p_listing, '')), '');
  nm text := nullif(btrim(coalesce(p_name, '')), '');
  tid uuid;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_date is null or p_date < current_date - 60 or p_date > current_date + 400 then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if lid is not null then
    nm := coalesce((select listing_name from public.cl_flats where listing_id = lid), nm);
  end if;
  if nm is null then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if lid is null then
    lid := 'manual:' || gen_random_uuid()::text;
  end if;
  if exists (select 1 from public.cl_tasks where listing_id = lid and date = p_date) then
    return jsonb_build_object('ok', false, 'status', 'exists');
  end if;
  insert into public.cl_tasks (listing_id, listing_name, date, pack_note, manual)
  values (lid, left(nm, 120), p_date, left(nullif(btrim(coalesce(p_note, '')), ''), 500), true) returning id into tid;
  perform public.cl_log(tid, 'task_added', jsonb_build_object('manual', true));
  return jsonb_build_object('ok', true, 'id', tid);
end $fn$;

-- zrušenie nezačatej úlohy (duplicita, omyl)
create or replace function public.cl_cancel_task(p_task uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.cl_tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  if t.status <> 'todo' then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  update public.cl_tasks set status = 'cancelled', updated_at = now() where id = p_task;
  perform public.cl_log(p_task, 'cancelled', jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
  return jsonb_build_object('ok', true);
end $fn$;

-- nastavenia: pribudol kľúč "report" (komu sa posiela mesačný report: { "recipients": ["…"] })
create or replace function public.cl_save_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_key not in ('checklist', 'rules', 'report') then
    return jsonb_build_object('ok', false, 'status', 'bad_key');
  end if;
  insert into public.cl_settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.cl_log(null, 'setting_saved', jsonb_build_object('key', p_key));
  return jsonb_build_object('ok', true);
end $fn$;

-- údaje na mesačný report: číta manažérka (Excel zo stránky) alebo servis (servisný kľúč alebo účet s rolou bot) pre mesačný e-mail
create or replace function public.cl_report_data(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not (public.cl_is_manager() or public.has_app_role('bot') or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    return jsonb_build_object('ok', false, 'status', 'bad_range');
  end if;
  return jsonb_build_object(
    'ok', true,
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'snapshot') from public.cl_tasks t where t.date between p_from and p_to and t.status <> 'cancelled'), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('email', s.email, 'name', s.name, 'role', s.role, 'pay_type', s.pay_type, 'hourly_rate_cents', s.hourly_rate_cents, 'task_rate_cents', s.task_rate_cents)) from public.cl_staff s), '[]'::jsonb),
    'flats', coalesce((select jsonb_agg(jsonb_build_object('listing_id', f.listing_id, 'listing_name', f.listing_name, 'pay_cents', f.pay_cents, 'est_minutes', f.est_minutes)) from public.cl_flats f), '[]'::jsonb),
    'recipients', coalesce(public.cl_setting('report') -> 'recipients', '[]'::jsonb),
    'sent', exists (select 1 from public.cl_events e where e.event = 'report_sent' and e.data ->> 'month' = to_char(p_from, 'YYYY-MM'))
  );
end $fn$;

-- poznačí, že mesačný report už odišiel (aby sa neposlal dvakrát)
create or replace function public.cl_report_mark(p_month text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not (public.cl_is_manager() or public.has_app_role('bot') or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_month !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  perform public.cl_log(null, 'report_sent', jsonb_build_object('month', p_month));
  return jsonb_build_object('ok', true);
end $fn$;

do $do$
declare
  f text;
begin
  foreach f in array array['cl_sync_tasks(date, date)', 'cl_add_task(text, text, date, text)', 'cl_cancel_task(uuid, text)', 'cl_save_setting(text, jsonb)', 'cl_report_data(date, date)', 'cl_report_mark(text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $do$;
