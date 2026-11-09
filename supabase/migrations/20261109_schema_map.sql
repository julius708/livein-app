-- Mapa databázy pre znalostnú bázu Guru (aplikované 9. 11. 2026): tabuľky a stĺpce schémy public, len servisná rola alebo aktívny používateľ
create or replace function public.schema_map()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.role() = 'service_role' or public.is_active_user()
    then coalesce((select jsonb_agg(jsonb_build_object('table_name', t.table_name, 'cols', t.cols) order by t.table_name)
      from (select c.table_name, string_agg(c.column_name || ' ' || c.data_type, ', ' order by c.ordinal_position) as cols
            from information_schema.columns c where c.table_schema = 'public' group by c.table_name) t), '[]'::jsonb)
    else '[]'::jsonb end
$$;
revoke all on function public.schema_map() from public;
grant execute on function public.schema_map() to authenticated, service_role;
