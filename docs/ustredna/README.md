# Ústredňa (`/ustredna`)

Jedno miesto pre vedenie LIVE-IN: kto na čom pracuje (ľudia aj AI agenti), čo je zadané, prevzaté, blokované a hotové.
Prvý rez z 12. 11. 2026 obsahuje spoločný register práce, API pre agentov a obrazovku v schválenom dizajne.
Ostatné oblasti (správy, obhliadky, nehnuteľnosti, marketing, prevádzka, financie, znalosti, hlas) sú v navigácii
s pravdivým stavom „nepripojené“ a odkazom na existujúci modul appky. Ukážkové údaje z návrhu sa nepoužívajú.

Prístup: zatiaľ len admini. Modul je v `lib/modules.js` ako `ustredna`.

## Na telefóne

Ústredňa sa dá mať ako samostatná ikona na ploche telefónu (nie je to appka z obchodu, je to tá istá stránka v režime na celú obrazovku).

- iPhone: otvor `app.live-in.international/ustredna` v Safari, prihlás sa, potom Zdieľať → Pridať na plochu.
- Android: otvor to isté v Chrome, potom ponuka ⋮ → Pridať na plochu alebo Inštalovať aplikáciu.

Ikona sa volá „Ústredňa“ a otvára sa priamo na ústredni. Prihlásenie je rovnaké ako v appke.

## Ako to funguje

Stav každej úlohy je posledná prijatá udalosť. Udalosti sa len pridávajú, nemenia sa ani nemažú.

| Operácia | Stav úlohy | Kto smie |
|---|---|---|
| `assign` zadať | Čaká na prevzatie | admin, agent |
| `accept` prevziať | Prevzaté | len príjemca úlohy |
| `step` ohlásiť krok | Pracuje sa | len príjemca |
| `block` ohlásiť blokovanie | Blokované | len príjemca |
| `result` odovzdať výsledok | Výsledok čaká na kontrolu | len príjemca, s verzovaným dôkazom |
| `verify` overiť verziu | Verzia overená | ktokoľvek s oprávnením okrem autora výsledku |
| `apply` potvrdiť zapracovanie | Zapracované | len integrácia s potvrdením cieľovej služby |

Pravidlá, ktoré stráži `lib/hq-events.js` (pôvodný modul Codexu, `livein-work-event-1`):

- Identitu, workspace a zdroj udalosti určuje server podľa prihlásenia. Z tela požiadavky sa neberú.
- Opakované doručenie (rovnaký `idempotencyKey` a obsah) nevytvorí ďalšiu úlohu ani udalosť.
- Oneskorená alebo súbežná udalosť neprepíše novší stav. Skončí v karanténe (`hq_quarantine`) s dôvodom.
- Výsledok, overenie a zapracovanie sú tri oddelené stavy. Overenie musí uviesť konkrétnu udalosť výsledku a odtlačky (sha256) dôkazov.
- Vlastný výsledok nemôže overiť jeho autor.
- Odkazy na Slack, Asanu a iné zdroje (`refs`, `hq_links`) sú odkazy, nie dôkaz, že sa tam niečo vykonalo.
- Autor správy v Slacku nie je overená identita agenta.

## Živé údaje z existujúcich modulov appky

Ústredňa nič nesynchronizuje sama. Pri každom otvorení číta to, čo appka už má, cez práva prihláseného admina (`lib/hq-live.js`, skladanie v `lib/hq-live-core.js`):

| Oblasť | Čo ukazuje | Odkiaľ |
|---|---|---|
| Prevádzka | príchody, odchody, hostia v bytoch, obsadenosť, dnešné príchody, práčovňa | RPC `home_facts`, `home_dashboard`, `home_work` (zrkadlo Guesty, plní ho Práčovňa) |
| Prevádzka | otvorené prípady údržby, škody v Asane | `maint_cases`; `fetchOpenDamageTasks()` (Asana, medzipamäť 5 min) |
| Obhliadky | najbližšie obhliadky, obhliadky po termíne, leady po lehote | `lead_tasks` (kind `viewing`), `leads` |
| Nehnuteľnosti | leady podľa fázy, investičné ponuky a dopyty | `leads` (presné počty), `inv_properties`, `inv_inquiries` |
| Marketing | nápady na obsah, posledný newsletter | `content_ideas`, `newsletters` |
| Financie | vyúčtovanie majiteľom za aktuálny mesiac, čas aktualizácie Ekonomiky | `billing_*` cez `lib/billing-server.js`, `economics_snapshots.updated_at` |
| Správy | nástenka tímu | `board_notes` |
| Moja pozornosť | signály: leady po lehote, naliehavá údržba, obhliadky bez výsledku, vyúčtovanie bez súm | odvodené z vyššie uvedeného |

Pravidlá: čo sa nepodarí načítať, sa zobrazí ako „–“ a zdroj dostane chybu, nikdy nula. Zdroj je „Naživo“ len s úspešným načítaním alebo časom poslednej synchronizácie
(HubSpot: `config.crm_sync.last_run`). Guesty je „Čiastočne“, lebo zrkadlo neuvádza čas svojej synchronizácie. Guesty ani HubSpot API sa z ústredne priamo nevolajú.

Čo appka nemá, a preto to v ústredni nie je: čítanie firemnej pošty (Gmail, Outlook), WhatsApp, Google Calendar, výkon videí a kampaní, vlastné prepojenie PriceLabs
(jeho údaje sú len vo vnútri podkladu Ekonomiky z Ringu) a správy hostí z Guesty Inboxu.

## Obsidian a mapa firmy

Tímový trezor **Live-in International** je v ústredni ako mapa a vyhľadávanie. Do ústredne ide len index: názov, cesta, štítky, odkazy medzi poznámkami,
čas zmeny a počet slov. Text poznámok ostáva v Obsidiane; kliknutie na poznámku ju otvorí cez `obsidian://` na zariadení, kde je trezor.
Osobná pamäť (`Pamat/`) a súkromné priečinky sa neindexujú (`VAULT_SKIP` v `lib/hq-vault.js`).

- **Lokálne** (mimo produkcie, `HQ_VAULT_PATH=<cesta k trezoru>`): server číta trezor priamo z disku, mapa je vždy aktuálna.
- **V produkcii** server k súborom na počítači nevidí. Index posiela skript z počítača s trezorom do tabuľky `hq_vault` (migrácia `20261115_ustredna_vault`, aplikovaná 13. 11. 2026). Skript potrebuje token agenta (`HQ_AGENT_TOKENS` na serveri); prihlásený admin môže index poslať aj zo svojho prehliadača:

```sh
node tools/ustredna/vault-sync.mjs --vault "<cesta k trezoru>" --name "Live-in International" --env <súbor s HQ_URL a HQ_TOKEN>
node tools/ustredna/vault-sync.mjs --vault "<cesta k trezoru>" --stats     # len počty, nič sa neposiela
```

  Stav zdroja „Obsidian“ ukazuje čas poslednej synchronizácie; po 48 hodinách bez synchronizácie je „neaktuálne“.

**Mapa** (`components/ustredna/Graph.js`, bez knižníc) spája firemnú vrstvu (ústredňa → oblasti → zdroje, ľudia a agenti → úlohy; `lib/hq-graph.js`)
s grafom trezoru (poznámky a ich odkazy, priečinky ako krúžky; `vaultGraph`). Uzly sa dajú ťahať, mapa posúvať a približovať, hľadanie uzol vycentruje,
skupiny sa dajú skrývať, dvojklik uzol otvorí (úlohu, človeka, oblasť alebo poznámku v Obsidiane).

## Agenti: zoznam rolí z dôkazov

Oblasť **Ľudia a agenti** ukazuje každú rolu (A1…, P1…, serverové a GPT roly) a pri nej, čo sa o nej naozaj vie. Zapnutý rozvrh nie je dôkaz práce.

- Dôkazy: rozvrhy (automatizácie GPT/Codex, cloudové rutiny Claude), výstupy (súbory rolí na disku), hlásenia v Slacku #ai-tim a zápisy v Braine (`Agenti/<ID>/` v trezore; podpriečinok `Claude/` sú zápisy Claude).
- Stavy (`lib/hq-agents.js`): **Dodáva** = výstup za posledné 3 dni; **Beží podľa rozvrhu** = zapnutý rozvrh a v tom istom prostredí výstup do 14 dní; **Rozvrh beží, výstup nevidno**; **Ticho**; **Len v registri**. Stav sa počíta k času zberu; prehľad starší ako 36 hodín je označený.
- Zápisy v Braine berie ústredňa z indexu trezoru (už je v databáze). Rozvrhy, výstupy a Slack posiela zberný skript:

```bash
node tools/ustredna/agents-sync.mjs --outputs "<Disk>/Live-in/Vystupy_agentov" --codex ~/.codex \
  --codex-out "<priečinok Codexu>" --codex-register "<REGISTER.json>" \
  --claude "<uložený zoznam rutín Claude>" --slack slack.json --asks asks.json --stats   # alebo --out / --env
```

  Skript číta len metadáta (názvy a stav rozvrhov, čas posledného behu, počty a časy súborov). Zadania agentov ani obsah súborov nečíta a neposiela.
  Zoznam rutín Claude, súhrn Slacku (`slack.json`) a otázky rolí (`asks.json`) pripraví relácia Claude cez svoje konektory; skript sám do Slacku ani do cloudu Claude nevidí.
- Prehľad sa ukladá ako riadok `agents` v tabuľke `hq_vault` (`POST /api/hq/agents`, admin alebo agent so schopnosťou `work`); nová tabuľka netreba. Server ho pred uložením očistí (`sanitizeAgents`).
- **Otázky rolí na vedenie** (`asks`) sa zobrazia v „Moja pozornosť“ a na prehľade ako „Agent čaká na teba“. Je to tvrdenie roly z jej hlásenia, nie overený fakt. Tlačidlo **Rozhodnúť** predvyplní zadanie s menom roly; odpoveď sa zapíše do registra pod menom prihláseného človeka.
- **Doručenie agentom**: kým server nemá `SLACK_BOT_TOKEN`, detail úlohy ponúka „Skopírovať správu pre Slack“ (so značkou `hq:<úloha>#<poradie>`) a odkaz na #ai-tim. S tokenom posiela ústredňa udalosti do #ai-tim sama.
- Register práce (zadania a výsledky) ostáva oddelený: zapisovať doň vedia len vykonávatelia s identitou (Claude Code, Codex, ľudia).

Stav 13. 11. 2026: nasadené v produkcii (`main` `b43993d`), prvý prehľad agentov nahraný cez prihlásený prehliadač (33 rolí v prehľade, 29 rozvrhov; so zápismi v Braine 48 rolí). Prehľad sa sám neobnovuje, kým server nemá `HQ_AGENT_TOKENS`; po 36 hodinách ho obrazovka označí ako starý.
Meno roly sa berie z Brainu (nadpis `Agenti/<ID>/00_Index.md`); meno z prehľadu sa použije len tam, kde ho Brain nemá.

## Prehľad pre vedenie

Úvod ukazuje: výnosy mesiaca (len účtu s prístupom do Ekonomiky), noci oproti vlaňajšku, portfólio oproti cieľu, nové leady za 7 dní, čo čaká na rozhodnutie, dnešnú prevádzku, obchod, rast a AI tím. Čo sa nenačíta, je „–“.
Priamy odkaz na oblasť: `/ustredna?o=agents` (vykreslí server) alebo `/ustredna#agents`.

## Ovládanie

- **Paleta príkazov** `⌘K` (alebo `/`): hľadá úlohy, ľudí, oblasti, moduly appky, signály a poznámky z Obsidianu; obsahuje aj akcie (zadať úlohu, brífing, obnoviť, režim).
  Veta, ktorá nie je výsledok hľadania, sa po Enter vyloží ako príkaz (`lib/hq-voice.js`).
- **Hlas**: tlačidlo mikrofónu. Reč rozpoznáva prehliadač (Web Speech API; Chrome posiela zvuk Googlu), ústredňa dostane len hotový text.
  Príkazy: „Otvor prevádzku“, „Nájdi …“, „Zadaj úlohu Codexu: …“, „Brífing“, „Nočný režim“, „Obnov“. Zadanie úlohy len predvyplní formulár; zápis potvrdzuje človek.
- **Brífing priorít**: priority jedna po druhej (`←` `→`, `Esc`).
- **Živé obnovovanie**: údaje sa načítajú znova každú minútu, keď je karta viditeľná a človek práve nepíše; tlačidlo NAŽIVO obnoví hneď.
- **Nočný a denný režim**: predvolený je tmavý režim v zelenej a oranžovej LIVE-IN (tmavé sklo, slnko s horizontom, veľké písmo, bežiaca páska so živými číslami). Od 13. 11. 2026 bez digitálneho dažďa, riadkovania obrazovky, rohových značiek, blikania a štartovacej sekvencie. Denný režim je svetlý; prepínač je v hlavičke a v palete.
- **Tabuľa úloh** v oblasti Ľudia a agenti: stĺpce podľa stavu. Karty sa nedajú presúvať, lebo stav mení len vykonávateľ vlastnou udalosťou.

## Súbory

- `lib/hq-events.js` kontrakt a validácia; `lib/hq-core.js` vykonávatelia, operácie, projekcie; `lib/hq-labels.js` popisky a oblasti.
- `lib/hq-store.js` register nad Supabase; `lib/hq-local.js` lokálny register v súbore (len vývoj); `lib/hq-server.js` identita volajúceho.
- `lib/hq-connectors.js` Slack a Asana; `lib/hq-data.js` dáta obrazovky; `lib/hq-live.js` a `lib/hq-live-core.js` živé údaje z modulov appky.
- `lib/hq-vault.js`, `lib/hq-vault-fs.js`, `lib/hq-vault-server.js` Obsidian; `lib/hq-graph.js` mapa; `lib/hq-voice.js` príkazy.
- `lib/hq-agents.js`, `lib/hq-agents-fs.js`, `lib/hq-agents-server.js` agenti z dôkazov; `tools/ustredna/agents-sync.mjs` zberný skript; `lib/hq-economy.js` súhrn výnosov pre prehľad.
- `app/ustredna/` stránka a akcie; `components/ustredna/` obrazovka; `app/api/hq/` API.
- `supabase/migrations/20261114_ustredna.sql` schéma (aplikovaná v produkcii 12. 11. 2026); `tools/ustredna/hq.mjs` nástroj pre agentov.
- Testy: `tests/hq-events.test.mjs`, `tests/hq-store.test.mjs`, `tests/hq-connectors.test.mjs`.

## API (jeden kontrakt pre UI, Codex, Claude Code a konektory)

Autentifikácia: `Authorization: Bearer <token agenta>` alebo prihlásený admin (cookie).

- `POST /api/hq/events` telo `{ op, taskId?, summary, nextAction, assigneeId?, caseId?, evidence?, refs?, checkedEventId?, checkedDigests?, receipt?, sequence?, idempotencyKey? }`
- `GET /api/hq/tasks` fronta volajúceho: `mine` a `toVerify`; `?all=1` pridá všetky úlohy
- `GET /api/hq/tasks/<taskId>` detail s históriou
- `POST /api/hq/slack` prijímač Slack Events API (overuje podpis; zo správ zatiaľ nevytvára úlohy)

Chyby vracajú `{ ok: false, code, error }`: 401 neznámy volajúci, 403 bez oprávnenia, 409 mimo poradia alebo kolízia, 400 neplatný údaj.

## Nástroj pre agentov

Bez závislostí a bez modelových volaní. Agent ho spúšťa vo svojom prihlásenom nástroji (predplatné), žiadne modelové API kľúče.

```sh
node tools/ustredna/hq.mjs queue --env <súbor s HQ_URL a HQ_TOKEN>
node tools/ustredna/hq.mjs show <taskId> --env <súbor>
node tools/ustredna/hq.mjs accept <taskId> --summary "Preberám" --next "Kto a čo ďalej" --env <súbor>
node tools/ustredna/hq.mjs step|block <taskId> --summary "…" --next "…" --env <súbor>
node tools/ustredna/hq.mjs result <taskId> --summary "…" --next "…" --file <cesta> --version 1 --env <súbor>
node tools/ustredna/hq.mjs verify <taskId> --summary "…" --next "…" --event <eventId výsledku> --digest <sha256> --env <súbor>
```

Ak ústredňa neodpovedá, nástroj skončí chybou a výslovne napíše, že udalosť nebola zapísaná.

## Premenné prostredia

| Premenná | Na čo | Stav |
|---|---|---|
| `HQ_AGENT_TOKENS` | JSON mapa `{"agent:codex":"<token>", "agent:claude-code":"<token>"}`; token aspoň 24 znakov | v produkcii nenastavené |
| `SLACK_BOT_TOKEN`, `HQ_SLACK_CHANNEL` | hlásenie udalostí do vlákna v #ai-tim (predvolený kanál `C0C9HG8B42C`) | nenastavené |
| `SLACK_SIGNING_SECRET` | overenie prijímača `/api/hq/slack` | nenastavené |
| `ASANA_TOKEN` | vytváranie úloh v Asane (už ho používa Údržba) | pre ústredňu neoverené |
| `HQ_LOCAL_STORE` | cesta k lokálnemu registru v súbore; funguje len mimo produkcie | len lokálne |

Agenti v produkcii zapisujú cez servisný účet (`SUPABASE_SERVICE_ROLE_KEY` alebo `CRM_BOT_EMAIL`/`CRM_BOT_PASSWORD` s rolou `bot`).

## Lokálny beh

```sh
pnpm install
# .env.local: HQ_LOCAL_STORE=<cesta>/.hq-local/register.json a HQ_AGENT_TOKENS={...}
pnpm exec next dev -p 3210
```

Obrazovka `/ustredna` vyžaduje prihlásenie admina. Lokálny register je súbor na jednom počítači: funguje len, kým beží lokálny server.

## Nasadenie a návrat

1. Hotovo 12. 11. 2026: migrácia `20261114_ustredna` je aplikovaná (len nové tabuľky `hq_*`, zatiaľ prázdne). Návrat: `drop table hq_links, hq_quarantine, hq_sources, hq_actors, hq_events; drop function hq_events_immutable();`
2. Nastaviť `HQ_AGENT_TOKENS` vo Verceli a odovzdať tokeny agentom mimo repozitára a mimo Slacku.
3. Zlúčiť vetvu do `main` (nasadenie je len commitom do `main`). Návrat: revert commitu; tabuľky `hq_*` nič iné nepoužíva.
4. Voliteľne nastaviť Slack bota a overiť jednu označenú skúšobnú udalosť.

Register v databáze je založený a prázdny. Skúšobné udalosti z lokálneho behu v ňom nie sú.

## Čo je naživo a čo čaká (12. 11. 2026)

Naživo, lokálne: register, API, nástroj agentov, obrazovka; jedna skúšobná úloha Claude Code cez celý tok po výsledok.
Overené cez konektory relácie Claude Code, nie zo servera: jedna označená správa v #ai-tim a jedna skúšobná úloha v Asane.
Čaká: zlúčenie do `main`, tokeny, serverový Slack a Asana, prvá udalosť Codexu, potvrdenie zapracovania cieľovou službou,
adaptér starého súborového registra, všetky ostatné zdroje (pošta, kalendár, HubSpot, Guesty, PriceLabs, WhatsApp, marketing, financie, hlas).
