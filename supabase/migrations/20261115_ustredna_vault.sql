-- Ústredňa: index Obsidian trezoru pre mapu a vyhľadávanie. Len nová tabuľka hq_vault; nič existujúce sa nemení.
-- Ukladá sa len index (názvy, cesty, štítky, prepojenia poznámok), nie ich text. Jeden riadok na trezor, pri synchronizácii sa nahrádza.
-- Aplikované v produkcii (LIVE-IN Core) 13. 11. 2026 ako migrácia `ustredna_vault` (verzia 20261112220712).
-- Návrat: drop table hq_vault;
create table if not exists hq_vault (
  key text primary key,                       -- 'team' = tímový trezor Live-in International
  name text not null,
  note_count int not null default 0,
  link_count int not null default 0,
  synced_at timestamptz not null,             -- kedy skript trezor prečítal
  synced_by text,                             -- vykonávateľ, ktorý index poslal (určil server)
  index_gz text not null,                     -- gzip + base64 zbaleného indexu
  updated_at timestamptz not null default now()
);
alter table hq_vault enable row level security;
drop policy if exists hq_vault_hq_select on hq_vault;
drop policy if exists hq_vault_hq_insert on hq_vault;
drop policy if exists hq_vault_hq_update on hq_vault;
create policy hq_vault_hq_select on hq_vault for select to authenticated using (is_app_admin() or has_app_role('bot'));
create policy hq_vault_hq_insert on hq_vault for insert to authenticated with check (is_app_admin() or has_app_role('bot'));
create policy hq_vault_hq_update on hq_vault for update to authenticated using (is_app_admin() or has_app_role('bot')) with check (is_app_admin() or has_app_role('bot'));
