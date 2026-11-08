-- Údržba: pilot schvaľovania opráv (prípady, dodávatelia, ponuky, súhlas majiteľa, objednávky, hovory, udalosti, fronta).
-- Všetko je nové (prefix maint_), existujúce tabuľky (maintenance_issues, listings, reservations) sa nemenia.
-- Návrat: docs/udrzba/README.md (sekcia Návrat) – drop tabuliek maint_* a funkcií maint_*.

create or replace function public.maint_team() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select roles && array['admin','operations','customer_service','assistant','bot']::text[] from public.app_users where lower(email)=lower(auth.jwt()->>'email') and active), false)
$$;

create sequence if not exists public.maint_case_seq;
create or replace function public.maint_next_ref() returns text language sql volatile as $$
  select 'U-' || to_char(now() at time zone 'Europe/Bratislava', 'YY') || '-' || lpad(nextval('public.maint_case_seq')::text, 4, '0')
$$;

create table if not exists public.maint_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.maint_settings (key, value) values
 ('pilot', '{"enabled": false, "test_mode": true, "allowed_emails": [], "allowed_phones": [], "notes": "Produkčné hovory, objednávky a správy sú vypnuté, kým prevádzka neschváli pilot."}'),
 ('fee', '{"enabled": false, "amount_eur": 45, "max_minutes": 60, "material_separate": true, "terms_approved": false}'),
 ('reminders', '{"owner_reminder_hours": [4, 24], "owner_escalate_hours": 48, "vendor_backup_hours": 24, "call_retry": {"max_attempts": 3, "spacing_minutes": [60, 240]}}'),
 ('telephony', '{"provider": "test", "agent_version": "v0.1", "inbound_enabled": false}'),
 ('retention', '{"transcripts_days": 90, "recordings_days": 30}')
on conflict (key) do nothing;

create table if not exists public.maint_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  created_by text, created_by_name text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.maint_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  professions text[] not null default '{}',
  locality text,
  brands text[] not null default '{}',
  availability text,
  response_hours integer not null default 24,
  callout_fee numeric(10,2),
  email text, phone text,
  is_primary boolean not null default false,
  backup_of uuid references public.maint_vendors(id),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maint_listing_settings (
  listing_id text primary key,
  approver_name text, approver_email text, approver_phone text,
  routine_limit numeric(10,2) not null default 0,
  emergency_limit numeric(10,2) not null default 0,
  billing_rules jsonb not null default '{}'::jsonb,
  duty_contact text,
  verify_hint text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.maint_cases (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default public.maint_next_ref(),
  listing_id text not null,
  listing_name text,
  category text not null,
  symptoms text not null,
  photos jsonb not null default '[]'::jsonb,
  guest_impact text not null default 'none' check (guest_impact in ('none','limited','blocking')),
  guest_present boolean not null default false,
  severity text not null check (severity in ('emergency','affects_stay','routine','cosmetic')),
  status text not null default 'new',
  handling text check (handling in ('internal_take','needs_specialist')),
  profession text,
  assigned_role text,
  assignee_email text,
  due_at timestamptz,
  urgent_override boolean not null default false,
  urgent_reason text,
  incident_id uuid references public.maint_incidents(id),
  duplicate_of uuid references public.maint_cases(id),
  approver_snapshot jsonb,
  selected_quote_id uuid,
  approval_id uuid,
  order_id uuid,
  asana_gid text,
  source text not null default 'app',
  finance_status text not null default 'open' check (finance_status in ('open','blocked','closed')),
  finance_block_reason text,
  created_by text, created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists maint_cases_status_idx on public.maint_cases(status);
create index if not exists maint_cases_listing_idx on public.maint_cases(listing_id);

create table if not exists public.maint_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.maint_cases(id) on delete cascade,
  vendor_id uuid not null references public.maint_vendors(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  status text not null default 'sent' check (status in ('sent','viewed','offered','declined','expired','cancelled')),
  channel text not null default 'link',
  is_backup boolean not null default false,
  sent_at timestamptz, viewed_at timestamptz, answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.maint_quotes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.maint_cases(id) on delete cascade,
  request_id uuid references public.maint_requests(id),
  vendor_id uuid references public.maint_vendors(id),
  version integer not null default 1,
  kind text not null default 'repair' check (kind in ('repair','replacement')),
  currency text not null default 'EUR',
  items jsonb not null default '[]'::jsonb,
  vat_mode text not null default 'without_vat' check (vat_mode in ('with_vat','without_vat','not_vat_payer')),
  callout numeric(10,2) not null default 0,
  diagnostics numeric(10,2) not null default 0,
  material numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  eta text,
  valid_until date,
  attachments jsonb not null default '[]'::jsonb,
  note text,
  replacement jsonb,
  not_repairable text,
  source text not null default 'link' check (source in ('link','email','ai_draft','manual')),
  draft boolean not null default false,
  confidence numeric(4,3),
  status text not null default 'submitted' check (status in ('submitted','selected','superseded','rejected')),
  created_at timestamptz not null default now(),
  unique (case_id, vendor_id, version)
);

create table if not exists public.maint_approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.maint_cases(id) on delete cascade,
  quote_id uuid not null references public.maint_quotes(id),
  quote_version integer not null,
  quote_total numeric(10,2) not null,
  recipient_email text not null,
  recipient_name text,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','delivered','approved','declined','question','no_response','invalidated','bounced','suppressed')),
  sent_at timestamptz, delivered_at timestamptz, decided_at timestamptz,
  decision_note text,
  email_id text,
  reminder_count integer not null default 0,
  expires_at timestamptz not null,
  created_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists maint_approvals_one_live on public.maint_approvals(case_id) where status in ('pending','sent','delivered','question');

create table if not exists public.maint_orders (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.maint_cases(id) on delete cascade,
  approval_id uuid references public.maint_approvals(id) unique,
  quote_id uuid references public.maint_quotes(id),
  vendor_id uuid references public.maint_vendors(id),
  authorized_by text not null,
  status text not null default 'created' check (status in ('created','scheduled','in_progress','done','cancelled')),
  scheduled_at timestamptz,
  access_shared_to uuid references public.maint_vendors(id),
  access_from timestamptz, access_until timestamptz, access_note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists maint_orders_one_per_case on public.maint_orders(case_id) where status <> 'cancelled';

create table if not exists public.maint_calls (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.maint_cases(id) on delete cascade,
  approval_id uuid references public.maint_approvals(id),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  provider text not null,
  provider_call_id text unique,
  to_phone text,
  status text not null default 'scheduled' check (status in ('scheduled','dialing','answered','voicemail','no_answer','busy','failed','completed','cancelled','unknown')),
  scheduled_at timestamptz, started_at timestamptz, ended_at timestamptz,
  attempts integer not null default 0,
  result text,
  transcript_id uuid,
  agent_version text, lang text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maint_events (
  id bigserial primary key,
  case_id uuid references public.maint_cases(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor text,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists maint_events_case_idx on public.maint_events(case_id, created_at);

create table if not exists public.maint_jobs (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  dedupe_key text unique,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists maint_jobs_due_idx on public.maint_jobs(status, run_after);

create table if not exists public.maint_work_log (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.maint_cases(id) on delete cascade,
  entry_type text not null check (entry_type in ('work','material','receipt','note','fee')),
  minutes integer,
  description text,
  amount numeric(10,2),
  receipt jsonb,
  billed_to text check (billed_to in ('owner','livein','vendor','guest')),
  created_by text, created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.maint_inbound_events (
  id bigserial primary key,
  source text not null,
  external_id text not null,
  signature_ok boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  error text,
  unique (source, external_id)
);

create table if not exists public.maint_call_sessions (
  call_id text primary key,
  direction text not null default 'inbound',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  agent_version text, lang text, topic text,
  caller_hash text,
  outcome text not null default 'unknown' check (outcome in ('unknown','resolved_ai','transferred','transfer_failed','case_created','ended_unresolved','tech_error')),
  related_case uuid references public.maint_cases(id),
  repeat_of text,
  updated_at timestamptz not null default now()
);
create table if not exists public.maint_call_events (
  id bigserial primary key,
  call_id text not null references public.maint_call_sessions(call_id) on delete cascade,
  event text not null check (event in ('ai_started','answer','transfer_requested','transfer_connected','transfer_failed','case_created','resolved_confirmed','ended_unresolved','tech_error')),
  ts timestamptz not null default now(),
  agent_version text, lang text, topic text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique
);

create table if not exists public.maint_transcripts (
  id uuid primary key default gen_random_uuid(),
  call_id text,
  recording_ref text,
  transcript text,
  summary text,
  access_level text not null default 'restricted',
  retention_until date,
  match_status text not null default 'unmatched' check (match_status in ('unmatched','review','matched')),
  matched_case uuid references public.maint_cases(id),
  matched_reservation text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.maint_faq (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('guest','owner')),
  lang text not null default 'sk',
  question text not null,
  answer text not null,
  approved boolean not null default false,
  approved_by text,
  updated_at timestamptz not null default now()
);

-- RLS: tím (admin, operácie, zákaznícky servis, asistentka, bot) číta aj zapisuje; verejné odkazy idú cez servisný účet.
do $$ declare t text; begin
  foreach t in array array['maint_settings','maint_incidents','maint_vendors','maint_listing_settings','maint_cases','maint_requests','maint_quotes','maint_approvals','maint_orders','maint_calls','maint_events','maint_jobs','maint_work_log','maint_inbound_events','maint_call_sessions','maint_call_events','maint_transcripts','maint_faq'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.maint_team()) with check (public.maint_team())', t || '_team_all', t);
  end loop;
end $$;

-- Export pre účtovníctvo a budúcu sekciu Opravy v portáli majiteľa
create or replace view public.maint_owner_repairs_v as
  select c.id, c.ref, c.listing_id, c.listing_name, c.category, c.severity, c.status, c.created_at, c.closed_at,
         q.total as approved_total, q.vat_mode, a.status as approval_status, a.decided_at,
         o.status as order_status, v.name as vendor_name,
         (select coalesce(sum(w.amount),0) from public.maint_work_log w where w.case_id=c.id and w.entry_type in ('material','fee')) as billed_extra,
         c.finance_status
  from public.maint_cases c
  left join public.maint_quotes q on q.id=c.selected_quote_id
  left join public.maint_approvals a on a.id=c.approval_id
  left join public.maint_orders o on o.id=c.order_id
  left join public.maint_vendors v on v.id=o.vendor_id;
