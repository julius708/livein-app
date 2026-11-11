# Investičné nehnuteľnosti a kupujúci (`/investicie`)

Pre obchodný tím (rola `crm`: Zuzana, Patrik, Július). Admin navyše vidí **Agent a nastavenia**.
Tok: agent nájde ponuku → uloží sa → kalkulačka LIVE-IN ju vyráta → systém ju páruje s dopytmi klientov → Zuzka skontroluje → pripraví klientsku ponuku (kontroluje a odosiela človek).

## Obrazovky
- `/investicie/prehlad`: nové zhody, zmeny, zamietnuté ponuky na opätovné posúdenie, už nedostupné, úlohy, duplicity, dopyty na potvrdenie aktuálnosti.
- `/investicie`: zoznam nehnuteľností (filtre, triedenie), pridanie odkazom alebo formulárom.
- `/investicie/n/<id>`: detail (výpočet s pôvodom vstupov, scenáre, zdroje, história ceny a zmien, zhody, úlohy, úprava, stav, potvrdenie dostupnosti, návrh zlúčenia).
- `/investicie/dopyty`, `/investicie/dopyt/<id>`: dopyty; vhodné ponuky s dôvodom, alternatívy mimo podmienok, zamietnuté, nedostupné, porovnanie a príprava ponuky.
- `/investicie/porovnanie?q=<dopyt>&ids=a,b`: porovnanie vedľa seba.
- `/investicie/ponuka/<id>`: kontrola klientskej ponuky a klientsky náhľad.
- `/investicie/agent` (admin): stav agenta, história behov, zdroje, plán, kritériá výhodnosti, import pilotu.
- CRM: v detaile kontaktu sekcia **Investičné dopyty** (vytvára len ďalší dopyt k existujúcemu kontaktu).

## Pravidlá, ktoré systém dodržiava
- Chýbajúci údaj je **neznámy**, nikdy nula. Neúplná ponuka je „predbežná“ a „aspoň X €“.
- Inzerát na portáli ≠ dostupnosť potvrdená predajcom (samostatný stav a dátum). Zmiznutý inzerát = „stiahnuté“, nikdy automaticky „predané“.
- Výpadok, blokovanie (403/429) alebo čiastočné načítanie zdroja nezmení stav žiadnej ponuky.
- Rozpočet: „200 000 €“ sa za celkovú investíciu berie len ak to Zuzka tak určí; inak je rozpočet „neznámy“. Prekročenie povinného rozpočtu = „mimo podmienok“ (samostatná skupina, nie vysoké skóre). Pri úvere sa osobitne posudzuje celková investícia a potrebné vlastné zdroje.
- Výhodnosť (firemné prahy), zhoda s klientom a kvalita/aktuálnosť podkladov sú tri oddelené veci. Prahy nie sú nastavené, preto stav „čaká na nastavenie kritérií“.
- Marketingový súhlas sa nemení; do HubSpotu ide len poznámka k existujúcemu kontaktu.

## Kalkulačka (`lib/inv-calc.js`)
Základ webovej kalkulačky LIVE-IN (správa 17 %, DPH 5 %, Guesty 50 €/mes., upratovanie na pobyt, 30-dňový mesiac, ceny z portfólia a PriceLabs k 8. 11. 2026 v `lib/inv-benchmarks.js`) + celková investícia (cena, povinné parkovanie, provízia, právne, rekonštrukcia, zariadenie, sprevádzkovanie, rezerva; bez dvojitého započítania), 3 scenáre, bod zvratu, hypotéka (splátka, úrok, istina, nulový úrok, neznáma sadzba), dlhodobý prenájom. Nová verzia výpočtu vzniká len pri zmene vstupov (odtlačok); klientska ponuka si drží snímok.
Pozor: poplatky portálov sú predvolene 0 %; ak cena za noc ešte nie je znížená o províziu portálu, výsledok je nadhodnotený (upozornenie je vo výpočte).

## Agent na pozadí
- Vercel cron `/api/cron/invest-run` každých 30 min; sám rozhodne, či je čas (predvolene denne od 07:00 Europe/Bratislava, interval a čas v nastaveniach; opakovanie po chybe 60 min, najviac 3 pokusy, pokračuje od nedokončených zdrojov). Zámok `inv_acquire_lock` proti súbežným behom. `?force=1` (s CRON_SECRET) a tlačidlo **Spustiť teraz** spustia hneď.
- Kroky: zdroje → normalizácia a duplicity → uloženie → overenie cien a stavu už evidovaných ponúk (404/410 dvakrát = odstránený) → výpočty → párovanie → jeden prehľad na osobu.
- Zdroje (`inv_sources`): `feed` (JSON/RSS s mapovaním polí, voliteľne `search_template` pre cielené hľadanie), `url` (zoznam odkazov: JSON-LD/OpenGraph), `ingest` (externý agent). Rešpektuje robots.txt, limit rýchlosti, pri blokovaní označí zdroj.
- Automatické hľadanie sa v appke označí „aktívne“ až po skutočnom úspešnom behu so zdrojom.

## Ingest API pre externých agentov
`POST /api/invest/ingest`, `Authorization: Bearer $INVEST_INGEST_SECRET`, JSON:
```json
{ "source_key": "agent-x", "source_name": "Agent X", "complete": false,
  "items": [{ "external_id": "123", "url": "https://…", "city": "Bratislava", "district": "Staré Mesto", "address": "Dunajská 12",
              "rooms": 3, "area_interior": 62, "area_exterior": 6, "floor": 3, "price": 150000, "checked_at": "2026-11-12T08:00:00Z",
              "prov": { "price": { "kind": "source", "ref": "inzerát" } } }] }
```
Najviac 200 položiek. Rovnaký `source_key` + `external_id` aktualizuje ten istý záznam. Neúplné položky sa odmietnu s dôvodom. `complete: true` = úplný prehľad aktívnych inzerátov zdroja (len vtedy sa chýbajúce po 2 kontrolách označia ako odstránené).
Odpoveď: `{ ok, summary, items:[{ external_id, status: created|updated|merged|invalid|error, property_id }] }`.

## Ukážka, predvoľba a vyhľadávanie na internete
- **Ukážkové dáta** (`lib/inv-demo.js`): tlačidlo v `/investicie` (admin) vytvorí fiktívne nehnuteľnosti, troch fiktívnych klientov „[UKÁŽKA] …“ (kontakty s `origin='demo'`, nie sú leady), dopyty, zhody, rozhodnutia, úlohu a návrh ponuky. Nikomu sa neposielajú upozornenia. „Odstrániť ukážkové dáta“ zmaže len ukážku.
- **Predvoľba Lazaretská 15** (`lib/inv-presets.js`): cena za noc okolo 98 €, portály 15 %, správa 17 %, DPH 5 %, upratovanie 25 €, energie 200 €/mes., zariadenie 15 000 € (ilustračne), scenáre 90/60, 98/70, 105/75. Kritérium výnosu 5 % je ukážkové, nie schválené.
- **Vyhľadávanie na internete (AI)** (`lib/inv-websearch.js`): zdroj `web-search` (kind `feed`, `config.engine = 'web_search'`). AI s webovým vyhľadávaním nájde aktuálne inzeráty podľa filtrov firmy a aktívnych dopytov; každý odkaz sa overí na stránke inzerátu (JSON-LD/OpenGraph, robots.txt). Mŕtve odkazy sa zahodia, neoverené údaje sú označené ako predpoklad. Vyžaduje `ANTHROPIC_API_KEY` vo Verceli.

## Konfigurácia
Nová premenná: `INVEST_INGEST_SECRET` (ingest API; bez nej vracia 503). Existujúce: `CRON_SECRET`, `SUPABASE_*`, voliteľne `ANTHROPIC_API_KEY` (AI úvod ponuky; čísla sú vždy z kódu, AI text s číslom mimo adresy sa zahodí).
Migrácia: `supabase/migrations/20261112_investicie.sql` (len nové tabuľky `inv_*`, RLS na rolu `crm`; nastavenia a zdroje píše admin; behy agenta server).

## Návrat späť
Kód: revert merge commitu. Dáta: tabuľky `inv_*` sú samostatné (`drop table inv_… cascade`), nič existujúce sa nemení. Cron `/api/cron/invest-run` zmizne s revertom `vercel.json`.

## Čo zatiaľ nie je hotové
Prechod „odovzdané do správy“ je len stav dopytu (bez automatického založenia úlohy v Zaradení bytov / Asane); import starého pilotu je pripravený podľa všeobecného JSON (pôvodný súbor nebol dostupný); zdroje ponúk sa musia nakonfigurovať (žiadny nie je predvyplnený); porovnávacie dáta Guesty/PriceLabs pre nový byt sú z webovej kalkulačky (snímka), nie živé.
