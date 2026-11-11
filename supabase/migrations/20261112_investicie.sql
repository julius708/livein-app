-- Investičné nehnuteľnosti a kupujúci (modul /investicie). Len pridáva nové tabuľky inv_*; nič existujúce sa nemení.
-- Prístup: rola `crm` (Zuzana, Patrik, Július) cez has_app_role('crm'); nastavenia a zdroje píše len admin; behy agenta píše server (service role).

create or replace function inv_touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- nastavenia (kalkulačka, prahy výhodnosti, filtre agenta, plán behu)
create table if not exists inv_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text, updated_at timestamptz not null default now()
);

-- zdroje (feedy, odkazy, externý agent cez ingest API) a ich zdravie
create table if not exists inv_sources (
  key text primary key,
  name text not null,
  kind text not null check (kind in ('feed','ingest','url')),
  url text,
  config jsonb not null default '{}'::jsonb,
  mode text not null default 'both' check (mode in ('general','targeted','both')),
  enabled boolean not null default true,
  blocked boolean not null default false, blocked_reason text,
  last_ok_at timestamptz, last_error text, last_error_at timestamptz, consecutive_failures int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists inv_properties (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new' check (status in ('new','review','active','confirmed','reserved','sold','withdrawn','unknown')),
  title text, city text, district text, address text, lat double precision, lon double precision,
  type text check (type in ('byt','dom')), rooms int, bedrooms int, floor int,
  area_interior numeric check (area_interior is null or area_interior > 0),   -- interiér a exteriér sú oddelene
  area_exterior numeric check (area_exterior is null or area_exterior >= 0),
  price numeric check (price is null or price > 0), price_currency text not null default 'EUR',
  condition text, parking text, parking_mandatory boolean, parking_in_price boolean, parking_price numeric,
  commission_in_price boolean, commission_pct numeric, commission_amount numeric,
  legal_costs numeric, reno numeric, furnishing numeric, setup numeric, reserve numeric, monthly_fixed numeric,   -- null = neznáme, nikdy nula
  standard text, zone text,
  rental_mode text not null default 'compare' check (rental_mode in ('str','ltr','compare')),
  rental jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb, equipment text[] not null default '{}',
  seller text,
  prov jsonb not null default '{}'::jsonb,                                   -- pôvod údajov: pole → { kind, ref, at }
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz, last_confirmed_at timestamptz, last_confirmed_by text, availability_note text,
  notes_internal text, next_task text, next_task_due date, next_task_owner text,
  merged_into uuid references inv_properties(id),
  calc_id uuid,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists inv_properties_status on inv_properties(status) where merged_into is null;
create index if not exists inv_properties_city on inv_properties(lower(city)) where merged_into is null;

create table if not exists inv_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references inv_properties(id) on delete cascade,
  source_key text not null, external_id text not null, url text, title text,
  state text not null default 'active' check (state in ('active','removed','error')),
  price numeric, missing_checks int not null default 0,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz, last_checked_at timestamptz,
  raw jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_key, external_id)                                            -- opakovaný import nevytvorí duplicitu
);
create index if not exists inv_listings_property on inv_listings(property_id);

create table if not exists inv_price_history (
  id bigserial primary key, property_id uuid not null references inv_properties(id) on delete cascade, listing_id uuid,
  price numeric, at timestamptz not null default now(), source text
);
create index if not exists inv_price_history_property on inv_price_history(property_id, at desc);

create table if not exists inv_events (
  id bigserial primary key, property_id uuid, inquiry_id uuid, type text not null, payload jsonb not null default '{}'::jsonb,
  user_email text, at timestamptz not null default now()
);
create index if not exists inv_events_property on inv_events(property_id, at desc);
create index if not exists inv_events_inquiry on inv_events(inquiry_id, at desc);

create table if not exists inv_calcs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references inv_properties(id) on delete cascade,
  version int not null, input_hash text not null, calc_version text not null,
  result jsonb not null, quality_score int, quality_level text,
  created_at timestamptz not null default now(),
  unique (property_id, input_hash), unique (property_id, version)
);

create table if not exists inv_merge_candidates (
  id uuid primary key default gen_random_uuid(),
  property_a uuid not null references inv_properties(id) on delete cascade, property_b uuid not null references inv_properties(id) on delete cascade,
  score int not null, reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','merged','dismissed')),
  decided_by text, decided_at timestamptz, created_at timestamptz not null default now(),
  check (property_a < property_b), unique (property_a, property_b)
);

create table if not exists inv_inquiries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),                                 -- jeden kontakt môže mať viac dopytov
  label text,
  owner_email text, status text not null default 'new' check (status in ('new','confirmed','selection','viewings','purchase','handover','paused','closed')),
  source text, last_confirmed_at timestamptz,
  cities text[] not null default '{}', areas text[] not null default '{}', excluded_areas text[] not null default '{}',
  types text[] not null default '{}', rooms int[] not null default '{}', area_min numeric, area_max numeric, conditions text[] not null default '{}',
  must jsonb not null default '{}'::jsonb, prefer jsonb not null default '{}'::jsonb,        -- povinné podmienky a preferencie oddelene
  budget_total numeric, budget_kind text check (budget_kind in ('total','equity','unknown')),
  equity numeric, loan_planned numeric, price_cap numeric,
  purchase_by date, reno_willing boolean, prep_budget numeric,
  goal text check (goal in ('str','ltr','compare')), target_yield_pct numeric, target_cashflow_month numeric, risk text check (risk in ('low','medium','high')),
  wants_management boolean,
  notes text, next_step text, next_owner text, next_due date,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists inv_inquiries_lead on inv_inquiries(lead_id);
create index if not exists inv_inquiries_status on inv_inquiries(status);

create table if not exists inv_matches (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inv_inquiries(id) on delete cascade, property_id uuid not null references inv_properties(id) on delete cascade,
  category text not null check (category in ('match','outside','unavailable')),
  score int not null default 0,
  decision text not null default 'open' check (decision in ('open','review','shortlist','viewing','offer','rejected')),
  decision_reason text, decided_by text, decided_at timestamptz,
  result jsonb not null default '{}'::jsonb, calc_id uuid, signature text,
  needs_review boolean not null default false, review_reason text,
  notified_signature text, notified_at timestamptz,
  viewing_at timestamptz, viewing_note text, seller_confirmed_at timestamptz,
  first_matched_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (inquiry_id, property_id)                                            -- dvojica dopyt–nehnuteľnosť raz
);
create index if not exists inv_matches_inquiry on inv_matches(inquiry_id, category, score desc);
create index if not exists inv_matches_property on inv_matches(property_id);

create table if not exists inv_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references inv_properties(id) on delete cascade, inquiry_id uuid references inv_inquiries(id) on delete cascade, match_id uuid references inv_matches(id) on delete cascade,
  title text not null, due date, owner_email text, status text not null default 'open' check (status in ('open','done')),
  created_by text, created_at timestamptz not null default now(), done_at timestamptz, done_by text
);

create table if not exists inv_offers (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inv_inquiries(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','reviewed','sent')),
  match_ids uuid[] not null default '{}',
  content jsonb not null default '{}'::jsonb,        -- klientska časť (po kontrole človekom)
  internal jsonb not null default '{}'::jsonb,       -- interné poznámky, nikdy v klientskom náhľade
  calc_snapshot jsonb not null default '{}'::jsonb,  -- pôvodné výpočty v čase prípravy ponuky
  reviewed_by text, reviewed_at timestamptz, created_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists inv_runs (
  id bigserial primary key,
  mode text not null check (mode in ('general','targeted','both')), trigger text not null,
  status text not null default 'running' check (status in ('running','ok','partial','failed')),
  attempt int not null default 1,
  started_at timestamptz not null default now(), finished_at timestamptz, heartbeat_at timestamptz not null default now(),
  stats jsonb not null default '{}'::jsonb, source_results jsonb not null default '[]'::jsonb, cursor jsonb not null default '{}'::jsonb, error text
);
create index if not exists inv_runs_started on inv_runs(started_at desc);

-- atómový zámok proti súbežným behom (využíva existujúcu tabuľku sync_locks)
create or replace function inv_acquire_lock(p_name text, p_ttl_seconds int, p_run text) returns boolean
language plpgsql security definer set search_path = public as $$
declare got int;
begin
  insert into sync_locks(name, locked_until, run_id) values (p_name, now() + make_interval(secs => p_ttl_seconds), p_run)
  on conflict (name) do update set locked_until = excluded.locked_until, run_id = excluded.run_id where sync_locks.locked_until < now()
  returning 1 into got;
  return got is not null;
end $$;
create or replace function inv_release_lock(p_name text, p_run text) returns void
language sql security definer set search_path = public as $$ update sync_locks set locked_until = now() where name = p_name and run_id = p_run $$;
revoke all on function inv_acquire_lock(text,int,text), inv_release_lock(text,text) from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['inv_properties','inv_listings','inv_price_history','inv_events','inv_calcs','inv_merge_candidates','inv_inquiries','inv_matches','inv_tasks','inv_offers','inv_runs','inv_settings','inv_sources'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
  foreach t in array array['inv_properties','inv_listings','inv_price_history','inv_events','inv_calcs','inv_merge_candidates','inv_inquiries','inv_matches','inv_tasks','inv_offers'] loop
    execute format('drop policy if exists %I on %I', t || '_crm_all', t);
    execute format('create policy %I on %I for all to authenticated using (has_app_role(''crm'')) with check (has_app_role(''crm''))', t || '_crm_all', t);
  end loop;
end $$;
-- behy agenta: čítať môže tím, zapisuje len server
drop policy if exists inv_runs_crm_select on inv_runs;
create policy inv_runs_crm_select on inv_runs for select to authenticated using (has_app_role('crm'));
-- nastavenia a zdroje: čítať tím, meniť admin
drop policy if exists inv_settings_crm_select on inv_settings; drop policy if exists inv_settings_admin_write on inv_settings;
create policy inv_settings_crm_select on inv_settings for select to authenticated using (has_app_role('crm'));
create policy inv_settings_admin_write on inv_settings for all to authenticated using (is_app_admin()) with check (is_app_admin());
drop policy if exists inv_sources_crm_select on inv_sources; drop policy if exists inv_sources_admin_write on inv_sources;
create policy inv_sources_crm_select on inv_sources for select to authenticated using (has_app_role('crm'));
create policy inv_sources_admin_write on inv_sources for all to authenticated using (is_app_admin()) with check (is_app_admin());

do $$ declare t text; begin
  foreach t in array array['inv_properties','inv_listings','inv_inquiries','inv_matches','inv_offers','inv_sources'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function inv_touch()', t || '_touch', t);
  end loop;
end $$;
