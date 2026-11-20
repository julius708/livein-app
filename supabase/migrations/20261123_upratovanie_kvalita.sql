-- Upratovanie: kvalita po každom hosťovi. Recenzie hostí (zapisuje manažérka), párovanie recenzie s rezerváciou a s upratovaním pred príchodom,
-- rozšírený report (checklist, fotky, recenzia) a obdobie od-do. Aditívne: jedna nová tabuľka, nové funkcie, rozšírenie cl_report_data.

create table if not exists public.cl_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  reservation_code text,
  check_in date not null,
  check_out date,
  source text not null default 'other' check (source in ('airbnb', 'booking', 'google', 'direct', 'other')),
  rating numeric(2, 1) not null check (rating between 1 and 5),
  cleanliness numeric(2, 1) check (cleanliness is null or cleanliness between 1 and 5),
  text text not null default '' check (char_length(text) <= 2000),
  created_by text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists cl_reviews_listing on public.cl_reviews (listing_id, check_in);
alter table public.cl_reviews enable row level security;
revoke all on public.cl_reviews from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.cl_reviews from authenticated;
grant select on public.cl_reviews to authenticated;
do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cl_reviews' and policyname = 'cl_reviews_select') then
    create policy cl_reviews_select on public.cl_reviews for select to authenticated using (public.cl_is_manager() and removed_at is null);
  end if;
end $do$;

-- zápis recenzie: s kódom rezervácie sa byt a dátumy doplnia z rezervácie, inak treba byt a dátum príchodu
create or replace function public.cl_add_review(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  code text := nullif(btrim(coalesce(p ->> 'reservation_code', '')), '');
  lid text := nullif(btrim(coalesce(p ->> 'listing_id', '')), '');
  ci date := nullif(p ->> 'check_in', '')::date;
  co date := nullif(p ->> 'check_out', '')::date;
  rt numeric := nullif(p ->> 'rating', '')::numeric;
  cl numeric := nullif(p ->> 'cleanliness', '')::numeric;
  src text := coalesce(nullif(p ->> 'source', ''), 'other');
  r record;
  rid uuid;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if rt is null or rt < 1 or rt > 5 or (cl is not null and (cl < 1 or cl > 5)) or src not in ('airbnb', 'booking', 'google', 'direct', 'other') then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  if code is not null then
    select * into r from public.reservations where confirmation_code = code order by (status = 'confirmed') desc limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'status', 'no_reservation');
    end if;
    lid := r.listing_id; ci := r.check_in_date; co := r.check_out_date;
  end if;
  if lid is null or ci is null then
    return jsonb_build_object('ok', false, 'status', 'bad_input');
  end if;
  insert into public.cl_reviews (listing_id, reservation_code, check_in, check_out, source, rating, cleanliness, text, created_by)
  values (lid, code, ci, co, src, rt, cl, left(coalesce(p ->> 'text', ''), 2000), public.cl_email()) returning id into rid;
  perform public.cl_log(null, 'review_added', jsonb_build_object('listing_id', lid, 'rating', rt));
  return jsonb_build_object('ok', true, 'id', rid);
end $fn$;

create or replace function public.cl_remove_review(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.cl_reviews set removed_at = now() where id = p_id and removed_at is null;
  return jsonb_build_object('ok', true);
end $fn$;

-- kvalita po návštevách: rezervácie s príchodom v období + upratovanie pred príchodom + recenzie; recenzie bez rezervácie zvlášť
create or replace function public.cl_quality(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  visits jsonb;
  orphans jsonb;
begin
  if not public.cl_is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    return jsonb_build_object('ok', false, 'status', 'bad_range');
  end if;
  select coalesce(jsonb_agg(v order by (v ->> 'check_in') desc, v ->> 'flat'), '[]'::jsonb) into visits from (
    select jsonb_build_object(
      'reservation', r.guesty_id, 'code', r.confirmation_code, 'listing_id', r.listing_id, 'flat', coalesce(l.name, r.listing_id),
      'check_in', r.check_in_date, 'check_out', r.check_out_date, 'guests', r.guests, 'source', r.source,
      'cleaning', (
        select jsonb_build_object(
          'task_id', t.id, 'date', t.date, 'status', t.status, 'cleaner', coalesce(s.name, t.cleaner_email), 'started_at', t.started_at, 'finished_at', t.finished_at,
          'problem', t.problem_text, 'note', t.cleaner_note,
          'items_total', (select count(*) from public.cl_checklist_items i where i.task_id = t.id),
          'items_done', (select count(*) from public.cl_checklist_items i where i.task_id = t.id and i.done),
          'photos_before', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'before'),
          'photos_after', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'after'),
          'photos_issue', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'issue'))
        from public.cl_tasks t left join public.cl_staff s on s.email = t.cleaner_email
        where t.listing_id = r.listing_id and t.status <> 'cancelled' and t.date <= r.check_in_date and t.date >= r.check_in_date - 10
        order by t.date desc, (t.status = 'done') desc limit 1),
      'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', rv.id, 'rating', rv.rating, 'cleanliness', rv.cleanliness, 'text', rv.text, 'source', rv.source, 'created_at', rv.created_at))
        from public.cl_reviews rv where rv.removed_at is null and ((rv.reservation_code is not null and rv.reservation_code = r.confirmation_code) or (rv.reservation_code is null and rv.listing_id = r.listing_id and rv.check_in = r.check_in_date))), '[]'::jsonb)
    ) as v
    from public.reservations r left join public.listings l on l.guesty_id = r.listing_id
    where r.status = 'confirmed' and r.check_in_date between p_from and p_to
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', rv.id, 'listing_id', rv.listing_id, 'flat', coalesce(l.name, rv.listing_id), 'check_in', rv.check_in, 'rating', rv.rating, 'cleanliness', rv.cleanliness, 'text', rv.text, 'source', rv.source,
      'cleaning', (select jsonb_build_object('task_id', t.id, 'date', t.date, 'status', t.status, 'cleaner', coalesce(s.name, t.cleaner_email), 'problem', t.problem_text,
          'items_total', (select count(*) from public.cl_checklist_items i where i.task_id = t.id), 'items_done', (select count(*) from public.cl_checklist_items i where i.task_id = t.id and i.done),
          'photos_before', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'before'), 'photos_after', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'after'))
        from public.cl_tasks t left join public.cl_staff s on s.email = t.cleaner_email
        where t.listing_id = rv.listing_id and t.status <> 'cancelled' and t.date <= rv.check_in and t.date >= rv.check_in - 10 order by t.date desc, (t.status = 'done') desc limit 1)
    ) order by rv.check_in desc), '[]'::jsonb) into orphans
    from public.cl_reviews rv left join public.listings l on l.guesty_id = rv.listing_id
   where rv.removed_at is null and rv.check_in between p_from and p_to
     and not exists (select 1 from public.reservations r where r.status = 'confirmed' and ((rv.reservation_code is not null and r.confirmation_code = rv.reservation_code) or (rv.reservation_code is null and r.listing_id = rv.listing_id and r.check_in_date = rv.check_in)));
  return jsonb_build_object('ok', true, 'visits', visits, 'orphans', orphans);
end $fn$;

-- report: obdobie až 400 dní, k úlohe pribudol checklist, počty fotiek a recenzia hosťa, ktorý po upratovaní prišiel
create or replace function public.cl_report_data(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not (public.cl_is_manager() or public.has_app_role('bot') or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    return jsonb_build_object('ok', false, 'status', 'bad_range');
  end if;
  return jsonb_build_object(
    'ok', true,
    'tasks', coalesce((select jsonb_agg((to_jsonb(t) - 'snapshot') || jsonb_build_object(
        'items_total', (select count(*) from public.cl_checklist_items i where i.task_id = t.id),
        'items_done', (select count(*) from public.cl_checklist_items i where i.task_id = t.id and i.done),
        'photos_before', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'before'),
        'photos_after', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'after'),
        'photos_issue', (select count(*) from public.cl_photos ph where ph.task_id = t.id and ph.kind = 'issue'),
        'review_rating', (select rv.rating from public.cl_reviews rv where rv.removed_at is null and rv.listing_id = t.listing_id and rv.check_in >= t.date and rv.check_in <= t.date + 10 order by rv.check_in limit 1),
        'review_text', (select left(rv.text, 300) from public.cl_reviews rv where rv.removed_at is null and rv.listing_id = t.listing_id and rv.check_in >= t.date and rv.check_in <= t.date + 10 order by rv.check_in limit 1)))
      from public.cl_tasks t where t.date between p_from and p_to and t.status <> 'cancelled'), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('email', s.email, 'name', s.name, 'role', s.role, 'pay_type', s.pay_type, 'hourly_rate_cents', s.hourly_rate_cents, 'task_rate_cents', s.task_rate_cents)) from public.cl_staff s), '[]'::jsonb),
    'flats', coalesce((select jsonb_agg(jsonb_build_object('listing_id', f.listing_id, 'listing_name', f.listing_name, 'pay_cents', f.pay_cents, 'est_minutes', f.est_minutes)) from public.cl_flats f), '[]'::jsonb),
    'recipients', coalesce(public.cl_setting('report') -> 'recipients', '[]'::jsonb),
    'sent', exists (select 1 from public.cl_events e where e.event = 'report_sent' and e.data ->> 'month' = to_char(p_from, 'YYYY-MM'))
  );
end $fn$;

do $do$
declare
  f text;
begin
  foreach f in array array['cl_add_review(jsonb)', 'cl_remove_review(uuid)', 'cl_quality(date, date)', 'cl_report_data(date, date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $do$;
