-- Údržba v super appke: zoznam opráv, ktorý si tím dopĺňa a uzatvára sám.
-- Čítať a zapisovať môže každý aktívny člen tímu (app_users.active), zápis len cez RPC.

create table if not exists public.maintenance_issues (
  id uuid primary key default gen_random_uuid(),
  listing_id text,
  listing_name text not null,
  text text not null check (length(text) between 3 and 500),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  status text not null default 'open' check (status in ('open', 'done')),
  created_by text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  done_by text,
  done_by_name text,
  done_at timestamptz
);
create index if not exists maintenance_issues_open on public.maintenance_issues (status, created_at desc);

alter table public.maintenance_issues enable row level security;
drop policy if exists maintenance_issues_select on public.maintenance_issues;
create policy maintenance_issues_select on public.maintenance_issues for select to authenticated
  using (exists (select 1 from public.app_users u where lower(u.email) = lower(auth.jwt() ->> 'email') and u.active));
revoke all on public.maintenance_issues from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.maintenance_issues from authenticated;
grant select on public.maintenance_issues to authenticated;

create or replace function public.add_maintenance_issue(p_listing_id text, p_listing_name text, p_text text, p_priority text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(auth.jwt() ->> 'email'); v_name text; v_listing_name text; v_id uuid;
begin
  select name into v_name from public.app_users where lower(email) = v_email and active;
  if v_name is null then raise exception 'len aktívny člen tímu'; end if;
  if p_listing_id is not null and p_listing_id <> '' then
    select coalesce(title, name) into v_listing_name from public.listings where guesty_id = p_listing_id;
    if v_listing_name is null then raise exception 'neznámy byt'; end if;
  else
    v_listing_name := left(coalesce(p_listing_name, ''), 120);
    if length(v_listing_name) < 2 then raise exception 'chýba miesto'; end if;
  end if;
  insert into public.maintenance_issues (listing_id, listing_name, text, priority, created_by, created_by_name)
  values (nullif(p_listing_id, ''), v_listing_name, left(coalesce(p_text, ''), 500), case when p_priority = 'high' then 'high' else 'normal' end, v_email, v_name)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.close_maintenance_issue(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(auth.jwt() ->> 'email'); v_name text; v_n int;
begin
  select name into v_name from public.app_users where lower(email) = v_email and active;
  if v_name is null then raise exception 'len aktívny člen tímu'; end if;
  update public.maintenance_issues set status = 'done', done_by = v_email, done_by_name = v_name, done_at = now()
  where id = p_id and status = 'open';
  get diagnostics v_n = row_count;
  return jsonb_build_object('closed', v_n);
end $$;

-- Dáta pre kartu Údržba: aktívne byty a potvrdené rezervácie na 21 dní, pre každého aktívneho člena tímu
-- (tabuľky listings/reservations majú RLS podľa rolí Práčovne, preto security definer).
create or replace function public.maintenance_data()
returns jsonb language sql security definer set search_path = public stable as $$
  with me as (select 1 from public.app_users where lower(email) = lower(auth.jwt() ->> 'email') and active),
  d as (select (now() at time zone 'Europe/Bratislava')::date as today)
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'today', (select today from d),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object('guesty_id', guesty_id, 'name', name, 'title', title, 'city', city) order by coalesce(title, name)), '[]'::jsonb)
                 from public.listings where active),
    'reservations', (select coalesce(jsonb_agg(jsonb_build_object('listing_id', r.listing_id, 'check_in_date', r.check_in_date, 'check_out_date', r.check_out_date)), '[]'::jsonb)
                     from public.reservations r, d where r.status = 'confirmed' and r.check_out_date > d.today and r.check_in_date <= d.today + 21)
  ) end;
$$;

revoke execute on function public.add_maintenance_issue(text, text, text, text) from public, anon;
revoke execute on function public.close_maintenance_issue(uuid) from public, anon;
revoke execute on function public.maintenance_data() from public, anon;
grant execute on function public.add_maintenance_issue(text, text, text, text) to authenticated;
grant execute on function public.close_maintenance_issue(uuid) to authenticated;
grant execute on function public.maintenance_data() to authenticated;
