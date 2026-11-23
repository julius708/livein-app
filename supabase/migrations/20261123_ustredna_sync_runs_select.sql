-- Ústredňa: admini appky (app_users.roles obsahuje 'admin') smú čítať záznam synchronizácií (časy a chyby behov).
-- Doteraz ho smel čítať len is_admin() z tabuľky profiles (modul Práčovňa), preto ústredňa nevidela čas obnovy znalostnej bázy.
-- Aplikované v produkcii 23. 11. 2026 so súhlasom Júliusa.
-- Návrat: drop policy sync_runs_select_app_admin on public.sync_runs;
create policy sync_runs_select_app_admin on public.sync_runs
  for select to authenticated
  using (public.is_app_admin());
