-- Ústredňa (modul /ustredna): spoločný register práce ľudí a AI agentov. Len pridáva nové tabuľky hq_*; nič existujúce sa nemení.
-- NÁVRH: v produkcii zatiaľ NEaplikované. Návrat: drop table hq_links, hq_quarantine, hq_sources, hq_actors, hq_events; drop function hq_events_immutable();
-- Prístup: čítať a pridávať môžu admini (vedenie) a servisný účet `bot` (API agentov). Udalosti sa nedajú meniť ani mazať (len pridávať).

-- udalosti: jediný zdroj stavu úloh; kontrakt `livein-work-event-1` (lib/hq-events.js)
create table if not exists hq_events (
  id bigserial primary key,
  workspace_id text not null default 'livein',
  version text not null,
  event_id text not null,
  task_id text not null,
  case_id text not null,
  source text not null,                       -- naviazaný na overeného vykonávateľa: ui | runtime:<agent> | connector:<služba>
  source_event_id text not null,              -- kľúč pôvodnej udalosti (opakované doručenie nevytvorí ďalšiu)
  sequence int not null check (sequence >= 1),
  status text not null check (status in ('prepared','accepted','working','blocked','result_ready','verified','applied')),
  actor_id text not null,                     -- kto udalosť zapísal (určil server podľa prihlásenia, nie telo požiadavky)
  assignee_id text not null,
  summary text not null,
  next_action text not null,
  occurred_at text not null,                  -- čas udalosti tak, ako bol podpísaný v odtlačku (ISO s časovou zónou)
  received_at text not null,
  evidence jsonb not null default '[]'::jsonb,   -- verzované dôkazy: [{ uri, version, digest }]
  verification jsonb,                         -- { checkedEventId, checkedDigests } – ktorú verziu kontrolór overil
  receipt jsonb,                              -- { id, target, verifiedEventId } – potvrdenie cieľovej služby
  refs jsonb,                                 -- pôvodné odkazy: [{ kind: slack|asana|…, id, url }]
  payload_digest text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, event_id),
  unique (workspace_id, source, source_event_id),
  unique (workspace_id, task_id, sequence)    -- súbežný zápis rovnakého poradia zlyhá, novší stav sa neprepíše
);
create index if not exists hq_events_task on hq_events(workspace_id, task_id, sequence);
create index if not exists hq_events_assignee on hq_events(workspace_id, assignee_id);

create or replace function hq_events_immutable() returns trigger language plpgsql as $$ begin raise exception 'hq_events je len na pridávanie'; end $$;
drop trigger if exists hq_events_no_change on hq_events;
create trigger hq_events_no_change before update or delete on hq_events for each row execute function hq_events_immutable();

-- vykonávatelia mimo zabudovaného registra (nové roly sa pridávajú tu; história sa neprepisuje). Tokeny tu NIE sú: sú v premennej HQ_AGENT_TOKENS.
create table if not exists hq_actors (
  id text primary key,                        -- napr. agent:viktor, integration:hubspot
  kind text not null default 'agent' check (kind in ('person','agent','integration')),
  name text not null, role text, runtime text,
  capabilities text[] not null default '{}',  -- assign | work | verify | apply
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- zdroje a ich zdravie: účet/rozsah, posledný úspech, chyba, pokryté obdobie
create table if not exists hq_sources (
  key text primary key,
  name text, kind text, account text, scope text, note text,
  status text not null default 'off' check (status in ('live','partial','pending','off')),
  last_ok_at timestamptz, last_error text, last_error_at timestamptz,
  covered_from timestamptz, covered_to timestamptz,
  updated_at timestamptz not null default now()
);

-- odmietnuté a oneskorené udalosti (nestrácajú sa a neovplyvnia stav úlohy)
create table if not exists hq_quarantine (
  id bigserial primary key,
  workspace_id text not null default 'livein',
  actor_id text, op text, task_id text, reason_code text not null, reason text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index if not exists hq_quarantine_at on hq_quarantine(workspace_id, received_at desc);

-- mapovanie úloh na existujúce ID iných systémov (vlákno v Slacku, úloha v Asane…); jedno externé ID patrí jednej úlohe
create table if not exists hq_links (
  id bigserial primary key,
  workspace_id text not null default 'livein',
  task_id text not null, case_id text,
  kind text not null, external_id text not null, url text,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, external_id)
);
create index if not exists hq_links_task on hq_links(workspace_id, task_id);

do $$ declare t text; begin
  foreach t in array array['hq_events','hq_actors','hq_sources','hq_quarantine','hq_links'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_hq_select', t);
    execute format('drop policy if exists %I on %I', t || '_hq_insert', t);
    execute format('create policy %I on %I for select to authenticated using (is_app_admin() or has_app_role(''bot''))', t || '_hq_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_app_admin() or has_app_role(''bot''))', t || '_hq_insert', t);
  end loop;
end $$;
-- meniť sa smie len zdravie zdrojov a register vykonávateľov; udalosti, karanténa a odkazy sú len na pridávanie
drop policy if exists hq_sources_hq_update on hq_sources;
create policy hq_sources_hq_update on hq_sources for update to authenticated using (is_app_admin() or has_app_role('bot')) with check (is_app_admin() or has_app_role('bot'));
drop policy if exists hq_actors_hq_update on hq_actors;
create policy hq_actors_hq_update on hq_actors for update to authenticated using (is_app_admin()) with check (is_app_admin());
