-- Kľúče: evidencia fyzických kľúčov od bytov na stene v miestnosti s kľúčmi (kiosk na iPade + správa v appke).
-- Háčik = pozícia (poradové číslo zľava doprava po celých lištách). Písmená sekcií sa nepoužívajú.
-- Priradenie byt → pozícia sa dá kedykoľvek zmeniť, história pohybov ostáva (key_moves si pamätá názov aj pozíciu v čase pohybu).

create or replace function public.keys_team() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select roles && array['admin','operations','cleaning','customer_service','assistant','bot']::text[] from public.app_users where lower(email)=lower(auth.jwt()->>'email') and active), false)
$$;

create table if not exists public.key_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text, updated_at timestamptz not null default now()
);
-- lišty (rady) na stene: rozsahy pozícií; menia sa v Správe, nie v kóde
insert into public.key_settings (key, value) values
  ('rows', '[{"row":1,"from":1,"to":67},{"row":2,"from":68,"to":132},{"row":3,"from":133,"to":148}]'::jsonb),
  ('overdue_hours', '24'::jsonb)
on conflict (key) do nothing;

create table if not exists public.key_units (
  listing_id text primary key,            -- Guesty listing ID (register listings)
  listing_name text not null,
  hook_no integer unique,                  -- pozícia na stene; null = ešte nezaradený
  sets integer not null default 1 check (sets between 0 and 20),   -- koľko sád kľúčov patrí na háčik
  out_sets integer not null default 0 check (out_sets >= 0),      -- koľko sád je práve vonku
  holders jsonb not null default '[]'::jsonb,  -- [{name, email, sets, at, move_id}]
  active boolean not null default true,
  note text,
  updated_by text, updated_at timestamptz not null default now()
);
create index if not exists key_units_hook_idx on public.key_units (hook_no) where hook_no is not null;

create table if not exists public.key_moves (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  listing_name text not null,
  hook_no integer,
  action text not null check (action in ('take','return','adjust')),
  sets integer not null default 1,
  person_name text not null,
  person_email text,
  package_id uuid,                         -- balík z Práčovne, ak pohyb vznikol zo zoznamu „podľa tašiek“
  package_date date,
  source text not null default 'app' check (source in ('app','kiosk','api')),
  note text,
  created_by text,                         -- prihlásený účet (zariadenie alebo osoba)
  created_at timestamptz not null default now()
);
create index if not exists key_moves_listing_idx on public.key_moves (listing_id, created_at desc);
create index if not exists key_moves_at_idx on public.key_moves (created_at desc);

-- Udalosti inteligentného zámku (odtlačok prsta): kto vošiel do miestnosti; párujú sa s pohybmi na kiosku.
create table if not exists public.key_lock_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'unknown',
  external_id text,
  person_ref text,                         -- identifikátor osoby v zámku (odtlačok / používateľ)
  person_name text,
  event text not null default 'unlock',
  happened_at timestamptz not null default now(),
  matched_move_id uuid references public.key_moves(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists key_lock_events_ext_idx on public.key_lock_events (provider, external_id) where external_id is not null;

alter table public.key_settings enable row level security;
alter table public.key_units enable row level security;
alter table public.key_moves enable row level security;
alter table public.key_lock_events enable row level security;

do $$ declare t text; begin
  foreach t in array array['key_settings','key_units','key_moves','key_lock_events'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_team_all') then
      execute format('create policy %I on public.%I for all to authenticated using (public.keys_team()) with check (public.keys_team())', t || '_team_all', t);
    end if;
  end loop;
end $$;

-- Guru číta len (rola guru_ro existuje z 20261109_schema_map / guru)
do $$ begin
  if exists (select 1 from pg_roles where rolname='guru_ro') then
    grant select on public.key_units, public.key_moves, public.key_settings to guru_ro;
    if not exists (select 1 from pg_policies where tablename='key_units' and policyname='key_units_guru_ro') then
      create policy key_units_guru_ro on public.key_units for select to guru_ro using (true);
      create policy key_moves_guru_ro on public.key_moves for select to guru_ro using (true);
    end if;
  end if;
end $$;

-- Ručné položky na stene (kľúče bez Guesty listingu, napr. parkovacie miesto, nespárované názvy z Práčovne): sync z registra ich nevyraďuje.
alter table public.key_units add column if not exists manual boolean not null default false;
