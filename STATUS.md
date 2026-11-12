## 13. 11. 2026 – Ústredňa: Obsidian, mapa firmy, paleta príkazov, hlas, živé obnovovanie, nový vzhľad (vetva `claude/ustredna-wow`, ešte nenasadené)
- Obsidian: index tímového trezoru Live-in International (názvy, štítky, prepojenia; bez textu poznámok) ako interaktívna mapa a vyhľadávanie; poznámky sa otvárajú v Obsidiane. Lokálne sa číta z disku, v produkcii cez `tools/ustredna/vault-sync.mjs` do `hq_vault` (migrácia `20261115_ustredna_vault` zatiaľ NEaplikovaná).
- Nové ovládanie: paleta príkazov (⌘K), hlasové príkazy v prehliadači, brífing priorít, tabuľa úloh, obnovovanie každú minútu, grafy (príchody a odchody, kanály, mestá, cesta leadu), denný a nočný režim.
- Guesty je „naživo“ s časom posledného hodinového prepočtu čísel z rezervácií (`home_numbers.updated_at`).

## 12. 11. 2026 (noc) – Ústredňa: živé údaje z existujúcich modulov a opravy po kontrole Codexu (vetva `claude/ustredna-zdroje`)
- Ústredňa číta rezervácie a obsadenosť, údržbu, Asanu (škody), CRM a obhliadky, stav synchronizácie HubSpotu, investície, obsah, newsletter a vyúčtovanie z existujúcich tabuliek a funkcií appky (`lib/hq-live.js`). Len čítanie; žiadne nové prepojenia ani premenné.
- Opravené dva nálezy nezávislej kontroly Codexu: opakovanie s rovnakým kľúčom je duplicita len pri úplnej zhode obsahu (F1) a register `hq_actors` platí aj pre zabudovaných agentov (F2).
- Stále nepripojené: čítanie pošty, WhatsApp, Google Calendar, výkon videí, vlastné prepojenie PriceLabs.

## 12. 11. 2026 (noc) – Doladenie vzhľadu hlavnej appky (vetva `claude/vzhlad-appky`)
- Nový `app/polish.css` (načítaný ako posledný): skupiny nástrojov na domove v dvoch vyrovnaných radoch, popis nástroja na dva riadky, záložky Správy ako pilulky, pásik nad plávajúcou hlavičkou už nepresvitá, kotvy neskáču pod hlavičku. Len CSS, žiadna zmena funkcií.

## 12. 11. 2026 (noc) – Ústredňa: spoločný register práce ľudí a AI agentov (vetva `claude/ustredna-register`, ešte nenasadené)
- Nový modul `/ustredna` (admin) v schválenom dizajne: zadanie, prevzatie, krok, blokovanie, výsledok a overenie konkrétnej verzie; API `/api/hq/*` pre Codex a Claude Code s vlastnými tokenmi; nástroj `tools/ustredna/hq.mjs`. Dokumentácia `docs/ustredna/README.md`.
- Migrácia `20261114_ustredna` aplikovaná 12. 11. 2026 (len nové prázdne tabuľky `hq_*`). Nové premenné `HQ_AGENT_TOKENS`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` nenastavené. Middleware: `/api/hq/*` s Bearer tokenom a `/api/hq/slack` si overuje route sama.
- Naživo len lokálne (register v súbore). Slack #ai-tim a Asana overené jednou označenou skúškou cez konektory relácie, nie zo servera. Ostatné oblasti ústredne sú v navigácii ako nepripojené.

## 12. 11. 2026 (večer) – Investície: ukážka, Lazaretská 15, vyhľadávanie na internete
- Tlačidlá v `/investicie` (admin): ukážkové dáta (fiktívne), nastavenie kalkulačky podľa Lazaretskej 15, zapnutie AI vyhľadávania na internete; návod na vyskúšanie na stránke.
- Agent má nový zdroj `web-search` (AI + overenie na stránke inzerátu). Živý beh s kľúčom Anthropic ešte neoverený.

## 12. 11. 2026 – Investičné nehnuteľnosti a kupujúci (vetva `feature/investicie`, ešte nenasadené)
- Nový modul `/investicie` (rola CRM): databáza ponúk, kalkulačka LIVE-IN, párovanie s dopytmi z CRM, agent na pozadí (cron, zámok, opakovanie), ingest API, návrh klientskej ponuky. Dokumentácia `docs/investicie/README.md`.
- Migrácia `20261112_investicie` zatiaľ NEaplikovaná v produkcii. Nová premenná `INVEST_INGEST_SECRET`. Middleware: otvorená cesta `/api/invest/ingest` (vlastný Bearer token).

## 11. 11. 2026 – Vyúčtovanie majiteľom
- Nový modul `/vyuctovanie` (admin, asistentka, operácie): tabuľka po bytoch, úprava priamo v riadku, filtre, stavy, firma bytu, medzisúčty častí (Modrá guľa, Dicer), kalkulačka prádla, nový mesiac, export do Excelu. Dokumentácia `docs/vyuctovanie/README.md`.
- Migrácia `20261111_vyuctovanie` aplikovaná; október 2026 naimportovaný (239 riadkov, súčet 9 399,96 € sedí). Fáza 2 (Asana, Gmail, editor cenníka) zatiaľ len návrh.

## 10. 11. 2026 – Guesty Reservations V3
- Guesty ruší staré `/v1/reservations` + staré webhooky **1. 3. 2027**. Hlavná appka (overenie hosťa), Ring (odkazy na vstup aj Ekonomika) a CS (založenie rezervácie) prepnuté na V3; Práčovňa už V3 mala. Podrobnosti `docs/guesty-migration.md`.
- PriceLabs webhook ostáva na starých udalostiach (ich zodpovednosť) – skontrolovať v januári 2027.



## 9. 11. 2026 (večer)
- Kľúče `/kluce`: kiosk (len logo + ozubené koliesko), pozície z Usporiadania kľúčov Práčovne (čísla bez písmen, 87 bytov + 14 ručných položiek), nastavenia (pridať kľúč, pozícia, sady, vyradiť), história, liquid glass, responzívne.
- Údržba: dlaždica na domove, pilot zapnutý v test režime (povolená adresa: Július). Tím môže testovať celý tok; správy idú len na povolené adresy, objednávky sa evidujú.
- Guru: tvár vyplní guličku; rovnaký widget v CS, Práčovni, Ringu a Zaradení (bez pozdravu, hlas vypnutý, gulička). Skryť Guru sa dá len v hlavnej appke (inde nie je kde ho zapnúť späť).
