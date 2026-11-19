-- Upratovanie: vstup do bytu sa preberá zo Sprievodcu bytom (rovnaký text ako pre hosťa), nevypisuje sa znova.
-- Funkcia vráti text príchodu a parkovania len pre byty, kde je prihlásená upratovačka priradená k nedávnej alebo budúcej úlohe (alebo je manažérka).
-- Čisto čítacia funkcia; žiadna zmena tabuliek.
create or replace function public.cl_entry_info(p_listings text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  res jsonb;
begin
  if not (public.cl_is_manager() or public.cl_is_cleaner()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_listings is null or array_length(p_listings, 1) is null or array_length(p_listings, 1) > 200 then
    return jsonb_build_object('ok', true, 'entry', '{}'::jsonb);
  end if;
  select coalesce(jsonb_object_agg(g.listing_id, jsonb_build_object(
           'arrival', nullif(btrim(coalesce(g.arrival ->> 'sk', g.arrival ->> 'en', '')), ''),
           'parking', nullif(btrim(coalesce(g.parking ->> 'sk', g.parking ->> 'en', '')), ''),
           'note', nullif(btrim(coalesce(g.address_note ->> 'sk', g.address_note ->> 'en', '')), ''))), '{}'::jsonb)
    into res
    from public.guide_cards g
   where g.listing_id = any (p_listings)
     and (public.cl_is_manager() or exists (
           select 1 from public.cl_tasks t
            where t.listing_id = g.listing_id and t.cleaner_email = public.cl_email() and t.status <> 'cancelled' and t.date >= current_date - 2));
  return jsonb_build_object('ok', true, 'entry', res);
end $fn$;

revoke execute on function public.cl_entry_info(text[]) from public, anon;
grant execute on function public.cl_entry_info(text[]) to authenticated, service_role;
