-- Spoločný záznam udalostí (kto, čo, kedy) a schránka upozornení pre všetky moduly.
-- Iba pridáva nové tabuľky a funkcie; existujúce tabuľky, role ani prístupy sa nemenia.

create table if not exists public.core_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text not null,
  module text not null,
  event text not null,
  subject_type text,
  subject_id text,
  data jsonb not null default '{}'::jsonb
);
create index if not exists core_events_at on public.core_events (at desc);
create index if not exists core_events_actor on public.core_events (actor_email, at desc);
create index if not exists core_events_subject on public.core_events (subject_type, subject_id, at desc);

create table if not exists public.core_inbox (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  to_email text not null,
  from_email text,
  module text not null,
  kind text not null default 'info',
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  constraint core_inbox_title_len check (char_length(title) between 1 and 200),
  constraint core_inbox_body_len check (body is null or char_length(body) <= 2000),
  constraint core_inbox_href_rel check (href is null or href ~ '^/[^/\\]')
);
create index if not exists core_inbox_to on public.core_inbox (to_email, read_at, at desc);

alter table public.core_events enable row level security;
alter table public.core_inbox enable row level security;

revoke all on public.core_events, public.core_inbox from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.core_events, public.core_inbox from authenticated;
grant select on public.core_events, public.core_inbox to authenticated;

drop policy if exists core_events_select on public.core_events;
create policy core_events_select on public.core_events for select to authenticated
  using (public.is_app_admin() or actor_email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists core_inbox_select on public.core_inbox;
create policy core_inbox_select on public.core_inbox for select to authenticated
  using (to_email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Zápis udalosti: autor je vždy prihlásený používateľ, nedá sa podvrhnúť.
create or replace function public.core_log(p_module text, p_event text, p_subject_type text default null, p_subject_id text default null, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'status', 'no_user'); end if;
  if coalesce(p_module, '') = '' or coalesce(p_event, '') = '' or char_length(p_module) > 40 or char_length(p_event) > 80 then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if not exists (select 1 from public.app_users u where lower(u.email) = v_email and u.active) then
    return jsonb_build_object('ok', false, 'status', 'inactive');
  end if;
  insert into public.core_events (actor_email, module, event, subject_type, subject_id, data)
  values (v_email, p_module, p_event, left(p_subject_type, 60), left(p_subject_id, 120), coalesce(p_data, '{}'::jsonb));
  return jsonb_build_object('ok', true);
end $fn$;

-- Odoslanie správy do schránky: len aktívnemu používateľovi appky, s limitom proti zahlteniu.
create or replace function public.core_notify(p_to text, p_module text, p_title text, p_body text default null, p_href text default null, p_kind text default 'info')
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_from text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_to text := lower(coalesce(p_to, ''));
  v_kind text := case when p_kind in ('info', 'task', 'alert', 'mention') then p_kind else 'info' end;
begin
  if v_from = '' then return jsonb_build_object('ok', false, 'status', 'no_user'); end if;
  if not exists (select 1 from public.app_users u where lower(u.email) = v_from and u.active) then
    return jsonb_build_object('ok', false, 'status', 'inactive');
  end if;
  if not exists (select 1 from public.app_users u where lower(u.email) = v_to and u.active) then
    return jsonb_build_object('ok', false, 'status', 'no_user');
  end if;
  if coalesce(trim(p_title), '') = '' or char_length(p_title) > 200 or char_length(coalesce(p_body, '')) > 2000
     or coalesce(p_module, '') = '' or char_length(p_module) > 40
     or (p_href is not null and p_href !~ '^/[^/\\]') then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if (select count(*) from public.core_inbox where from_email = v_from and at > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('ok', false, 'status', 'too_many');
  end if;
  insert into public.core_inbox (to_email, from_email, module, kind, title, body, href)
  values (v_to, v_from, p_module, v_kind, trim(p_title), nullif(trim(coalesce(p_body, '')), ''), p_href);
  insert into public.core_events (actor_email, module, event, subject_type, subject_id, data)
  values (v_from, p_module, 'inbox.sent', 'user', v_to, jsonb_build_object('title', left(p_title, 120), 'kind', v_kind));
  return jsonb_build_object('ok', true);
end $fn$;

-- Označenie ako prečítané: iba vlastné správy (p_ids = null => všetky moje).
create or replace function public.core_inbox_read(p_ids bigint[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v_n int;
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'status', 'no_user'); end if;
  update public.core_inbox set read_at = now()
   where to_email = v_email and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'n', v_n);
end $fn$;

revoke execute on function public.core_log(text, text, text, text, jsonb) from public, anon;
revoke execute on function public.core_notify(text, text, text, text, text, text) from public, anon;
revoke execute on function public.core_inbox_read(bigint[]) from public, anon;
grant execute on function public.core_log(text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.core_notify(text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.core_inbox_read(bigint[]) to authenticated, service_role;
