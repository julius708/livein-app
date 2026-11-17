# Vyúčtovanie majiteľom (`/vyuctovanie`)

Mesačná pracovná tabuľka nákladov, ktoré znova fakturujeme majiteľom bytov. Termín: 15. v mesiaci za predchádzajúci mesiac.
Dostupné pre roly `admin`, `assistant`, `operations` (zmena: `BILLING_ROLES` v `lib/billing-core.js` a funkcia `billing_team()` v migrácii).

## Dáta (Supabase LIVE-IN Core, migrácia `supabase/migrations/20261111_vyuctovanie.sql`)
- `billing_periods` – obdobie (prvý deň mesiaca, `open` / `closed`).
- `billing_items` – riadky (byt, časť, kategória, položka, ks, cena, suma, stav, poznámka, „Zistiť od“, Asana, fotky, firma, typ nový/existujúci). `legacy_id` = pôvodné `_id` z importu.
- `price_list` – cenník bežných položiek; pri „Novom mesiaci“ sa z neho vytvoria riadky „Cenník (bežná cena)“.
- RLS: len `billing_team()`; anon nemá nič.
- Stav, firma a typ sú text s CHECK (nie enum), aby fungoval dynamický stav „Pravdepodobne <mesiac>“.

## Kód
- `lib/billing-core.js` – čistá logika (sumy v centoch, stavy, skupiny, medzisúčty častí, firma bytu, nový mesiac, kalkulačka prádla, dáta exportu). Pokryté `tests/billing.test.mjs`.
- `lib/xlsx-lite.js` – zapisovač XLSX bez závislostí (`tests/xlsx-lite.test.mjs`).
- `lib/billing-server.js`, `app/vyuctovanie/actions.js` – čítanie a zápis (kontrola roly, uzavreté obdobie sa nedá meniť).
- `app/vyuctovanie/page.js`, `components/vyuctovanie/Board.js`, `app/vyuctovanie/vyuctovanie.css` – obrazovka.
- `app/vyuctovanie/export/route.js` – `GET /vyuctovanie/export?m=RRRR-MM` → `Vyuctovanie_<mesiac>_<rok>.xlsx` (hárky „Prehľad“ a „Položky po bytoch“).

## Pravidlá
- Do súčtu sa nepočíta: Neúčtovať, Cenník (bežná cena), Nepriradené k bytu, Pravdepodobne …
- Firma bytu: výslovne zvolená → tag listingu v Guesty → zoznam z prototypu → „Firma nezistená“. Zmena firmy na karte platí pre celý byt.
- Košické byty (KE) sa nezobrazujú ani neexportujú.
- Nový mesiac: riadky „Pravdepodobne <nový mesiac>“ sa **presunú** do nového obdobia (stav „Suma OK“ / „Doplniť sumu“) a pribudne cenník.
- Kalkulačka prádla (Horeca s DPH po zľave): sada A/B/C na lôžko + 3 predložky na kúpeľňu − čo mal majiteľ. Sumy prepočítava server.

## Import
Obdobie 2026-10: 239 riadkov z `Vyuctovanie_oktober_2026_zaloha.json` 1:1, kontrola md5 po skupinách. Dáta majiteľov nie sú v repozitári.

## Fáza 2 (zatiaľ len návrh)
Úlohy do Asany od udrzba@live-in.international, onboardingová úloha, sekcia v Účtovníctve, štítky v Gmaile, adresa → byt cez `guru.v_listings` / `guide_cards`, editor cenníka, odoslanie PDF dokladov Simone.

## Chat Pomocník
Plávajúce tlačidlo „💬 Pomocník“ vo Vyúčtovaní (`components/vyuctovanie/ChatPanel.js`, logika `lib/billing-chat.js`, operácie `lib/billing-ops.js`).
- Odpovedá o tabuľke (vie v nej hľadať) a **navrhuje** zmeny dát: pridať, upraviť, presunúť, zmazať riadok, firma bytu, cenník. Zmeny sa vykonajú až po potvrdení tlačidlom a znova sa overia na serveri tými istými pravidlami ako úprava v tabuľke (uzavreté obdobie, košické byty, čísla).
- Zmenu **funkcie** (nový stĺpec, pravidlo, výpočet, vzhľad) chat nespraví okamžite: zapíše ju ako požiadavku do spätnej väzby (`feedback`, strana /vyuctovanie) aj s kontextom rozhovoru a vývojár ju dopracuje.
- Vyžaduje `ANTHROPIC_API_KEY` vo Verceli. Chat kód aplikácie nemení.

## Návrhy zmien kódu z chatu (schválenie jedným klikom)
Pri požiadavke na zmenu funkcie v chate je tlačidlo „Pripraviť návrh zmeny kódu“. Postup (`lib/code-change.js`, záložka „Zmeny kódu“ v okne Pomocníka):
1. AI v obmedzenom okruhu súborov modulu Vyúčtovanie (`isAllowedPath`: `lib/billing-*`, `components/vyuctovanie/*` okrem chatu, `app/vyuctovanie/*`, testy, dokumentácia) pripraví zmenu a otvorí **pull request** na GitHube. Autentifikácia, middleware, databáza, iné moduly a samotný chat sú mimo okruhu. Zmena databázy sa neimplementuje (AI to len ohlási).
2. GitHub Actions (`.github/workflows/ci.yml`) spustia testy a build, Vercel pripraví náhľad.
3. Schvaľovateľ (admin s rolou „Schvaľovateľ zmien kódu“) vidí zhrnutie, zoznam súborov (citlivé zvýraznené), riziká, stav testov a náhľadu. Tlačidlo **Schváliť a nasadiť** sa odomkne až pri zelených testoch aj náhľade. Pri schválení server znova overí oprávnenie, že PR obsahuje len povolené súbory a že commit je ten, ktorý schvaľovateľ videl; potom zlúči (squash) a Vercel nasadí.
4. **Vrátiť späť** pripraví revert PR, ktorý prejde rovnakým schvaľovaním. **Zamietnuť** zatvorí PR a zmaže vetvu.

Zapnutie: vo Verceli `GH_CHANGES_TOKEN` (fine-grained token na repozitár `julius708/livein-app`: Contents a Pull requests = Read and write; Metadata, Commit statuses a Checks = Read) a `ANTHROPIC_API_KEY`; migrácia `supabase/migrations/20261117_billing_changes.sql`; v Správe appky pridať schvaľovateľovi rolu „Schvaľovateľ zmien kódu“. Bez tokenu je funkcia vypnutá a požiadavky idú len ako spätná väzba. Cron `/api/cron/billing-changes` (5 min) dokončí čakajúce návrhy a obnovuje stav.
