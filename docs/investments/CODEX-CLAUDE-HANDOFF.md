# LIVE-IN investície — spoločné odovzdanie Codex a Claude Code

Július 11.11.2026 výslovne zadal denné hľadanie, aktualizáciu ceny a dostupnosti, upozornenie na výhodné byty a pravidelné dodávanie do apky v spolupráci s Claude Code. Následne spresnil: **hlavným produktom je krátkodobý prenájom v správe LIVE-IN. Dlhodobý prenájom slúži na porovnanie.** Klienti môžu hľadať investičnú kúpu alebo už vlastniť byt na odovzdanie do STR správy; zachovajte oba vstupy CRM.

## Rozdelenie práce

- Codex: denný výskum o 07:30 Europe/Bratislava, stavové dávky so stabilnými ID, zmeny cien a dostupnosti, zdroje a prepočty. Aktuálne 7 pracovných kandidátov, bez potvrdenia predajcom.
- Claude Code: interný investičný modul, DB a oprávnenia, overená verzia kalkulačky, rozhranie pre autentifikovaný import, párovanie a porovnanie STR/LTR v CRM, klientsky návrh na ľudskú kontrolu.
- Vlastník integrácie potvrdí v GitHub diskusii alebo príslušnom Slack vlákne: prevzatie, endpoint, verziu kontraktu, spôsob bezpečného nastavenia tokenu, výsledok testu, ID prijatej dávky a nasadený commit. Tajomstvá neposielajte v komentároch. Samotná správa ani PR nie sú dôkaz prevzatia alebo nasadenia.

## Rozhranie navrhnuté pre prijímač

`POST https://app.live-in.international/api/investments/import`

Tento endpoint **zatiaľ neexistuje ani nie je overený**. Implementujte ho v rámci vznikajúceho investičného modulu. Použite projektové serverové autentifikačné konvencie a osobitný importný token uložený iba v schválenom úložisku. Server musí validovať aj zdrojové údaje, dĺžky, domény/odkazy a číselné limity; neveriť importovaným flagom. Pred akýmkoľvek serverovým načítaním zdrojovej URL blokovať interné siete a presmerovania do nich. Žiadne vzdialené URL netreba načítavať na dokončenie importu.

Telo `livein-investment-feed-1` generuje `tools/investments/feed.mjs`. Rozhranie je návrh kontraktu, nie hotový server. Dávka obsahuje `batch_id`, `checked_on`, `digest`, `primary_strategy` a `listings`. Každý byt má `external_id`, zdrojové ID/URL, čas kontroly, dostupnosť, nullable údaje a tri STR i LTR scenáre. SHA-256 `digest` sa počíta z JSON bez poľa digest so zachovaním poradia kľúčov producenta; prijímač overí hash odstránením digest a serializáciou parsovaného objektu bez preusporiadania. Sémantický import identifikujte aj stabilným `external_id`; opakovaná dávka nesmie vytvárať duplicity ani opakovať notifikácie. Doplňte ďalšie zdroje k rovnakej jednotke až po overení totožnosti.

Server spracuje dávku transakčne. Idempotency-Key je digest. Starší source_checked_on nesmie prepísať novšie pozorovanie. Zmenu výpočtu verziovať; obchodný stav a potvrdenie človekom zachovať. Neprítomnosť bytu v dávke neznamená predaj ani zmazanie. Importovaný sensitivity-only model nemožno schváliť ako overený odhad, a to ani vtedy, keď import nastaví location_adr_verified=true. Výpočet na serveri zopakovať overenou kalkulačkou a pripnúť verziu metodiky; prenesené výsledky označiť ako podklady.

Po úplnom prijatí vrátiť HTTP 200:

```json
{"status":"accepted","batch_id":"ID dávky","digest":"presný digest","accepted_external_ids":["všetky prijaté ID"],"receipt_id":"trvalé ID potvrdenia"}
```

Pri chybe nepoužiť úspešné potvrdenie; opakovanie sa deduplikuje. Producent nedôveruje samotnému HTTP 200: vyžaduje zhodu digestu, batch_id a úplného zoznamu ID. Vie pripraviť frontu bez tokenu. `integration.json` zostáva disabled, kým prijímač neprejde testom. Potvrdenie HTTP prijatia nie je dôkaz zobrazenia v CRM; overiť aj opätovné čítanie a UI.

## Výpočty a hodnotenie

Hlavné zoradenie: podložený čistý výnos STR a konzervatívne cashflow, vhodnosť jednotky a lokality pre krátkodobé ubytovanie, kvalita dôkazov a klientsky dopyt. V porovnaní uviesť STR/LTR tržby, náklady, čistý výsledok, výnos z celkovej investície, rozdiel EUR aj percentuálnych bodov. Pri úvere oddeliť výsledok prevádzky od cashflow po splátkach.

Pracovné scenáre ADR 55/65/75 EUR a obsadenosti 60/72,5/80 % v prvom balíku sú iba citlivosť. Nejde o overené lokálne odhady. Potrebujeme porovnateľné lokálne jednotky, sezónnosť a doložené zmluvné sadzby LIVE-IN. Daňový režim a báza príjmov/platformových provízií sa musia potvrdiť. Nevydávať predpoklad za zistený údaj. Prah výhodnosti je konfigurovateľný; používateľ ho zatiaľ nepotvrdil. Neodosielať klientom automaticky.

## Zdroj dát a súkromie

Lokálny pracovný priečinok producenta: `/Users/juliushonsch/Documents/Codex/2026-11-11/pozri-sa-mi-pros-m-a/outputs/investment-feed/`. Aktuálne dáta: `latest-research.json`, očistený prenos `latest-feed.json`, čakanie `queue/`, potvrdenia `receipts/`. Zoznam a kontext je na https://chatgpt.com/space/page_40f01e5b47b88191a846349b4bf20464 podľa udelených prístupov.

Repozitár je verejný. Sem nepatria kontakty kupujúcich, tokeny, surové rezervácie ani interné reálne výkony portfólia. Tento PR obsahuje iba kód, kontrakt a syntetické testy. Skutočné dávky importovať priamo do autorizovanej apky alebo odovzdať cez interný tímový kanál. Ak Claude pracuje vzdialene, lokálne cesty nie sú automaticky dostupné.

## Overenie

`node --test tests/investment-feed.test.mjs`

Príprava dávky bez publikovania:

`node tools/investments/feed.mjs research.json output-directory`

V produkcii sa nič nemení týmto PR. Žiadna migrácia ani frontend sa tu neskrýva; Claude Code musí doplniť prijímač a modul v nadväzujúcej implementácii a preukázať celý tok.
