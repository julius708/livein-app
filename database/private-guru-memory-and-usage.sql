-- Additive schema: private Guru history and content-free application usage.
create table public.guru_turns (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 role_scope text[] not null default public.current_app_roles(),
 question text not null check(length(question) between 1 and 4000),
 answer text check(length(answer)<=30000),
 status text not null default 'pending' check(status in ('pending','complete','error')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 search_document tsvector generated always as (to_tsvector('simple',question || ' ' || coalesce(answer,''))) stored
);
create index guru_turns_owner_time on public.guru_turns(user_id,created_at desc,id);
create index guru_turns_search on public.guru_turns using gin(search_document);
alter table public.guru_turns enable row level security;
revoke all on public.guru_turns from public,anon,authenticated;
grant select,insert,update,delete on public.guru_turns to authenticated;
grant all on public.guru_turns to service_role;
create policy guru_own_read on public.guru_turns for select to authenticated using (
 user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0
 and role_scope <@ (select public.current_app_roles())
);
create policy guru_own_insert on public.guru_turns for insert to authenticated with check (
 user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0
 and role_scope <@ (select public.current_app_roles()) and role_scope @> (select public.current_app_roles())
);
create policy guru_own_update on public.guru_turns for update to authenticated using (
 user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0 and role_scope <@ (select public.current_app_roles())
) with check (user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0 and role_scope <@ (select public.current_app_roles()));
create policy guru_own_delete on public.guru_turns for delete to authenticated using (user_id=(select auth.uid()));

create table public.app_usage_daily (
 user_id uuid default auth.uid() references auth.users(id) on delete cascade,
 actor_key text generated always as (coalesce(user_id::text,'shared')) stored,
 app text not null check(app in ('app','pracovna','cs','ring','ekonomika')),
 page text not null check(page ~ '^[a-z_]{1,32}$'),
 day date not null default (now() at time zone 'Europe/Bratislava')::date,
 views integer not null default 1 check(views>0),
 last_seen timestamptz not null default now(),
 primary key(actor_key,app,page,day)
);
create index app_usage_daily_day on public.app_usage_daily(day);
alter table public.app_usage_daily enable row level security;
revoke all on public.app_usage_daily from public,anon,authenticated;
grant select,insert,update on public.app_usage_daily to authenticated;
grant all on public.app_usage_daily to service_role;
create policy usage_read on public.app_usage_daily for select to authenticated using (
 (user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0) or (select public.is_app_admin())
);
create policy usage_insert on public.app_usage_daily for insert to authenticated with check (
 user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0
);
create policy usage_update on public.app_usage_daily for update to authenticated using (
 user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0
) with check (user_id=(select auth.uid()) and cardinality((select public.current_app_roles()))>0);
create function public.record_app_usage(app_key text,page_key text) returns void
language sql security invoker set search_path='' as $$
 insert into public.app_usage_daily(user_id,app,page) values(auth.uid(),app_key,page_key)
 on conflict(actor_key,app,page,day) do update set views=public.app_usage_daily.views+1,last_seen=now();
$$;
revoke all on function public.record_app_usage(text,text) from public,anon;
grant execute on function public.record_app_usage(text,text) to authenticated;

-- Deleting one's memory also removes turns hidden after a role change.
create schema if not exists private;
grant usage on schema private to authenticated;
create function private.erase_own_guru_memory() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(cardinality(public.current_app_roles()),0)=0 then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 delete from public.guru_turns where user_id=auth.uid();
end;
$$;
revoke all on function private.erase_own_guru_memory() from public,anon;
grant execute on function private.erase_own_guru_memory() to authenticated;
create function public.erase_own_guru_memory() returns void
language sql security invoker set search_path='' as $$
 select private.erase_own_guru_memory();
$$;
revoke all on function public.erase_own_guru_memory() from public,anon;
grant execute on function public.erase_own_guru_memory() to authenticated;
grant execute on function public.record_app_usage(text,text) to service_role;

-- Admin-only summary: operational events, never conversation contents or guest details.
create function private.livein_activity_events() returns jsonb
language plpgsql security definer set search_path='' as $$
declare activity_summary jsonb;
begin
 if not coalesce(public.is_app_admin(),false) then raise exception 'Admin required' using errcode='42501'; end if;
 select jsonb_build_object(
  'usage_total',(select coalesce(sum(views),0) from public.app_usage_daily where day>=(now() at time zone 'Europe/Bratislava')::date-29),
  'active_users',(select count(distinct user_id) from public.app_usage_daily where day>=(now() at time zone 'Europe/Bratislava')::date-29),
  'usage_apps',coalesce((select jsonb_agg(to_jsonb(a)) from (select app,sum(views) views,count(distinct user_id) people,max(last_seen) last from public.app_usage_daily where day>=(now() at time zone 'Europe/Bratislava')::date-29 group by app) a),'[]'::jsonb),
  'usage_days',coalesce((select jsonb_agg(to_jsonb(a)) from (select day,sum(views) views from public.app_usage_daily where day>=(now() at time zone 'Europe/Bratislava')::date-29 group by day order by day) a),'[]'::jsonb),
  'recent_usage',coalesce((select jsonb_agg(to_jsonb(a)) from (select u.app,u.page,u.last_seen,case when u.user_id is null then 'Zdieľaný prístup' else coalesce(p.display_name,'Prihlásený účet') end actor from public.app_usage_daily u left join public.profiles p on p.id=u.user_id where u.day>=(now() at time zone 'Europe/Bratislava')::date-29 order by u.last_seen desc limit 30) a),'[]'::jsonb),
  'packing_count',(select count(*) from public.package_events where created_at>=now()-interval '30 days'),
  'cs_count',(select count(*) from cs.audit_log where at>=now()-interval '30 days'),
  'ring_count',(select count(*) from public.ring_log where at>=now()-interval '30 days'),
  'recent',coalesce((select jsonb_agg(to_jsonb(e)) from (
   select * from (
    (select 'pracovna'::text app,created_at at,coalesce(actor_name,'Neurčený používateľ') actor,event::text action from public.package_events where created_at>=now()-interval '30 days' order by created_at desc limit 20)
    union all
    (select 'cs',a.at,coalesce(s.name,'Systém'),a.action::text from cs.audit_log a left join cs.staff s on s.id=a.staff_id where a.at>=now()-interval '30 days' order by a.at desc limit 20)
    union all
    (select 'ring',at,'Zdieľaný prístup',result::text from public.ring_log where at>=now()-interval '30 days' order by at desc limit 20)
   ) x order by at desc limit 20
  ) e),'[]'::jsonb)
 ) into activity_summary;
 return activity_summary;
end;
$$;
revoke all on function private.livein_activity_events() from public,anon;
grant execute on function private.livein_activity_events() to authenticated;
create function public.livein_activity_events() returns jsonb
language sql security invoker set search_path='' as $$ select private.livein_activity_events(); $$;
revoke all on function public.livein_activity_events() from public,anon;
grant execute on function public.livein_activity_events() to authenticated;
