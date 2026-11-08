-- CRM: úlohy k leadu (podúlohy v Asane): úvodný e-mail, obhliadka, vlastná úloha. Typ služby na leade pre výber e-mailu. (aplikované 8. 11. 2026)
alter table public.leads add column if not exists service text check (service in ('management','rent_to_rent','other'));
create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('intro_email','viewing','custom')),
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done')),
  asana_gid text,
  payload jsonb not null default '{}'::jsonb,
  created_by text, created_by_name text,
  created_at timestamptz not null default now(),
  done_at timestamptz, done_by text
);
create index if not exists lead_tasks_lead_idx on public.lead_tasks(lead_id, status);
alter table public.lead_tasks enable row level security;
create policy lead_tasks_crm_all on public.lead_tasks for all to authenticated using (has_app_role('crm')) with check (has_app_role('crm'));
