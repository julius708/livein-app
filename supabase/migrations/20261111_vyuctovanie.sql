-- Vyúčtovanie majiteľom: mesačná pracovná tabuľka nákladov, ktoré sa refakturujú majiteľom bytov (termín vždy do 15. dňa za predchádzajúci mesiac).
-- Prístup len pre interný tím: admin, asistentka vedenia, operácie. Zoznam rolí je na jednom mieste (funkcia billing_team) a v lib/billing-core.js.

create or replace function public.billing_team() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select roles && array['admin','assistant','operations']::text[] from public.app_users where lower(email)=lower(auth.jwt()->>'email') and active), false)
$$;

create table if not exists public.billing_periods (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),      -- prvý deň mesiaca, za ktorý sa vyúčtuje
  status text not null default 'open' check (status in ('open','closed')),
  created_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.billing_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.billing_periods(id) on delete cascade,
  legacy_id text,                       -- _id zo zálohy / prototypu (import)
  ord numeric not null default 0,       -- poradie
  byt text not null default '',         -- názov bytu z Guesty alebo skupiny bytov jedného majiteľa; prázdne = bez bytu
  "cast" text,                          -- časť skupiny / poschodie (napr. „3. poschodie (A3.3)“)
  listing_id text,                      -- Guesty listing, ak je známy
  kat text not null default 'Iné',
  polozka text not null default '',     -- jasný popis: čo – kde – odkiaľ
  ks numeric,
  cena numeric,                         -- cena za kus s DPH
  suma numeric,                         -- len ak je známa iba celková suma
  stav text not null default 'Doplniť sumu'
    check (stav in ('Suma OK','Doplniť sumu','Čaká na Patrika (cena opravy)','Skontrolovať duplicitu','Nepriradené k bytu','Neúčtovať','Cenník (bežná cena)') or stav like 'Pravdepodobne %'),
  asana text,                           -- gid alebo URL úlohy
  foto text[] not null default '{}',    -- Asana asset id
  pozn text,
  zistit text,                          -- „Zistiť od: …“
  firma text check (firma in ('International','Management','Slovakia')),   -- prázdne = dopočíta sa z Guesty
  typ text check (typ in ('novy','existujuci')),
  datum date,                           -- dátum dokladu
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists billing_items_legacy on public.billing_items (period_id, legacy_id) where legacy_id is not null;
create index if not exists billing_items_period_byt on public.billing_items (period_id, byt);

-- Cenník bežných položiek na byty (ceny s DPH). Nový mesiac z neho založí riadky „Cenník (bežná cena)“.
create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  polozka text not null,
  obchod text,
  cena numeric not null,
  poznamka text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.billing_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists billing_items_touch on public.billing_items;
create trigger billing_items_touch before update on public.billing_items for each row execute function public.billing_touch();

alter table public.billing_periods enable row level security;
alter table public.billing_items enable row level security;
alter table public.price_list enable row level security;

do $$
declare t text;
begin
  foreach t in array array['billing_periods','billing_items','price_list'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_team_all') then
      execute format('create policy %I on public.%I for all to authenticated using (public.billing_team()) with check (public.billing_team())', t || '_team_all', t);
    end if;
  end loop;
end $$;

revoke all on public.billing_periods, public.billing_items, public.price_list from anon;
grant select, insert, update, delete on public.billing_periods, public.billing_items, public.price_list to authenticated;
