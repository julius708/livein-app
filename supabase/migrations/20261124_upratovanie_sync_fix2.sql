-- Oprava cl_sync_tasks č. 2: keď sa balík v Práčovni presunie na iný deň (zmena rezervácie), jeho stará úloha ostala naviazaná na rovnaký balík
-- a nová úloha narazila na jedinečný kľúč package_id (chyba 23505). Staré naviazanie sa teraz pred vložením zruší.
create or replace function public.cl_sync_tasks(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  n_new int := 0;
  n_upd int := 0;
  n_cancel int := 0;
begin
  if not (public.cl_is_manager() or public.cl_is_cleaner()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return jsonb_build_object('ok', false, 'status', 'bad_range');
  end if;

  insert into public.cl_flats (listing_id, listing_name, address, city, lat, lng)
  select distinct on (l.guesty_id) l.guesty_id, l.name, coalesce(gu.address, gc.address), coalesce(gu.city, l.city), gc.lat, gc.lng
    from public.listings l
    left join public.guide_units gu on gu.listing_id = l.guesty_id
    left join public.guide_cards gc on gc.listing_id = l.guesty_id
   where l.in_scope
  on conflict (listing_id) do update set
    listing_name = excluded.listing_name,
    address = coalesce(excluded.address, public.cl_flats.address),
    city = coalesce(excluded.city, public.cl_flats.city),
    lat = coalesce(excluded.lat, public.cl_flats.lat),
    lng = coalesce(excluded.lng, public.cl_flats.lng);

  -- balík sa v Práčovni presunul na iný byt alebo deň: starú úlohu od neho odpojíme (nezačatá sa zruší nižšie), nová sa naviaže na balík
  with picked as (
    select distinct on (p.listing_id, p.date) p.id, p.listing_id, p.date
      from public.packages p
     where p.date between p_from and p_to and p.status <> 'cancelled' and not p.hidden
     order by p.listing_id, p.date, (p.status = 'packed') desc, p.updated_at desc, p.id
  )
  update public.cl_tasks t set package_id = null, updated_at = now()
    from picked k
   where t.package_id = k.id and (t.listing_id, t.date) is distinct from (k.listing_id, k.date);

  with src as (
    select distinct on (p.listing_id, p.date) p.id, p.listing_id, p.listing_name, p.date, p.target_people, p.computed_items, p.note
      from public.packages p
     where p.date between p_from and p_to and p.status <> 'cancelled' and not p.hidden
     order by p.listing_id, p.date, (p.status = 'packed') desc, p.updated_at desc, p.id
  ), ins as (
    insert into public.cl_tasks (listing_id, listing_name, date, package_id, people, snapshot, pack_note)
    select s.listing_id, s.listing_name, s.date, s.id, s.target_people, s.computed_items, nullif(s.note, '') from src s
    on conflict (listing_id, date) do update set
      package_id = excluded.package_id,
      listing_name = excluded.listing_name,
      people = excluded.people,
      snapshot = excluded.snapshot,
      pack_note = excluded.pack_note,
      manual = false,
      updated_at = now()
     where public.cl_tasks.status = 'todo' and (public.cl_tasks.snapshot is distinct from excluded.snapshot or public.cl_tasks.people is distinct from excluded.people or public.cl_tasks.pack_note is distinct from excluded.pack_note or public.cl_tasks.manual)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_new, n_upd from ins;

  update public.cl_tasks t set status = 'cancelled', updated_at = now()
   where t.date between p_from and p_to and t.status = 'todo' and not t.manual
     and not exists (select 1 from public.packages p where p.listing_id = t.listing_id and p.date = t.date and p.status <> 'cancelled' and not p.hidden);
  get diagnostics n_cancel = row_count;

  return jsonb_build_object('ok', true, 'new', n_new, 'updated', n_upd, 'cancelled', n_cancel);
end $fn$;

grant execute on function public.cl_sync_tasks(date, date) to authenticated, service_role;

grant execute on function public.cl_sync_tasks(date, date) to authenticated, service_role;
