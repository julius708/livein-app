-- kb_import_docs: zdroj dokumentu z poľa 'source' (Sprievodca, dokumentácia, schéma), inak Asana ako doteraz (aplikované 9. 11. 2026)
CREATE OR REPLACE FUNCTION public.kb_import_docs(p_secret text, p_docs jsonb, p_prefix text DEFAULT 'asana/portfolio/'::text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cs', 'extensions' AS $function$
declare n int := 0; d jsonb; v_hash text;
begin
  select value #>> '{}' into v_hash from public.config where key = 'kb_import_secret_hash';
  if v_hash is null or encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex') <> v_hash then raise exception 'not allowed' using errcode = '42501'; end if;
  for d in select * from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) loop
    if (d->>'path') is null or left(d->>'path', length(p_prefix)) <> p_prefix then continue; end if;
    insert into cs.kb_docs (path, title, content, source, updated_at, status, tags)
    values (d->>'path', left(d->>'title', 200), d->>'content', coalesce(nullif(d->>'source',''), 'Asana · Portfolio & SOPs'), coalesce(nullif(d->>'updated_at','')::timestamptz, now()), 'schvalene', coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(d->'tags','[]'::jsonb)) x), '{}'))
    on conflict (path) do update set title = excluded.title, content = excluded.content, source = excluded.source, updated_at = excluded.updated_at, tags = excluded.tags, status = 'schvalene';
    n := n + 1;
  end loop;
  return n;
end $function$;
