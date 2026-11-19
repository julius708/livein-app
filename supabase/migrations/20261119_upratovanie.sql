-- Upratovanie: appka pre upratovačky a manažérku upratovania (zadanie 19. 11. 2026).
--
-- NÁVRH NA REVIEW: súbor NIE JE aplikovaný v produkčnej databáze. Je čisto aditívny:
-- nové tabuľky cl_*, funkcie cl_*, súkromný úložný priestor na fotky. Nemení prihlasovanie, roly (app_users_roles_valid
-- ostáva) ani existujúce tabuľky. Upratovačka je používateľ s existujúcou rolou "cleaning" a riadkom v cl_staff;
-- manažérka je riadok v cl_staff s role = 'manager' (alebo admin).
--
-- Tok: balíky z Práčovne (packages) sa synchronizujú do cl_tasks (cl_sync_tasks) → manažérka ich priradí upratovačkám
-- (ručne alebo podľa vzdialenosti od bydliska, vyrátané v appke) → upratovačka v byte spustí úlohu, odfajkáva checklist,
-- nahrá fotky, dokončí → Práčovňa vidí "Upratané" (cl_status_for). Všetky zmeny idú cez RPC (kontroly rolí v DB), priame
-- zápisy do tabuliek sú zakázané.
--
-- Žiadne holé znaky dolára mimo tiel funkcií: SQL editor Supabase skript podľa nich delí.

-- ---------------------------------------------------------------- tím
create table if not exists public.cl_staff (
  email text primary key references public.app_users(email) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  role text not null default 'cleaner' check (role in ('cleaner', 'manager')),
  phone text,
  address text,
  city text,
  lat numeric(9, 6) check (lat is null or lat between -90 and 90),
  lng numeric(9, 6) check (lng is null or lng between -180 and 180),
  geo_source text check (geo_source in ('geocoded', 'manual')),
  -- koľko bytov jej appka priradí naraz: za deň a za týždeň (každá upratovačka má svoje číslo; 0 týždenne = bez týždenného limitu)
  max_per_day int not null default 4 check (max_per_day between 1 and 12),
  max_per_week int not null default 0 check (max_per_week between 0 and 60),
  -- najďalej od bydliska (km vzdušnou čiarou), kam jej appka automaticky priradí; 0 = bez limitu
  max_distance_km int not null default 0 check (max_distance_km between 0 and 200),
  -- dni v týždni, keď môže pracovať (1 = pondelok .. 7 = nedeľa) a jednotlivé voľné dni (dovolenka, lekár)
  work_days int[] not null default '{1,2,3,4,5,6,7}',
  days_off date[] not null default '{}',
  -- lokality, v ktorých ju appka uprednostní (napr. Petržalka, Staré Mesto), a byty, ktoré jej appka nikdy automaticky nepriradí
  preferred_localities text[] not null default '{}',
  excluded_listings text[] not null default '{}',
  -- inštrukcie od manažérky pre túto upratovačku: vidí ich vo svojej appke (napr. "len doobeda", "nerobí 3. poschodie bez výťahu")
  instructions text not null default '',
  -- cena práce (v centoch, EUR): buď za hodinu (hodiny sa berú zo štartu a konca úlohy), alebo pevná cena za jedno upratovanie
  pay_type text not null default 'per_task' check (pay_type in ('hourly', 'per_task')),
  hourly_rate_cents int not null default 0 check (hourly_rate_cents between 0 and 100000),
  task_rate_cents int not null default 0 check (task_rate_cents between 0 and 1000000),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- prihlášky (verejný formulár cez cl_apply; schvaľuje manažérka)
create table if not exists public.cl_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  address text not null,
  city text,
  note text,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cl_applications_status on public.cl_applications (status, created_at desc);

-- ---------------------------------------------------------------- byty
-- údaje bytu pre upratovanie; adresa a súradnice sa preberajú zo Sprievodcu bytom, ostatné dopĺňa manažérka
create table if not exists public.cl_flats (
  listing_id text primary key,
  listing_name text,
  address text,
  city text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  -- ako sa dostať do bytu (kľúče, kódy, schránka, výťah...): píše manažérka, vidí ho len priradená upratovačka
  access_note text not null default '',
  -- ďalšie body checklistu len pre tento byt
  extra_checklist text[] not null default '{}',
  -- odhad času v minútach (na plánovanie a vyváženie záťaže)
  est_minutes int not null default 90 check (est_minutes between 10 and 600),
  -- pevná cena za upratanie tohto bytu (centy); ak je vyplnená, má prednosť pred sadzbou upratovačky pri type "za upratovanie"
  pay_cents int check (pay_cents is null or pay_cents between 0 and 1000000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- úlohy
create table if not exists public.cl_tasks (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  listing_name text not null,
  date date not null,
  -- balík z Práčovne, z ktorého úloha vznikla
  package_id uuid unique,
  people int,
  -- karta z Práčovne v čase synchronizácie: hostia, kapsule, spotrebný tovar, bielizeň, poznámky, ďalší príchod...
  snapshot jsonb not null default '{}'::jsonb,
  pack_note text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  cleaner_email text references public.cl_staff(email) on delete set null,
  assigned_by text,
  assigned_at timestamptz,
  auto_assigned boolean not null default false,
  assign_reason text,
  distance_km numeric(6, 1),
  started_at timestamptz,
  finished_at timestamptz,
  cleaner_note text,
  -- ručne upravená suma za túto úlohu (centy); null = počíta sa zo sadzby
  pay_override_cents int check (pay_override_cents is null or pay_override_cents between 0 and 1000000),
  problem_text text,
  problem_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, date)
);
create index if not exists cl_tasks_date on public.cl_tasks (date, status);
create index if not exists cl_tasks_cleaner on public.cl_tasks (cleaner_email, date);

create table if not exists public.cl_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.cl_tasks(id) on delete cascade,
  sort int not null default 0,
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  unique (task_id, sort)
);

create table if not exists public.cl_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.cl_tasks(id) on delete cascade,
  kind text not null check (kind in ('before', 'after', 'issue')),
  path text not null,
  note text,
  taken_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists cl_photos_task on public.cl_photos (task_id);

-- nástenka upratovania (manažérka píše, upratovačky čítajú a odpovedajú)
create table if not exists public.cl_posts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.cl_posts(id) on delete cascade,
  author_email text not null,
  author_name text not null,
  text text not null check (char_length(text) between 1 and 1000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists cl_posts_created on public.cl_posts (created_at desc) where removed_at is null;

create table if not exists public.cl_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  task_id uuid,
  actor text,
  event text not null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists cl_events_task on public.cl_events (task_id, at);

create table if not exists public.cl_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.cl_settings (key, value) values
  ('checklist', '["Vyvetrať a otvoriť okná","Vyniesť odpadky a vymeniť vrecká","Vysávať a umyť podlahy","Kuchyňa: drez, spotrebiče, chladnička (vyprázdniť)","Kúpeľňa: sprcha alebo vaňa, WC, umývadlo, zrkadlo","Postele: bielizeň podľa karty z Práčovne","Uteráky a toaletný papier doplniť","Kapsule do kávovaru podľa karty","Prach: povrchy, parapety, police","Skontrolovať škody a zabudnuté veci","Zhasnúť, zavrieť okná a zamknúť"]'::jsonb),
  ('rules', '{"min_after_photos": 0, "max_start_distance_m": 0, "rotation_weight": 0.2, "balance_weight": 0.5}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.cl_apply_log (
  id bigint generated always as identity primary key,
  email_hash text not null,
  at timestamptz not null default now()
);
create index if not exists cl_apply_log_at on public.cl_apply_log (at desc);

-- ---------------------------------------------------------------- pomocné funkcie
create or replace function public.cl_email() returns text
language sql stable set search_path = '' as $fn$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$fn$;

create or replace function public.cl_is_manager() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select public.is_app_admin() or exists (
    select 1 from public.cl_staff s where s.email = public.cl_email() and s.role = 'manager' and s.active
  )
$fn$;

create or replace function public.cl_is_cleaner() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.cl_staff s where s.email = public.cl_email() and s.role = 'cleaner' and s.active)
$fn$;

create or replace function public.cl_name() returns text
language sql stable security definer set search_path = '' as $fn$
  select coalesce((select name from public.cl_staff where email = public.cl_email()), (select name from public.app_users where lower(email) = public.cl_email()), '—')
$fn$;

create or replace function public.cl_log(p_task uuid, p_event text, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.cl_events (task_id, actor, event, data) values (p_task, public.cl_email(), p_event, coalesce(p_data, '{}'::jsonb));
end $fn$;

create or replace function public.cl_setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select value from public.cl_settings where key = p_key
$fn$;

-- ---------------------------------------------------------------- synchronizácia z Práčovne
-- Úlohy vznikajú z balíkov (check-out dňa). Priradenie a stav ostávajú; snapshot sa obnovuje len u nezačatých úloh.
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

  -- byty: adresa a súradnice zo Sprievodcu bytom (manažérske polia sa neprepisujú)
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
    select p.id, p.listing_id, p.listing_name, p.date, p.target_people, p.computed_items, p.note
      from public.packages p
     where p.date between p_from and p_to and p.status <> 'cancelled' and not p.hidden
  ), ins as (
    insert into public.cl_tasks (listing_id, listing_name, date, package_id, people, snapshot, pack_note)
    select s.listing_id, s.listing_name, s.date, s.id, s.target_people, s.computed_items, nullif(s.note, '') from src s
    on conflict (listing_id, date) do update set
      package_id = excluded.package_id,
      listing_name = excluded.listing_name,
      people = excluded.people,
      snapshot = excluded.snapshot,
      pack_note = excluded.pack_note,
      updated_at = now()
     where public.cl_tasks.status = 'todo' and (public.cl_tasks.snapshot is distinct from excluded.snapshot or public.cl_tasks.people is distinct from excluded.people or public.cl_tasks.pack_note is distinct from excluded.pack_note)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_new, n_upd from ins;

  -- balík zmizol alebo bol zrušený: nezačatá úloha sa zruší (začatú ani dokončenú nemeníme)
  update public.cl_tasks t set status = 'cancelled', updated_at = now()
   where t.date between p_from and p_to and t.status = 'todo'
     and not exists (select 1 from public.packages p where p.listing_id = t.listing_id and p.date = t.date and p.status <> 'cancelled' and not p.hidden);
  get diagnostics n_cancel = row_count;

  return jsonb_build_object('ok', true, 'new', n_new, 'updated', n_upd, 'cancelled', n_cancel);
end $fn$;

-- ---------------------------------------------------------------- priradenie (manažérka)
create or replace function public.cl_assign(p_task uuid, p_email text, p_reason text, p_distance numeric, p_auto boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
  who text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.cl_tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.status in ('done', 'cancelled') then
    return jsonb_build_object('ok', false, 'status', 'closed');
  end if;
  if t.status = 'in_progress' and t.cleaner_email is distinct from who then
    return jsonb_build_object('ok', false, 'status', 'in_progress');
  end if;
  if who is not null and not exists (select 1 from public.cl_staff where email = who and role = 'cleaner' and active) then
    return jsonb_build_object('ok', false, 'status', 'bad_cleaner');
  end if;
  update public.cl_tasks set cleaner_email = who, assigned_by = public.cl_email(), assigned_at = case when who is null then null else now() end,
         auto_assigned = coalesce(p_auto, false) and who is not null, assign_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300),
         distance_km = case when who is null then null else p_distance end, updated_at = now()
   where id = p_task;
  perform public.cl_log(p_task, case when who is null then 'unassigned' else 'assigned' end, jsonb_build_object('to', who, 'from', t.cleaner_email, 'auto', coalesce(p_auto, false), 'reason', p_reason, 'km', p_distance));
  return jsonb_build_object('ok', true);
end $fn$;

-- hromadné priradenie z návrhu: [{task_id, email, reason, km}], všetko alebo nič
create or replace function public.cl_assign_bulk(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  it jsonb;
  res jsonb;
  done int := 0;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    res := public.cl_assign((it ->> 'task_id')::uuid, it ->> 'email', it ->> 'reason', nullif(it ->> 'km', '')::numeric, true);
    if (res ->> 'ok')::boolean then
      done := done + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'assigned', done, 'skipped', jsonb_array_length(p_items) - done);
end $fn$;

-- ---------------------------------------------------------------- práca upratovačky
create or replace function public.cl_start_task(p_task uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
  f public.cl_flats;
  items jsonb;
  extra text[];
  i int := 0;
  label text;
begin
  if not (public.cl_is_cleaner() or public.cl_is_manager()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.cl_tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.cleaner_email is distinct from public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if t.status = 'in_progress' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  if t.status <> 'todo' then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  if t.cleaner_email is null then
    return jsonb_build_object('ok', false, 'status', 'unassigned');
  end if;
  update public.cl_tasks set status = 'in_progress', started_at = now(), updated_at = now() where id = p_task;
  -- checklist: spoločný + body bytu + body z karty Práčovne; vytvorí sa raz
  if not exists (select 1 from public.cl_checklist_items where task_id = p_task) then
    select * into f from public.cl_flats where listing_id = t.listing_id;
    items := coalesce(public.cl_setting('checklist'), '[]'::jsonb);
    for label in select jsonb_array_elements_text(items) loop
      insert into public.cl_checklist_items (task_id, sort, label) values (p_task, i, label);
      i := i + 1;
    end loop;
    for label in select unnest(coalesce(f.extra_checklist, '{}'::text[])) loop
      insert into public.cl_checklist_items (task_id, sort, label) values (p_task, i, label);
      i := i + 1;
    end loop;
    if jsonb_typeof(t.snapshot -> 'checklist') = 'array' then
      for label in select jsonb_array_elements_text(t.snapshot -> 'checklist') loop
        insert into public.cl_checklist_items (task_id, sort, label) values (p_task, i, label);
        i := i + 1;
      end loop;
    end if;
  end if;
  perform public.cl_log(p_task, 'started', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.cl_toggle_item(p_item uuid, p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  it public.cl_checklist_items;
  t public.cl_tasks;
begin
  select * into it from public.cl_checklist_items where id = p_item;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  select * into t from public.cl_tasks where id = it.task_id;
  if t.cleaner_email is distinct from public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if t.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  update public.cl_checklist_items set done = coalesce(p_done, false), done_at = case when coalesce(p_done, false) then now() else null end where id = p_item;
  return jsonb_build_object('ok', true);
end $fn$;

-- fotka sa nahrá do úložiska pod cestou <id úlohy>/<súbor>; tu sa len zapíše
create or replace function public.cl_add_photo(p_task uuid, p_kind text, p_path text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
  pid uuid;
begin
  select * into t from public.cl_tasks where id = p_task;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.cleaner_email is distinct from public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('before', 'after', 'issue') or p_path is null or p_path not like p_task::text || '/%' or char_length(p_path) > 300 then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if t.status not in ('in_progress', 'done') then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  if (select count(*) from public.cl_photos where task_id = p_task) >= 40 then
    return jsonb_build_object('ok', false, 'status', 'too_many');
  end if;
  insert into public.cl_photos (task_id, kind, path, note, taken_by) values (p_task, p_kind, p_path, left(nullif(btrim(coalesce(p_note, '')), ''), 300), public.cl_email()) returning id into pid;
  return jsonb_build_object('ok', true, 'id', pid);
end $fn$;

create or replace function public.cl_remove_photo(p_photo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  ph public.cl_photos;
  t public.cl_tasks;
begin
  select * into ph from public.cl_photos where id = p_photo;
  if not found then
    return jsonb_build_object('ok', true);
  end if;
  select * into t from public.cl_tasks where id = ph.task_id;
  if (t.cleaner_email is distinct from public.cl_email() or t.status <> 'in_progress') and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.cl_photos where id = p_photo;
  return jsonb_build_object('ok', true, 'path', ph.path);
end $fn$;

create or replace function public.cl_report_problem(p_task uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
  txt text := left(btrim(coalesce(p_text, '')), 500);
begin
  select * into t from public.cl_tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.cleaner_email is distinct from public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if txt = '' then
    return jsonb_build_object('ok', false, 'status', 'text_required');
  end if;
  update public.cl_tasks set problem_text = txt, problem_at = now(), updated_at = now() where id = p_task;
  perform public.cl_log(p_task, 'problem', jsonb_build_object('text', txt));
  return jsonb_build_object('ok', true);
end $fn$;

-- dokončenie: všetky body checklistu musia byť odfajknuté (inak je potrebná poznámka) a podľa nastavenia aj fotky "po"
create or replace function public.cl_finish_task(p_task uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  t public.cl_tasks;
  open_items int;
  after_photos int;
  need_photos int := coalesce((public.cl_setting('rules') ->> 'min_after_photos')::int, 0);
  note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  select * into t from public.cl_tasks where id = p_task for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if t.cleaner_email is distinct from public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if t.status = 'done' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  if t.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  select count(*) into open_items from public.cl_checklist_items where task_id = p_task and not done;
  if open_items > 0 and note is null then
    return jsonb_build_object('ok', false, 'status', 'items_open', 'open', open_items);
  end if;
  select count(*) into after_photos from public.cl_photos where task_id = p_task and kind = 'after';
  if after_photos < need_photos then
    return jsonb_build_object('ok', false, 'status', 'photos_needed', 'need', need_photos, 'have', after_photos);
  end if;
  update public.cl_tasks set status = 'done', finished_at = now(), cleaner_note = coalesce(note, cleaner_note), updated_at = now() where id = p_task;
  perform public.cl_log(p_task, 'finished', jsonb_build_object('open_items', open_items, 'after_photos', after_photos));
  return jsonb_build_object('ok', true);
end $fn$;

-- správa vrátia úlohu do práce (napr. nedoupratané)
create or replace function public.cl_reopen(p_task uuid, p_reason text) returns jsonb
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
  if t.status <> 'done' then
    return jsonb_build_object('ok', false, 'status', t.status);
  end if;
  update public.cl_tasks set status = 'in_progress', finished_at = null, updated_at = now() where id = p_task;
  perform public.cl_log(p_task, 'reopened', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- tím, profil, byty
create or replace function public.cl_save_staff(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  e text := lower(btrim(coalesce(p ->> 'email', '')));
  s public.cl_staff;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.app_users where lower(email) = e and active) then
    return jsonb_build_object('ok', false, 'status', 'no_user');
  end if;
  insert into public.cl_staff (email, name, role, phone, address, city, lat, lng, geo_source, max_per_day, max_per_week, max_distance_km, work_days, days_off,
                               preferred_localities, excluded_listings, instructions, pay_type, hourly_rate_cents, task_rate_cents, note, active)
  values (e, coalesce(nullif(btrim(p ->> 'name'), ''), (select name from public.app_users where lower(email) = e)), coalesce(nullif(p ->> 'role', ''), 'cleaner'),
          nullif(btrim(p ->> 'phone'), ''), nullif(btrim(p ->> 'address'), ''), nullif(btrim(p ->> 'city'), ''), nullif(p ->> 'lat', '')::numeric, nullif(p ->> 'lng', '')::numeric,
          nullif(p ->> 'geo_source', ''), coalesce(nullif(p ->> 'max_per_day', '')::int, 4), coalesce(nullif(p ->> 'max_per_week', '')::int, 0), coalesce(nullif(p ->> 'max_distance_km', '')::int, 0),
          coalesce((select array_agg(x::int) from jsonb_array_elements_text(p -> 'work_days') x), '{1,2,3,4,5,6,7}'),
          coalesce((select array_agg(x::date) from jsonb_array_elements_text(p -> 'days_off') x), '{}'),
          coalesce((select array_agg(left(btrim(x), 80)) from jsonb_array_elements_text(p -> 'preferred_localities') x where btrim(x) <> ''), '{}'),
          coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'excluded_listings') x where btrim(x) <> ''), '{}'),
          coalesce(left(p ->> 'instructions', 2000), ''),
          coalesce(nullif(p ->> 'pay_type', ''), 'per_task'), coalesce(nullif(p ->> 'hourly_rate_cents', '')::int, 0), coalesce(nullif(p ->> 'task_rate_cents', '')::int, 0),
          nullif(btrim(p ->> 'note'), ''), coalesce((p ->> 'active')::boolean, true))
  on conflict (email) do update set
    name = coalesce(nullif(btrim(p ->> 'name'), ''), public.cl_staff.name),
    role = coalesce(nullif(p ->> 'role', ''), public.cl_staff.role),
    phone = case when p ? 'phone' then nullif(btrim(p ->> 'phone'), '') else public.cl_staff.phone end,
    address = case when p ? 'address' then nullif(btrim(p ->> 'address'), '') else public.cl_staff.address end,
    city = case when p ? 'city' then nullif(btrim(p ->> 'city'), '') else public.cl_staff.city end,
    lat = case when p ? 'lat' then nullif(p ->> 'lat', '')::numeric else public.cl_staff.lat end,
    lng = case when p ? 'lng' then nullif(p ->> 'lng', '')::numeric else public.cl_staff.lng end,
    geo_source = case when p ? 'geo_source' then nullif(p ->> 'geo_source', '') else public.cl_staff.geo_source end,
    max_per_day = coalesce(nullif(p ->> 'max_per_day', '')::int, public.cl_staff.max_per_day),
    max_per_week = coalesce(nullif(p ->> 'max_per_week', '')::int, public.cl_staff.max_per_week),
    max_distance_km = coalesce(nullif(p ->> 'max_distance_km', '')::int, public.cl_staff.max_distance_km),
    work_days = case when p ? 'work_days' then (select array_agg(x::int) from jsonb_array_elements_text(p -> 'work_days') x) else public.cl_staff.work_days end,
    days_off = case when p ? 'days_off' then coalesce((select array_agg(x::date) from jsonb_array_elements_text(p -> 'days_off') x), '{}') else public.cl_staff.days_off end,
    preferred_localities = case when p ? 'preferred_localities' then coalesce((select array_agg(left(btrim(x), 80)) from jsonb_array_elements_text(p -> 'preferred_localities') x where btrim(x) <> ''), '{}') else public.cl_staff.preferred_localities end,
    excluded_listings = case when p ? 'excluded_listings' then coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'excluded_listings') x where btrim(x) <> ''), '{}') else public.cl_staff.excluded_listings end,
    instructions = case when p ? 'instructions' then coalesce(left(p ->> 'instructions', 2000), '') else public.cl_staff.instructions end,
    pay_type = coalesce(nullif(p ->> 'pay_type', ''), public.cl_staff.pay_type),
    hourly_rate_cents = coalesce(nullif(p ->> 'hourly_rate_cents', '')::int, public.cl_staff.hourly_rate_cents),
    task_rate_cents = coalesce(nullif(p ->> 'task_rate_cents', '')::int, public.cl_staff.task_rate_cents),
    note = case when p ? 'note' then nullif(btrim(p ->> 'note'), '') else public.cl_staff.note end,
    active = coalesce((p ->> 'active')::boolean, public.cl_staff.active),
    updated_at = now()
  returning * into s;
  perform public.cl_log(null, 'staff_saved', jsonb_build_object('email', e));
  return jsonb_build_object('ok', true, 'email', s.email);
end $fn$;

-- upratovačka si mení vlastné údaje (adresa, telefón, dni, súradnice z mapovania adresy)
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
    work_days = case when p ? 'work_days' then (select array_agg(x::int) from jsonb_array_elements_text(p -> 'work_days') x) else work_days end,
    days_off = case when p ? 'days_off' then coalesce((select array_agg(x::date) from jsonb_array_elements_text(p -> 'days_off') x), '{}') else days_off end,
    updated_at = now()
   where email = me;
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.cl_save_flat(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  id text := btrim(coalesce(p ->> 'listing_id', ''));
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if id = '' then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  insert into public.cl_flats (listing_id, listing_name, access_note, extra_checklist, est_minutes, pay_cents, active, lat, lng)
  values (id, p ->> 'listing_name', coalesce(left(p ->> 'access_note', 2000), ''),
          coalesce((select array_agg(left(btrim(x), 200)) from jsonb_array_elements_text(p -> 'extra_checklist') x where btrim(x) <> ''), '{}'),
          coalesce(nullif(p ->> 'est_minutes', '')::int, 90), nullif(p ->> 'pay_cents', '')::int, coalesce((p ->> 'active')::boolean, true), nullif(p ->> 'lat', '')::numeric, nullif(p ->> 'lng', '')::numeric)
  on conflict (listing_id) do update set
    access_note = case when p ? 'access_note' then coalesce(left(p ->> 'access_note', 2000), '') else public.cl_flats.access_note end,
    extra_checklist = case when p ? 'extra_checklist' then coalesce((select array_agg(left(btrim(x), 200)) from jsonb_array_elements_text(p -> 'extra_checklist') x where btrim(x) <> ''), '{}') else public.cl_flats.extra_checklist end,
    est_minutes = coalesce(nullif(p ->> 'est_minutes', '')::int, public.cl_flats.est_minutes),
    pay_cents = case when p ? 'pay_cents' then nullif(p ->> 'pay_cents', '')::int else public.cl_flats.pay_cents end,
    active = coalesce((p ->> 'active')::boolean, public.cl_flats.active),
    lat = case when p ? 'lat' then nullif(p ->> 'lat', '')::numeric else public.cl_flats.lat end,
    lng = case when p ? 'lng' then nullif(p ->> 'lng', '')::numeric else public.cl_flats.lng end,
    updated_at = now();
  perform public.cl_log(null, 'flat_saved', jsonb_build_object('listing_id', id));
  return jsonb_build_object('ok', true);
end $fn$;

-- manažérka ručne opraví sumu za jednu úlohu (null = späť na výpočet zo sadzby)
create or replace function public.cl_set_task_pay(p_task uuid, p_cents int) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_cents is not null and (p_cents < 0 or p_cents > 1000000) then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  update public.cl_tasks set pay_override_cents = p_cents, updated_at = now() where id = p_task;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  perform public.cl_log(p_task, 'pay_set', jsonb_build_object('cents', p_cents));
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.cl_save_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_key not in ('checklist', 'rules') then
    return jsonb_build_object('ok', false, 'status', 'bad_key');
  end if;
  insert into public.cl_settings (key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.cl_log(null, 'setting_saved', jsonb_build_object('key', p_key));
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- nástenka
create or replace function public.cl_post(p_text text, p_parent uuid, p_pinned boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  txt text := left(btrim(coalesce(p_text, '')), 1000);
begin
  if not (public.cl_is_manager() or public.cl_is_cleaner()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if txt = '' then
    return jsonb_build_object('ok', false, 'status', 'text_required');
  end if;
  -- pripnúť môže len manažérka; odpoveď sa dá len pod hlavný príspevok
  if p_parent is not null and not exists (select 1 from public.cl_posts where id = p_parent and parent_id is null and removed_at is null) then
    return jsonb_build_object('ok', false, 'status', 'bad_parent');
  end if;
  insert into public.cl_posts (parent_id, author_email, author_name, text, pinned)
  values (p_parent, public.cl_email(), public.cl_name(), txt, coalesce(p_pinned, false) and public.cl_is_manager() and p_parent is null);
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.cl_remove_post(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  po public.cl_posts;
begin
  select * into po from public.cl_posts where id = p_id;
  if not found then
    return jsonb_build_object('ok', true);
  end if;
  if po.author_email <> public.cl_email() and not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.cl_posts set removed_at = now() where id = p_id or parent_id = p_id;
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- prihlášky a prístupy
-- Verejný formulár. Bez priameho prístupu k tabuľke; obmedzenie počtu a rovnaká odpoveď pre každý vstup.
create or replace function public.cl_apply(p_name text, p_email text, p_phone text, p_address text, p_city text, p_note text, p_hp text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  h text := md5(lower(btrim(coalesce(p_email, ''))));
begin
  -- robot vyplnil skryté pole: tvárime sa, že prešlo
  if btrim(coalesce(p_hp, '')) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 120
     or char_length(btrim(coalesce(p_phone, ''))) not between 6 and 30 or char_length(btrim(coalesce(p_address, ''))) not between 5 and 200 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;
  if (select count(*) from public.cl_apply_log where at > now() - interval '1 hour') >= 30
     or (select count(*) from public.cl_apply_log where email_hash = h and at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'status', 'too_many');
  end if;
  insert into public.cl_apply_log (email_hash) values (h);
  if not exists (select 1 from public.cl_applications where lower(email) = e and status = 'new') and not exists (select 1 from public.cl_staff where email = e) then
    insert into public.cl_applications (name, email, phone, address, city, note)
    values (btrim(p_name), e, btrim(p_phone), btrim(p_address), left(nullif(btrim(coalesce(p_city, '')), ''), 80), left(nullif(btrim(coalesce(p_note, '')), ''), 500));
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- schválenie: vznikne používateľ s existujúcou rolou "cleaning" a profil upratovačky; účet sa vytvorí cl_create_account
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
    insert into public.cl_staff (email, name, role, phone, address, city)
    values (lower(a.email), a.name, 'cleaner', a.phone, a.address, a.city)
    on conflict (email) do update set active = true;
  end if;
  update public.cl_applications set status = case when coalesce(p_approve, false) then 'approved' else 'rejected' end, decided_by = public.cl_email(), decided_at = now() where id = p_id;
  perform public.cl_log(null, 'application_decided', jsonb_build_object('email', lower(a.email), 'approved', coalesce(p_approve, false)));
  return jsonb_build_object('ok', true, 'email', lower(a.email), 'approved', coalesce(p_approve, false));
end $fn$;

-- vytvorenie prihlasovacieho účtu pre upratovačku (rovnaký postup a rovnaké prvotné heslo s povinnou zmenou ako admin_reset_password;
-- zavolať ho môže manažérka len pre e-mail, ktorý má profil upratovačky)
create or replace function public.cl_create_account(p_email text) returns jsonb
language plpgsql security definer set search_path = 'public', 'extensions' as $fn$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  pw text;
  uid uuid;
  created boolean := false;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cl_staff where email = e and active) or not exists (select 1 from public.app_users where lower(email) = e and active) then
    return jsonb_build_object('ok', false, 'status', 'no_staff');
  end if;
  pw := coalesce((select value ->> 'default_password' from public.config where key = 'auth'), 'livein');
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid is null then
    uid := gen_random_uuid();
    created := true;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, extensions.crypt(pw, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"must_change_password": true}'::jsonb, now(), now(), '', '', '', '', false);
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email', jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), now(), now(), now());
  end if;
  perform public.cl_log(null, 'account_created', jsonb_build_object('email', e, 'created', created));
  return jsonb_build_object('ok', true, 'email', e, 'created', created);
end $fn$;

-- ---------------------------------------------------------------- stav pre Práčovňu ("Upratané")
create or replace function public.cl_status_for(p_from date, p_to date) returns table (listing_id text, date date, status text, cleaner_name text, started_at timestamptz, finished_at timestamptz, has_problem boolean)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not (public.is_active_user() or public.cl_is_manager() or public.cl_is_cleaner()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select t.listing_id, t.date, t.status, s.name, t.started_at, t.finished_at, t.problem_text is not null
      from public.cl_tasks t left join public.cl_staff s on s.email = t.cleaner_email
     where t.date between p_from and p_to and t.status <> 'cancelled';
end $fn$;

-- ---------------------------------------------------------------- RLS
alter table public.cl_staff enable row level security;
alter table public.cl_applications enable row level security;
alter table public.cl_flats enable row level security;
alter table public.cl_tasks enable row level security;
alter table public.cl_checklist_items enable row level security;
alter table public.cl_photos enable row level security;
alter table public.cl_posts enable row level security;
alter table public.cl_events enable row level security;
alter table public.cl_settings enable row level security;
alter table public.cl_apply_log enable row level security;

revoke all on public.cl_staff, public.cl_applications, public.cl_flats, public.cl_tasks, public.cl_checklist_items, public.cl_photos, public.cl_posts, public.cl_events, public.cl_settings, public.cl_apply_log from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.cl_staff, public.cl_applications, public.cl_flats, public.cl_tasks, public.cl_checklist_items, public.cl_photos, public.cl_posts, public.cl_events, public.cl_settings, public.cl_apply_log from authenticated;
grant select on public.cl_staff, public.cl_applications, public.cl_flats, public.cl_tasks, public.cl_checklist_items, public.cl_photos, public.cl_posts, public.cl_events, public.cl_settings to authenticated;

create policy cl_staff_select on public.cl_staff for select to authenticated using (public.cl_is_manager() or email = public.cl_email());
create policy cl_applications_select on public.cl_applications for select to authenticated using (public.cl_is_manager());
create policy cl_flats_select on public.cl_flats for select to authenticated using (
  public.cl_is_manager() or exists (select 1 from public.cl_tasks t where t.listing_id = public.cl_flats.listing_id and t.cleaner_email = public.cl_email())
);
create policy cl_tasks_select on public.cl_tasks for select to authenticated using (public.cl_is_manager() or cleaner_email = public.cl_email());
create policy cl_items_select on public.cl_checklist_items for select to authenticated using (
  public.cl_is_manager() or exists (select 1 from public.cl_tasks t where t.id = task_id and t.cleaner_email = public.cl_email())
);
create policy cl_photos_select on public.cl_photos for select to authenticated using (
  public.cl_is_manager() or exists (select 1 from public.cl_tasks t where t.id = task_id and t.cleaner_email = public.cl_email())
);
create policy cl_posts_select on public.cl_posts for select to authenticated using ((public.cl_is_manager() or public.cl_is_cleaner()) and removed_at is null);
create policy cl_events_select on public.cl_events for select to authenticated using (public.cl_is_manager());
create policy cl_settings_select on public.cl_settings for select to authenticated using (public.cl_is_manager() or public.cl_is_cleaner());

-- funkcie: len prihlásení; cl_apply aj bez prihlásenia (verejný formulár)
do $do$
declare
  f text;
begin
  foreach f in array array[
    'cl_is_manager()', 'cl_is_cleaner()', 'cl_name()', 'cl_email()', 'cl_sync_tasks(date, date)', 'cl_assign(uuid, text, text, numeric, boolean)', 'cl_assign_bulk(jsonb)',
    'cl_start_task(uuid)', 'cl_toggle_item(uuid, boolean)', 'cl_add_photo(uuid, text, text, text)', 'cl_remove_photo(uuid)', 'cl_report_problem(uuid, text)',
    'cl_finish_task(uuid, text)', 'cl_reopen(uuid, text)', 'cl_save_staff(jsonb)', 'cl_save_my_profile(jsonb)', 'cl_save_flat(jsonb)', 'cl_save_setting(text, jsonb)', 'cl_set_task_pay(uuid, int)',
    'cl_post(text, uuid, boolean)', 'cl_remove_post(uuid)', 'cl_decide_application(uuid, boolean)', 'cl_create_account(text)', 'cl_status_for(date, date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $do$;
revoke execute on function public.cl_log(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cl_setting(text) from public, anon, authenticated;
revoke execute on function public.cl_apply(text, text, text, text, text, text, text) from public;
grant execute on function public.cl_apply(text, text, text, text, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- súkromný úložný priestor na fotky
do $do$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('cleaning-photos', 'cleaning-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cl_photos_insert') then
      -- nahrávať smie priradená upratovačka (alebo manažérka) do priečinka svojej úlohy
      execute 'create policy cl_photos_insert on storage.objects for insert to authenticated with check (
        bucket_id = ''cleaning-photos'' and exists (select 1 from public.cl_tasks t where t.id::text = (storage.foldername(name))[1]
          and ((t.cleaner_email = public.cl_email() and t.status in (''in_progress'', ''done'')) or public.cl_is_manager())))';
      execute 'create policy cl_photos_read on storage.objects for select to authenticated using (
        bucket_id = ''cleaning-photos'' and exists (select 1 from public.cl_tasks t where t.id::text = (storage.foldername(name))[1]
          and (t.cleaner_email = public.cl_email() or public.cl_is_manager())))';
      execute 'create policy cl_photos_delete on storage.objects for delete to authenticated using (
        bucket_id = ''cleaning-photos'' and public.cl_is_manager())';
    end if;
  end if;
end $do$;
