-- Spoločná pamäť Gurua: otázky a odpovede celého tímu (bez mien), v rozsahu oprávnení aktuálneho používateľa
-- (rovnaké pravidlo ako RLS na guru_turns: role_scope záznamu musí byť podmnožinou rolí používateľa).
create or replace function public.guru_team_memory(q text default '', n int default 8)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('question', question, 'answer', left(answer, 1500), 'date', created_at::date) order by created_at desc), '[]'::jsonb)
  from (
    select t.question, t.answer, t.created_at
    from public.guru_turns t
    where t.status = 'complete' and t.answer is not null
      and cardinality(public.current_app_roles()) > 0
      and t.role_scope <@ public.current_app_roles()
      and (coalesce(btrim(q), '') = '' or t.search_document @@ websearch_to_tsquery('simple', q))
    order by t.created_at desc
    limit greatest(1, least(coalesce(n, 8), 12))
  ) x
$$;
revoke all on function public.guru_team_memory(text, int) from public;
grant execute on function public.guru_team_memory(text, int) to authenticated;
