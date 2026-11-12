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

## Súbory

- `lib/hq-events.js` kontrakt a validácia; `lib/hq-core.js` vykonávatelia, operácie, projekcie; `lib/hq-labels.js` popisky a oblasti.
- `lib/hq-store.js` register nad Supabase; `lib/hq-local.js` lokálny register v súbore (len vývoj); `lib/hq-server.js` identita volajúceho.
- `lib/hq-connectors.js` Slack a Asana; `lib/hq-data.js` dáta obrazovky.
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
