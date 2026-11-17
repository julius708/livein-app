-- Návrhy zmien kódu z chatu Pomocník (Vyúčtovanie): fronta, stav PR a rozhodnutie schvaľovateľa. Len nová tabuľka.
create table if not exists billing_changes (
  id uuid primary key default gen_random_uuid(),
  requested_by text not null, requested_name text,
  title text not null, request text not null, transcript text,
  status text not null default 'queued' check (status in ('queued','working','ready','failed','merged','rejected')),
  branch text, pr_number int, pr_url text, pr_node text, head_sha text,
  summary text, risks text, files jsonb not null default '[]'::jsonb,
  checks jsonb not null default '{}'::jsonb, error text,
  kind text not null default 'change' check (kind in ('change','revert')),
  decided_by text, decided_at timestamptz, merged_sha text,
  started_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists billing_changes_status on billing_changes(status, created_at desc);
alter table billing_changes enable row level security;
revoke all on billing_changes from anon;
grant select, insert on billing_changes to authenticated;
create policy billing_changes_team_select on billing_changes for select to authenticated using (billing_team());
create policy billing_changes_team_insert on billing_changes for insert to authenticated with check (billing_team() and requested_by = lower(coalesce(auth.jwt() ->> 'email', '')));
