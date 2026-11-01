# APP changelog – dodatok 2026-11-01

## Nápady na obsah (verzia 1)
- Nová dlaždica „💡 Nápady na obsah“ na domovskej stránke (celý tím) a stránka `/napady`.
- Rýchly zápis: Názov + Popis situácie (bežné textové pole, diktovanie z klávesnice telefónu), autor sa dosadí z prihláseného používateľa v databáze.
- Zoznam kariet najnovšie hore, hľadanie, filtre podľa stavu s počítadlom.
- Stav jedným klikom: Nový / Vybraný / Scenár hotový.
- Pole Scenár len na čítanie (zapisuje marketingový agent cez service role) s tlačidlom Kopírovať.
- Vzhľad podľa dizajnu appky (intro blok, sklené karty, animácie).

## Dáta (aditívne)
- Tabuľka `public.content_ideas` (id, created_at, author_id, author_name, title, description, status, script, status_changed_by, status_changed_at), RLS: čítanie aktívny člen tímu, vkladanie vlastných, zmena stavu cez `set_content_idea_status`, vkladanie cez `add_content_idea`, `script` len service role.
- SQL: `database/content_ideas.sql`.

## Súbory
`lib/modules.js`, `app/napady/page.js`, `app/napady/actions.js`, `app/napady/napady.css`, `components/IdeasBoard.js`, `components/Shell.js` (len názov v drobkovej navigácii), `database/content_ideas.sql`.

## Verzia 2 (zatiaľ nie)
Žetóny tém, fotka/video k nápadu, reakcia „🎬 Toto natočme“, rebríček, odznaky, oznam pri zmene na video, týždenná výzva, „Pridať bez mena“, hlasovka s prepisom.
