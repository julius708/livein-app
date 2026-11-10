-- CRM: úprava už napísanej poznámky (len poznámky, rola crm) a dátum absolvovanej obhliadky na leade.
alter table public.leads add column if not exists viewing_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lead_events' and policyname='lead_events_crm_update_note') then
    create policy lead_events_crm_update_note on public.lead_events for update to authenticated
      using (public.has_app_role('crm') and type = 'note') with check (public.has_app_role('crm') and type = 'note');
  end if;
end $$;
