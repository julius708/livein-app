# Údržba a hlas LIVE-IN (pilot)

Pilot v hlavnej appke (`/udrzba`): hlásenie → triáž → dopyty dodávateľom → ponuky → súhlas majiteľa e-mailom (a hovorom) → objednávka → práca, materiál, doklady → finančné uzavretie. Prichádzajúce hovory (recepčná AI) posielajú udalosti do dashboardu; hlasový proces beží mimo Vercelu (`voice/`).

**Bezpečnostné zásady pilotu**
- Produkčné hovory, objednávky a správy sú vypnuté, kým prevádzka pilot neschváli: `maint_settings.pilot.enabled = false`.
- Test režim (`pilot.test_mode = true`) posiela e-maily a hovory **iba** na adresy a čísla v `allowed_emails` / `allowed_phones`. Ostatné sa zapíšu ako `email_suppressed` / zrušený hovor.
- GET nikdy nerozhoduje. Rozhodnutie majiteľa je výslovný POST (server action) na jednu verziu ponuky, viazanú na príjemcu cez token (v DB len SHA-256 hash). Dvojklik, starý odkaz a zmenená ponuka sú zamietnuté (`decide()` v `lib/maint.js`).
- Mlčanie nie je súhlas: pripomienky (4 h, 24 h) a eskalácia na službu (48 h) → stav `no_response`.
- Jedna objednávka na prípad (čiastočný unikátny index `maint_orders_one_per_case`), jedna objednávka na súhlas (`approval_id unique`).
- Do logov a auditu nejdú kódy, heslá ani PII (len e-mail schvaľovateľa v samotnom riadku súhlasu; udalosti hovorov nesú `caller_hash`).

## Súbory
| Kde | Čo |
|---|---|
| `supabase/migrations/20261108_udrzba_pilot.sql` | tabuľky `maint_*`, RLS (`maint_team()`), fronta, udalosti, pohľad `maint_owner_repairs_v` |
| `lib/maint.js` | čistá logika: triáž, stavy, limity, `decide()`, pripomienky, DPH, poplatok, blokátory, test režim, Svix, metriky |
| `lib/maint-server.js` | operácie nad DB, udalosti, fronta `maint_jobs`, spracovanie jobov, webhooky, health |
| `lib/maint-mail.js` | Resend: e-mail majiteľovi (dopad, čo tím skúsil, rozsah, položky, strop, termín, prílohy, „Zobraziť ponuku“), pripomienka, dopyt dodávateľovi |
| `lib/maint-telephony.js` | rozhranie poskytovateľa: `test` (nevolá), `3cx`, `twilio` |
| `lib/maint-asana.js` | jedna úloha na prípad (ID, stav, termín, riešiteľ, odkaz), opakovaný sync aktualizuje tú istú |
| `app/udrzba/*` | stránky tímu: prípady, detail, dodávatelia, nastavenia, prehľad hovorov |
| `app/p/dopyt/[token]`, `app/p/schvalenie/[token]` | verejné stránky dodávateľa a majiteľa |
| `app/api/maint/*`, `app/api/cron/maint-jobs` | webhooky, udalosti hovorov, health, prepisy, fronta |
| `voice/` | kostra hlasového procesu (prompty hosť/majiteľ, FAQ oddelene, klient udalostí) |
| `tests/maint.test.mjs` | akceptačné testy logiky (`node --test tests/maint.test.mjs`) |

## Konfigurácia (bez tajomstiev: názvy premenných)
| Premenná | Načo | Stav |
|---|---|---|
| `RESEND_API_KEY` | odosielanie e-mailov | ✅ nastavené v hube |
| `MAINT_FROM`, `MAINT_REPLY_TO` | odosielateľ (`LIVE-IN Údržba <udrzba@live-in.international>`), reply-to | voliteľné (predvolené) |
| `RESEND_WEBHOOK_SECRET` | podpis Svix pre `/api/maint/email-inbound` (email.received, delivered, bounced) | ⏳ čaká: webhook v Resende + MX pre prijímanie |
| `MAINT_DUTY_EMAIL` | e-mail služby pre eskalácie (inak `duty_contact` bytu, inak admini) | ⏳ doplniť |
| `MAINT_EVENTS_SECRET` | Bearer pre `/api/maint/call-events` (hlasový proces → dashboard) | ⏳ nastaviť vo Verceli a v hlasovom procese |
| `MAINT_TELEPHONY_PROVIDER` | prebije `maint_settings.telephony.provider` (`test`/`3cx`/`twilio`) | voliteľné |
| `THREECX_API_URL`, `THREECX_API_KEY`, `THREECX_TEST_EXT`, `THREECX_WEBHOOK_SECRET` | 3CX Call Control + OpenAI Realtime most | ⏳ čaká na potvrdenie dodávateľa 3CX (odchádzajúci hovor s obojsmerným zvukom a stavovými udalosťami na testovacej klapke) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `MAINT_VOICE_URL`, `MAINT_PUBLIC_WEBHOOK_URL` | záložný overený poskytovateľ | ⏳ čaká na údaje |
| `ASANA_TOKEN`, `ASANA_MAINT_PROJECT` | úloha na prípad (bez projektu padá do Damages Reporting) | ✅ token je; projekt doplniť |
| `CRON_SECRET` | cron `/api/cron/maint-jobs` (každých 5 min) a `/api/maint/health?k=` | ✅ |
| `NEXT_PUBLIC_SITE_URL` | základ verejných odkazov | ✅ |

Nastavenia v DB (`maint_settings`, mení admin v `/udrzba/nastavenia`): `pilot` (enabled, test_mode, allowed_emails, allowed_phones), `fee` (45 € do 60 min, `terms_approved` musí byť true), `reminders`, `telephony`, `retention`.

## Stav integrácií
| Integrácia | Overené | Čaká |
|---|---|---|
| Supabase (tabuľky, RLS, fronta) | migrácia aplikovaná v LIVE-IN Core, RLS cez `maint_team()` | — |
| Resend odosielanie | kľúč v hube, šablóny | doménové overenie `udrzba@…` / MX pre prijímanie, `RESEND_WEBHOOK_SECRET` |
| Resend prijímanie (e-mail dodávateľa) | parser značky `[U-26-0001#R…]`, overený odosielateľ, AI extrakcia ako návrh | nastaviť webhook `email.received` → `/api/maint/email-inbound` |
| Asana | klient, idempotentný sync podľa `asana_gid` | `ASANA_MAINT_PROJECT` (inak Damages) |
| 3CX + OpenAI Realtime | adaptér, webhook so zdieľaným tajomstvom | potvrdenie dodávateľa; presný tvar Call Control API |
| Twilio | adaptér, podpis X-Twilio-Signature | údaje účtu, hlasový server `voice/` nasadený mimo Vercelu |
| Prepisy z 3CX | import `/api/maint/transcripts` (oddelene nahrávka/prepis/súhrn, retencia, párovanie len pri zhode, inak kontrola) | potvrdený spôsob exportu z 3CX |
| Recepčná AI (prichádzajúce) | udalosti → `/api/maint/call-events`, dashboard | hlasový proces, `MAINT_EVENTS_SECRET`, produkčná trasa až po testoch |

## Kontrola stavu
`GET /api/maint/health` (prihlásený tím alebo `?k=CRON_SECRET`): pilot, test režim, počty povolených adries/čísel, mail, inbound secret, Asana, telefónia (poskytovateľ + ready), fronta (queued/failed), otvorené prípady.

## Návrat (rollback)
1. Vo Verceli vrátiť predchádzajúci deployment (alebo revert commitu vetvy `udrzba-pilot`).
2. Cron `/api/cron/maint-jobs` prestane existovať s kódom; dáta ostávajú.
3. Ak treba odstrániť schému (po zálohe!), spustiť ručne v Supabase:
```sql
drop view if exists public.maint_owner_repairs_v;
drop table if exists public.maint_transcripts, public.maint_call_events, public.maint_call_sessions, public.maint_inbound_events, public.maint_work_log, public.maint_jobs, public.maint_events, public.maint_calls, public.maint_orders, public.maint_approvals, public.maint_quotes, public.maint_requests, public.maint_cases, public.maint_listing_settings, public.maint_vendors, public.maint_incidents, public.maint_faq, public.maint_settings cascade;
drop function if exists public.maint_next_ref(); drop sequence if exists public.maint_case_seq; drop function if exists public.maint_team();
```

## Akceptačné scenáre
| Scenár | Kde je ošetrené | Test |
|---|---|---|
| Základný tok | `createCase` → `sendVendorRequests` → `submitQuote` → `selectQuote` → e-mail → `decideApproval` → objednávka → `addWork` → `closeCase` | náhľad (fiktívny prípad) |
| Starý odkaz | `decide()` `expired`; stránka ukáže „platnosť uplynula“ | `tests/maint.test.mjs` |
| Dvojklik | DB update s podmienkou na stav + `decide()` `already_decided`; udalosť s `dedupe_key` | test + `decideApproval` |
| Duplikát webhooku | `maint_inbound_events unique(source, external_id)`; Svix tolerancia 5 min | test (replay) |
| Zmena ceny / rozsahu | nová verzia ponuky → `invalidateApprovalsFor`; `approvalMatches` v `decide()` aj pred hovorom | test |
| Odmietnutie | stav `declined`, hovor a pripomienky zrušené, tím môže nové kolo | test + náhľad |
| Chýbajúce oprávnenie | `approvalNeed` `no_approver` → služba upozornená, prípad ostáva v porovnaní | test |
| Nedoručený e-mail | `email.bounced` → `bounced`, notifikácia službe | kód (čaká na webhook) |
| Schválenie pred volaním | `place_call` znovu overí stav súhlasu; rozhodnutie e-mailom ruší naplánovaný hovor | kód |
| Výpadok hovoru | `placeCall` chyba → opakovanie podľa `call_retry`, potom eskalácia | kód |
| Transfer bez spojenia | udalosť `transfer_failed`, v dashboarde zvlášť | test metrík |
| Opakovanie | fronta `maint_jobs` s `attempts`/`max_attempts`, exponenciálny odstup | kód |
| Výpadok Asany | job `asana_sync` zlyhá → opakuje sa; prípad sa nezastaví | kód |
| Hovor skončil bez potvrdenia | `callMetrics`: nie je „vyriešené“, ide do nedokončené/neznáme | test |

## Produkčný pilot
Zapnúť až po akceptácii LIVE-IN: admin v `/udrzba/nastavenia` zaškrtne „Pilot zapnutý“ a prípadne vypne test režim. Dovtedy sa objednávky len evidujú a správy idú len na povolené adresy.
