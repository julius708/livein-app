-- Digitálny sprievodca bytom a QR nálepky (pilot). Verejný kód bytu, karty, pravidlá, tipy, podujatia, Wi-Fi (chránené), spätná väzba, vydania štítkov.
-- Mapovanie verejný kód <-> Guesty listing ID je len na serveri (tabuľka guide_units), nikdy v klientskom kóde ani v URL.

create or replace function public.guide_team() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select roles && array['admin','operations','customer_service','bot']::text[] from public.app_users where lower(email)=lower(auth.jwt()->>'email') and active), false)
$$;

create table if not exists public.guide_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text, updated_at timestamptz not null default now()
);
insert into public.guide_settings (key, value) values
 ('general', '{"support_phone": "", "support_phone_verified": false, "template_version": 1, "notify_channel": "app", "base_url": "https://app.live-in.international"}'),
 ('pilot', '{"units": [], "note": "Pilotné jednotky doplní Július (názov + Guesty listing ID). Bez nich sa produkčné štítky nevydávajú."}')
on conflict (key) do nothing;

-- Jednotka: trvalý verejný kód (raz pridelený, nikdy sa nemení)
create table if not exists public.guide_units (
  listing_id text primary key,
  public_code text not null unique check (public_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2345679]{8}$'),
  name text, address text, city text,
  listing_verified boolean not null default false,
  status text not null default 'draft' check (status in ('draft','review','ready','active','inactive')),
  review_reason text,
  gbp_url text,
  support_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function public.guide_units_lock_code() returns trigger language plpgsql as $$
begin
  if new.public_code <> old.public_code then raise exception 'Verejný kód bytu sa nemení.'; end if;
  new.updated_at := now(); return new;
end $$;

create or replace trigger guide_units_lock_code before update on public.guide_units for each row execute function public.guide_units_lock_code();

-- Karta bytu (schválený obsah pre hostí; bez kódov a hesiel)
create table if not exists public.guide_cards (
  listing_id text primary key references public.guide_units(listing_id) on delete cascade,
  address text, address_note jsonb not null default '{}'::jsonb,  -- {sk,en}: poschodie, dvere, orientácia pre taxikára
  map_url text, lat numeric, lng numeric,
  parking jsonb not null default '{}'::jsonb,
  rules_override jsonb not null default '{}'::jsonb,
  checkout_time text, checkout jsonb not null default '{}'::jsonb,
  arrival jsonb not null default '{}'::jsonb,       -- nezáväzné pokyny bez kódov
  help jsonb not null default '{}'::jsonb,
  approved boolean not null default false, approved_by text, approved_at timestamptz,
  source text, updated_by text, updated_at timestamptz not null default now()
);
-- Wi-Fi: len na serveri po overení rezervácie; nikdy do HTML, URL ani logov
create table if not exists public.guide_wifi (
  listing_id text primary key references public.guide_units(listing_id) on delete cascade,
  ssid text not null, password text not null,
  updated_by text, updated_at timestamptz not null default now()
);
create table if not exists public.guide_rules (
  id uuid primary key default gen_random_uuid(),
  city text,                       -- null = spoločné pre všetky
  body jsonb not null default '{}'::jsonb,
  sort integer not null default 0, active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.guide_tips (
  id uuid primary key default gen_random_uuid(),
  city text not null, category text,
  title jsonb not null default '{}'::jsonb, body jsonb not null default '{}'::jsonb,
  url text, sort integer not null default 0, active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.guide_events (
  id uuid primary key default gen_random_uuid(),
  city text not null, title jsonb not null default '{}'::jsonb, body jsonb not null default '{}'::jsonb,
  place text, url text, starts_at timestamptz, ends_at timestamptz, active boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Pokusy o Wi-Fi: pseudonymné kľúče (hash s tajomstvom), krátke uchovanie; limity podľa IP, rezervácie a bytu
create table if not exists public.guide_wifi_attempts (
  id bigserial primary key,
  bucket text not null,            -- 'ip:<hash>' | 'res:<hash>' | 'unit:<kód>'
  at timestamptz not null default now()
);
create index if not exists guide_wifi_attempts_idx on public.guide_wifi_attempts(bucket, at);
-- Anonymný log: len výsledok, kód bytu a čas
create table if not exists public.guide_wifi_log (
  id bigserial primary key,
  public_code text not null, outcome text not null check (outcome in ('success','fail','limited','error')),
  at timestamptz not null default now()
);
-- E-mail hosťa k rezervácii: neoverený, potvrdiť po pripojení; newsletter samostatný súhlas
create table if not exists public.guide_guest_emails (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null, reservation_id text not null, email text not null,
  verified_at timestamptz, newsletter_consent boolean not null default false, consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reservation_id, email)
);
create table if not exists public.guide_feedback (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null, public_code text not null,
  rating smallint check (rating between 1 and 5), text text, contact text,
  lang text, created_at timestamptz not null default now()
);
-- Vydania štítkov: kľúč = Guesty listing ID + verzia šablóny; opakovanie nevydá duplikát ani oznámenie
create table if not exists public.guide_label_issues (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.guide_units(listing_id) on delete cascade,
  template_version integer not null,
  variant text not null default 'standard' check (variant in ('standard','inverted')),
  address text, support_phone text,
  pdf bytea, pdf_bytes integer,
  issued_at timestamptz not null default now(), issued_by text,
  notified_at timestamptz, notify_channel text,
  unique (listing_id, template_version)
);

alter table public.guide_settings enable row level security;
alter table public.guide_units enable row level security;
alter table public.guide_cards enable row level security;
alter table public.guide_wifi enable row level security;
alter table public.guide_rules enable row level security;
alter table public.guide_tips enable row level security;
alter table public.guide_events enable row level security;
alter table public.guide_wifi_attempts enable row level security;
alter table public.guide_wifi_log enable row level security;
alter table public.guide_guest_emails enable row level security;
alter table public.guide_feedback enable row level security;
alter table public.guide_label_issues enable row level security;
do $$ declare t text; begin
  foreach t in array array['guide_settings','guide_units','guide_cards','guide_wifi','guide_rules','guide_tips','guide_events','guide_wifi_attempts','guide_wifi_log','guide_guest_emails','guide_feedback','guide_label_issues'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_team_all') then
      execute format('create policy %I on public.%I for all to authenticated using (public.guide_team()) with check (public.guide_team())', t || '_team_all', t);
    end if;
  end loop;
end $$;
-- Verejné stránky číta server cez servisný účet (rola bot); anonymný prístup k tabuľkám neexistuje.

-- Nepovinný dotazník hosťa (profil zákazníka) s darčekom. Bez údajov o IP; e-mail len ak ho hosť sám zadá pre darček.
create table if not exists public.guide_surveys (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null, public_code text not null, city text,
  lang text not null default 'en',
  answers jsonb not null default '{}'::jsonb,
  email text, email_consent boolean not null default false,
  gift_code text,
  created_at timestamptz not null default now()
);
create index if not exists guide_surveys_created_idx on public.guide_surveys(created_at);
alter table public.guide_surveys enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='guide_surveys' and policyname='guide_surveys_team_all') then
    create policy guide_surveys_team_all on public.guide_surveys for all to authenticated using (public.guide_team()) with check (public.guide_team());
  end if;
end $$;
insert into public.guide_settings (key, value) values ('survey', '{"enabled": true, "gift": {"enabled": false, "kind": "code", "code": "", "value": "", "url": "https://booking.live-in.international", "note": "Darček doplní LIVE-IN."}}') on conflict (key) do nothing;

alter table public.guide_surveys add column if not exists guest_name text;
