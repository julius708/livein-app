-- Investície: prístup majú aj admini bez roly CRM (Martina, Viliam, Nina). Mení len podmienky existujúcich politík (ALTER POLICY), nič sa nemaže.
do $$ declare t text; begin
  foreach t in array array['inv_properties','inv_listings','inv_price_history','inv_events','inv_calcs','inv_merge_candidates','inv_inquiries','inv_matches','inv_tasks','inv_offers'] loop
    execute format('alter policy %I on %I using (has_app_role(''crm'') or is_app_admin()) with check (has_app_role(''crm'') or is_app_admin())', t || '_crm_all', t);
  end loop;
end $$;
alter policy inv_runs_crm_select on inv_runs using (has_app_role('crm') or is_app_admin());
alter policy inv_settings_crm_select on inv_settings using (has_app_role('crm') or is_app_admin());
alter policy inv_sources_crm_select on inv_sources using (has_app_role('crm') or is_app_admin());
