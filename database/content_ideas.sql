-- Nápady na obsah: tím rýchlo zapisuje situácie z pracovného dňa, marketingový agent z nich píše scenáre videí.
-- Čítať smie aktívny člen tímu, vkladať vlastné nápady cez RPC, stav meniť cez RPC, pole script zapisuje len service role.
create table if not exists public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid not null,
  author_name text not null,
  title text not null check (length(title) between 2 and 80),
  description text not null check (length(description) between 3 and 2000),
  status text not null default 'new' check (status in ('new','selected','script_done')),
  script text,
  status_changed_by text, status_changed_at timestamptz
);
create index if not exists content_ideas_created on public.content_ideas (created_at desc);
alter table public.content_ideas enable row level security;
do $$ begin
  create policy content_ideas_select on public.content_ideas for select to authenticated
    using (exists (select 1 from public.app_users u where lower(u.email) = lower(auth.jwt()->>'email') and u.active));
  create policy content_ideas_insert on public.content_ideas for insert to authenticated
    with check (author_id = auth.uid() and exists (select 1 from public.app_users u where lower(u.email) = lower(auth.jwt()->>'email') and u.active));
exception when duplicate_object then null; end $$;
grant select, insert on public.content_ideas to authenticated;

create or replace function public.add_content_idea(p_title text, p_description text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  select name into v_name from public.app_users where lower(email) = lower(auth.jwt()->>'email') and active;
  if v_name is null then raise exception 'len aktívny člen tímu'; end if;
  insert into public.content_ideas (author_id, author_name, title, description)
  values (auth.uid(), v_name, left(trim(p_title), 80), left(trim(p_description), 2000)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_content_idea_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from public.app_users where lower(email) = lower(auth.jwt()->>'email') and active;
  if v_name is null then raise exception 'len aktívny člen tímu'; end if;
  if p_status not in ('new','selected','script_done') then raise exception 'neznámy stav'; end if;
  update public.content_ideas set status = p_status, status_changed_by = v_name, status_changed_at = now() where id = p_id;
end $$;
