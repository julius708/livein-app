# Upratovanie: appka pre upratovačky a manažérku (vetva `feature/upratovanie`)

Stav: **postavené a otestované, nenasadené.** Migrácia nie je aplikovaná v produkcii, vetva nie je v `main`. Bez migrácie appka beží v ukážkovom režime (vymyslené údaje, nič sa neukladá).

## Čo to je
- **`/upratovanie`** (manažérka upratovania a admin): Plán (týždenná tabuľa upratovačky × dni, nepriradené byty, návrh priradenia podľa adresy), Tím (limity, inštrukcie, lokality, voľné dni, cena práce, prihlášky, prístupy), Kontrola (fotky pred/po, checklist, problémy, vrátenie do práce), Nástenka, Byty (návod na vstup, ďalší checklist, čas, cena bytu), Náklady (týždenný prehľad), Nastavenia (spoločný checklist, povinné fotky „po“).
- **`/uprat`** (upratovačka, inštalovateľná na plochu): Dnes, Týždeň, Nástenka, Ja. Detail bytu: hostia, kapsule, poznámka z Práčovne, návod na vstup, mapa; **„Som v byte, začínam“** → checklist → fotky pred/po/problém → poznámka → **„Hotovo, odchádzam“**.
- **`/uprat/prihlaska`** (verejná): formulár pre nové upratovačky. Schvaľuje manažérka.
- Dlaždice na domove: „Upratovanie: plán a tím“ (admin, operácie), „Moje upratovanie“ (rola `cleaning`).

## Odkiaľ sa berú dáta
- Úlohy vznikajú z **balíkov Práčovne** (`packages`: dátum, hostia, kapsule, poznámka); synchronizácia `cl_sync_tasks` beží pri otvorení obrazovky, je idempotentná, nezačatú úlohu premietne zmenu z Práčovne a zruší, keď balík zmizne. Začatú ani hotovú úlohu nemení.
- Adresy a súradnice bytov zo **Sprievodcu bytom** (`guide_cards`, `guide_units`). Adresu bydliska upratovačky nájde mapová služba OpenStreetMap (alebo ju manažérka zadá ručne).
- Práčovňa vie z `cl_status_for(od, do)`, že je byt uprataný (zobrazenie v Práčovni je samostatný krok, zatiaľ nie je urobený).

## Priraďovanie (čistá funkcia `lib/cl-assign.js`)
Nič nezapisuje, len navrhne; manažérka riadky zmení a potvrdí (`cl_assign_bulk`, všetko alebo nič). Berie do úvahy pre **každú upratovačku zvlášť**: bytov za deň a za týždeň, najďalej km, pracovné dni, voľné dni, uprednostnené lokality, vylúčené byty; plus vzdialenosť od bydliska (alebo od bytu, kde ten deň už upratuje), rotáciu (nedávno tu robila → malá penalizácia) a vyrovnanie záťaže. Dve posuvníky: rotácia a vyrovnanie. Každé priradenie má dôvod po slovensky.

## Cena práce
Na upratovačku: **za upratovanie** (pevná suma) alebo **za hodinu** (čas od „som v byte“ po „hotovo“, max 12 h). Na byt: voliteľná pevná cena (má prednosť pri type „za upratovanie“). Na úlohu: ručná oprava sumy. Súhrn „Náklady“ je orientačný prehľad, nie výplatná páska. Sadzby vidí len manažérka a daná upratovačka (RLS).

## Bezpečnosť
- Všetky zápisy idú cez funkcie v databáze s kontrolou roly (`cl_is_manager`, `cl_is_cleaner`); priamy zápis do tabuliek `cl_*` je zakázaný, čítanie podľa RLS: upratovačka vidí len svoje úlohy, svoje byty a svoj profil, manažérka všetko.
- Fotky v súkromnom úložisku `cleaning-photos` (cesta `<id úlohy>/<súbor>`), zobrazenie cez odkazy platné hodinu. Fotka sa v telefóne zmenší (max 1600 px).
- Návod na vstup do bytu vidí len priradená upratovačka a manažérka.

## Čo treba schváliť pred spustením (vedome nič z toho nie je urobené)
1. **Migrácia `supabase/migrations/20261119_upratovanie.sql`** do produkčnej databázy (LIVE-IN Core). Pridáva len nové tabuľky `cl_*`, funkcie a súkromný bucket; nemení existujúce tabuľky ani roly. Odvolanie: zahodiť tabuľky `cl_*` a funkcie `cl_*`.
2. **`cl_create_account`**: manažérka z appky vytvorí prihlasovací účet upratovačke (rovnaký postup a prvotné heslo s povinnou zmenou ako `admin_reset_password`, heslo sa nikde nezobrazuje). Je to citlivé: dáva manažérke právo zakladať účty, ale len pre e-mail s profilom upratovačky. Ak nechceš, odstránime a účty bude zakladať admin.
3. **Verejná prihláška** (`cl_apply`, volateľná bez prihlásenia): skrytá pasca proti robotom, limity 3 pokusy na e-mail za deň a 30 za hodinu. Alternatíva: prihlášky zbierať mimo appky.
4. **Súkromie adresy bydliska**: pri „Nájsť na mape“ sa text adresy odošle verejnej službe OpenStreetMap (Nominatim). Alternatíva: iba ručné súradnice alebo vlastná geokódovacia služba.
5. Určiť **manažérku upratovania** (profil v tíme s rolou manažérka) a **kto je upratovačka** (prihláška alebo pridanie existujúceho používateľa). Používatelia dostanú existujúcu rolu `cleaning`; zoznam rolí sa nemení.

## Testy
`tests/cl-db.test.mjs` (8 testov na PGlite: RLS, oprávnenia, synchronizácia, priradenie, tok úlohy, správa tímu, cena práce, prihláška, nástenka), `tests/cl-core.test.mjs` (13: dátumy, vzdialenosť, cena, formulár, priraďovanie, geokódovanie), `tests/cl-server.test.mjs` (5). DB test sa preskočí tam, kde nie je PGlite (používa sa z `pracovna/node_modules`).

## Čo ešte nie je (nápady na ďalšie kolo)
Zobrazenie „Upratané“ v Práčovni, push upozornenia pre upratovačky, ručné pridanie úlohy mimo Práčovne, export nákladov do Excelu, trasa medzi bytmi, nahrávanie fotky bez signálu na neskôr, preklady pre upratovačky.
