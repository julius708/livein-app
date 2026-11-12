-- Ústredňa: pevný search_path pre funkciu spúšťača (upozornenie bezpečnostného poradcu Supabase). Správanie sa nemení.
-- Aplikované v produkcii (LIVE-IN Core) 12. 11. 2026 ako migrácia `ustredna_search_path`. Návrat: alter function public.hq_events_immutable() reset search_path;
alter function public.hq_events_immutable() set search_path = '';
