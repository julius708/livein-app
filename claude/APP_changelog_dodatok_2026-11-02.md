# APP changelog – dodatok 2026-11-02

## Prerábka appiek (vlna 2)
- CS: prehľad zmeny v troch blokoch (príchody, odchody, úlohy), rýchle akcie hore, Moje úlohy nad tímom.
- Ring: kratší úvod, návod zbalený. KB a Zaradenie: kratšie úvody, hľadanie hneď hore.
- Menu „Aplikácie“ v hlavičke všetkých 7 appiek v štýle liquid glass; opravené prečnievanie dlaždíc.
- Dlaždice nástrojov na domove v strednej veľkosti (ikona vľavo, jeden riadok popisu).
- Funkcie Vercelu presunuté do regiónu Dublin (vedľa Supabase eu-west-1); indexy na guru.reservations.

## LIVE-IN Guru ako widget (rovnaký typ ako Adam na webe)
- `components/GuruWidget.js`: malá postavička dole na každej stránke, po kliknutí čitateľné okno, dá sa presúvať (poloha sa pamätá) a zbaliť, Esc zavrie. Žiadne skákanie, len jemné dýchanie.
- Viditeľný len pre prihlásených aktívnych členov tímu (`me` v `Shell`), na stránke `/guru` ostáva veľký chat.
- Hlas: `app/api/guru/tts/route.js` (ElevenLabs s časovaním znakov podľa vzoru `api/tts.js` asistenta Adama), ústa sa hýbu podľa hlások, slová sa odkrývajú so zvukom. Bez kľúčov číta prehliadač (sk-SK).
- Ústa na rovnakej pozícii ako u Adama (ľavý okraj 39,58 %, horný 30,6 %, šírka 19,44 %, plátno 140×80), obrázok `public/guru-v3.png` (720×1280, priehľadné pozadie). Finálna postava Gura (zelené tričko LIVE-IN, okuliare), názov s verziou kvôli cache.
- Odpovede cez existujúci `/api/guru` (rovnaký model, pamäť, nástroje sql/search_kb). Systémový prompt: bez markdownu; kódy od dverí, keysafe a Wi-Fi heslá smie tímu uviesť (schválil Július 24. 10. 2026); citlivé financie (marže, platy, ziskovosť, bankové a osobné finančné údaje) odkáže na Júliusa alebo Ninu. Tón nezmenený.
- Pomocné funkcie v `lib/guru-widget-core.js` (strip markdownu, visémy, časová os, clamp, text pre hlas) s testami `tests/guru-widget-core.test.mjs` (`npm test`, node:test).
- Premenné vo Verceli (nastavuje Július): `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, voliteľne `ELEVENLABS_MODEL`. Model Gura: `ANTHROPIC_MODEL=claude-sonnet-5-5` (prepnuté 2. 11. 2026 večer na žiadosť Júliusa).

## Súbory
`components/GuruWidget.js`, `app/guru/guru-widget.css`, `app/api/guru/tts/route.js`, `app/api/guru/route.js` (prompt), `lib/guru-widget-core.js`, `tests/guru-widget-core.test.mjs`, `components/Shell.js`, `package.json` (skript test), `app/home.css`, `app/workspace.css`, `vercel.json`.

## Guru widget: oprava zasekávania a realistickejšie ústa (večer)
- Odhaľovanie slov pri reči už neprekresľuje zoznam správ pri každom snímku (60×/s), čo zasekávalo stránku pri dlhých odpovediach.
- Časový limit odpovede 70 s s hláškou; poistka mikrofónu (po 12 s bez výsledku sa rozpoznávanie ukončí, nič neostane zaseknuté).
- Ústa: namiesto kreslených pier sa pri reči jemne spúšťa brada (kópia spodnej časti tváre, `.gw-jaw`) a medzi perami sa kreslí mäkké tmavé otvorenie prelínané do fotky (multiply). Plynulé dobiehanie bez trasenia.

## Guru: skutočné snímky úst, rýchlejšie odpovede, väčšia postava
- `public/guru-mouth/{e,ah,oh,ee}.png`: štyri snímky úst vygenerované z postavy (Higgsfield, GPT Image 2.5), zarovnané na pôvodný obrázok, s mäkkým okrajom. Widget ich prelína podľa hlások z časovania ElevenLabs; kreslené ústa ostávajú len ako záloha, keď snímky nejdú načítať.
- Hlava sa pri reči jemne hýbe (pomalé kolísanie, bez trasenia).
- Režim widgetu v `/api/guru` (`mode: 'widget'`): odpovede 2 až 4 vety, max 700 tokenov, najviac 4 kroky nástrojov. Text odpovede sa zobrazí hneď, hlas ide zvlášť.
- Postava o pätinu väčšia (150 px, v okne 178 px, mobil 118 px).

## Guru: hlasový vstup cez nahrávku a prepis
- `app/api/guru/stt/route.js`: nahrávka z mikrofónu (MediaRecorder) sa prepíše cez ElevenLabs Speech to Text (scribe_v1, slovenčina). Funguje v Chrome, Safari aj na iPhone; rozpoznávanie reči v prehliadači ostáva len ako záloha.
- Klik na mikrofón začne nahrávať (max 20 s), druhý klik odošle. Jasné hlášky pri zablokovanom mikrofóne alebo zlyhaní prepisu.

## 2026-11-03 – Nový web LIVE-IN (livein-web)
- Verejný web prepísaný do Next.js 15 (rovnaká technológia ako appka): repozitár `julius708/livein-web`, Vercel projekt `livein-web` (región dub1), 135 statických stránok v 6 jazykoch.
- Obsah starého webu (livein-release-20261013) sa extrahuje skriptom `scripts/extract.mjs` do `content/*.json`; pôvodné animácie, kalkulačka, formulár dopytu, galéria a Adam sú zachované.
- Dizajn zjednotený s appkou (Figtree, zelené sklo, biele logo). Staré adresy (/livein-release-20261013/…, #hash trasy) sa presmerujú.
- Náhľad: https://livein-web-self.vercel.app ; doména new.live-in.international pridaná, čaká na CNAME v DNS (GoDaddy).

## 2026-11-03 – Testy osobnosti (nový modul /testy)
- Nová dlaždica a položka v menu Aplikácie „Testy osobnosti“ pre celý tím: DISC, Big Five, 16 typov, Tímové roly, Pracovný štýl, Kariérne hodnoty (`lib/personality-tests.js`, testy v `tests/personality-tests.test.mjs`).
- Stránky `/testy` (zoznam + moje výsledky), `/testy/[key]` (priebeh testu, výsledok hneď), `/testy/tim` (zdieľané výsledky), `/testy/admin` (všetky výsledky, CSV).
- Tabuľka `public.personality_results` s RLS: vlastné výsledky, zdieľané vidí tím, admin vidí všetko. Vyhodnotenie beží na serveri (server actions).
- Pôvodný samostatný projekt livein-testy (statická stránka s vlastnou databázou DISC) bol prázdny; doména testy.live-in.international teraz slúži ako náhľad webu.

## 2026-11-03 – Web: fotky bytov od Thirringa, nový úvod, oprava mobilu
- Nasadené na https://new.live-in.international (livein-web, commity c1e3596 a 7fd1dd2). Domény new.live-in.international aj livein-web-self.vercel.app bežia, runtime chyby žiadne.
- 12 profesionálnych fotiek z Drive „LIVE-IN Management | thirring.sk“ (Eurovea, Sky Park veža 1 a 4, Moskovská 6, Tri veže, Petržalka) prevedených do WebP (1800/900 px) do `public/assets/thirring/`; titulky uvádzajú kredit thirring.sk.
- Úvodný „film“ na domovskej stránke: tri scény z fotiek bytov rozhýbané v Higgsfielde (Kling 3.0, 5 s, bez zvuku), klipy v `public/assets/film/`. Pôvodné vizualizácie kancelárie zostali len v galérii „vizualizácie novej kancelárie“.
- Sekcia „Za dobrým pobytom“ prepracovaná: tmavozelený panel, kroky vľavo, veľká fotka 4:3 vpravo, popis pod krokmi (desktop aj mobil).
- Fotky bytov na podstránkach Správa, Krátkodobá, Dlhodobá, Ako to funguje, Ubytovanie, Poradňa, Ceny, FAQ, O nás, Kontakt a v galérii/článkoch (všetkých 6 jazykov).
- Oprava: na mobile sa oranžové tlačidlo v hlavičke skrýva (je v menu), hamburger bol predtým mimo obrazovky.
- Doplnené chýbajúce ambientné videá (cinema-loft, cinema-terrace, autumn-apartment, office-cinema-6), ktoré sa predtým nenačítali.
- Otvorené: Adam (widget livin-asistent) hovorí po slovensky aj na cudzojazyčných stránkach – riešiť v projekte livin-asistent; `<html lang>` je pri serverovom renderi vždy „sk“ (prepne sa až v prehliadači).

## 2026-11-03 – Testy osobnosti: hravý priebeh, grafický výsledok, mapa tímu
- Priebeh testu (všetkých 6): otázka ako karta, odpovede s ikonami a klávesami 1–5, kruh postupu, „Tvoj profil sa kreslí“ (pavučina sa plní počas odpovedania). Komponent `components/TestRunner.js`.
- Výsledok: odznak typu (16 typov má aj meno, napr. ENTJ · Veliteľ – `T16_NAMES`), pavučina s prerušovaným priemerom tímu (zo zdieľaných výsledkov, min. 2 ľudia), stĺpce, „Čo to o tebe hovorí“ s radou pre spoluprácu (`COLLAB` v `lib/personality-team.js`), najmenej výrazná dimenzia, tlačidlo „Porovnať sa s tímom“. Rovnaká karta aj v „Moje výsledky“ (`components/TestResult.js`).
- Tím (`/testy/tim`, `components/TeamBoard.js`): prepínač testov; mapa tímu s osami podľa testu (`AXES`), mierka prispôsobená tímu, krúžky s iniciálami sa neprekrývajú (odtláčanie), čiary od vybraného k ostatným podľa podobnosti; výber 1–2 ľudí → profil s pavučinou, podobnosť v % (kruh), v čom sa zhodujú/líšia, rady; rozloženie tímu po dimenziách (bodky + priemer); najpodobnejšie dvojice a najväčšie protiklady; slovník dimenzií.
- Vlastné výsledky vidím na mape aj bez zdieľania, kolegovia vidia len zdieľané (RLS nezmenené).
- Testy: `tests/personality-tests.test.mjs` (15 testov) – pozícia, podobnosť, dvojice, priemer, priebežné skóre, mená typov.
- Ticker `app_updates`: „Testy osobnosti: mapa tímu a hravý priebeh“.

## 2026-11-03 – Tímový feedback (zapracované)
- #17 Michaela Uhríková (nápad): história balenia tašiek pár dní dozadu → Práčovňa: personál vidí v menu „História → Zabalené balíčky“ (byt, kto, kedy, na koľko osôb, koľko čoho; predvolene 7 dní). Audit udalostí a CSV zostali len správcovi. Nasadené (pracovna f7651d2), ticker `app_updates`. Stav: hotovo.
- #8 Miška (nápad): odkaz na stránku s voľnými apartmánmi → v hlavnej appke nová dlaždica „Voľné apartmány“ (booking.live-in.international) pre všetkých. Nasadené (livein-app daa3263). Stav: hotovo.
- #2, #3, #16 pochvaly → uzavreté ako hotovo.
- #6 Zuzana Pavlíková (chyba/otázka): Booking blokuje odkazy v správach cez Guesty, bez telefónu sa Ring link nedá poslať. Zmena správ hosťom je bez súhlasu vedenia zakázaná → stav „rieši sa“, návrh pre Júliusa: (a) do automatickej správy pred príchodom pridať vetu „Pre otvorenie dverí nám prosím pošlite telefónne číslo“ pri bytoch s Ringom, (b) alternatívne posielať link e-mailom cez Guesty (Booking relay adresa link v e-maile prepustí), (c) v Ring appke umožniť vygenerovať krátky kód, ktorý hosť zadá na ring.live-in.international (text bez odkazu Booking neblokuje).

## 2026-11-03 – Ring oprava, Guru v Práčovni, zaujímavosť dňa
- **Ring (Vstupy hostí) padal v Safari** („Application error“): v `app/admin/page.js` sa používalo `<AppsMenu>` bez importu (zmena z 2. 11.). Chrome prešiel, Safari zastavilo. Opravené (livein-ring e60f32e). Pridaná záchytná obrazovka `app/error.js` po slovensky + `api/client-error`, ktorá chybu z prehliadača zapíše do logov Vercelu – tak sa chyba našla.
- **Guru v Práčovni**: `src/ui/GuruDock.tsx` (postavička + okno s iframe `app.live-in.international/guru?embed=1`), hub má v `/guru` režim `embed=1` bez hlavičky. Rovnaké prihlásenie (same-site cookies cez app.live-in.international/pracovna).
- **Zaujímavosť dňa**: `app/api/guru/fact` generuje jednu zaujímavosť na deň pre celý tím (Anthropic, témy sa striedajú, posledných 90 sa posiela ako „nepoužiť“), tabuľka `public.guru_daily_facts` (RLS: čítanie aj vloženie pre prihlásených). Widget ju ukáže v bubline s pohybom úst bez otvorenia chatu, raz za deň na zariadenie (`localStorage guru-fact-day`). Zvuk sa bez kliknutia nespúšťa (obmedzenie prehliadačov).

## 2026-11-03 – Jednotný vzhľad všetkých appiek
- Audit rozdielov (hlavička, menu Aplikácie, dlaždice, zdieľané CSS, Guru) → zdieľaná „súprava“ v scratchpade generovaná z hlavnej appky: `components/AppsMenu.js` (zoznam z `lib/modules.js` vrátane Testov a Voľných apartmánov, odkazy z `config.module_urls`), `components/Tile.js` + `Tilt.js` (rovnaký 3D efekt ako na domove), `components/GuruDock.js` (postavička + okno s chatom cez iframe `/guru?embed=1`), `app/livein-shared.css` (dlaždice, kompaktné dlaždice, Späť, Guru okno, navigácia v hlavičke sa pri viac položkách roluje).
- KB (`livein-kb-`): rýchle odkazy na domove sú dlaždice; hlavný obsah má triedu `li-main-workspace` (rovnaké sklo ako hub); kratší názov „Znalostná báza“; Guru.
- Zaradenie: karty bytov majú 3D efekt (`TiltLink`), trieda `li-main-workspace`, tretia úroveň v navigačnej ceste; Guru.
- CS: rýchle odkazy na prehľade sú kompaktné dlaždice; Guru v appke.
- Ring: vyrovnané stĺpce (formulár + návod vľavo, Guesty vpravo), Guru, nový zoznam v menu Aplikácie.
- Práčovňa: nový zoznam v menu Aplikácie.
- Ekonomika (statická): `<header>`, navigácia pred účtom, „Odhlásiť“, menu Aplikácie s popismi a stavom `.open`, pätička `.li-footer`, Guru.
- Ring + ostatné: záchytná obrazovka chyby zatiaľ len v Ringu; odporúčam doplniť do ostatných pri najbližšej zmene.

## 2026-11-03 – Guru všade rovnaký, pozdrav menom
- Jeden zdieľaný widget `components/GuruWidget.js` (zdroj pravdy v hlavnej appke, kópie v KB, Zaradení, CS, Ringu a Práčovni – v Práčovni s `/* eslint-disable */` na prvom riadku). Volá API hlavnej appky (`/api/guru`, `/api/guru/tts`, `/api/guru/stt`) cez CORS s cookies; každá appka posiela `app`, podľa ktorého API dostane kontext a widget ukáže relevantné otázky (čipy).
- **Pozdrav pri otvorení appky**: 2 s po načítaní Guru povie „Ahoj, Meno!“ (bublina + pohyb úst + hlas). Raz za otvorenie karty (`sessionStorage guru-greeted`), nie pri každom prechode medzi stránkami. Hlas sa pri blokovanom autoplay prehrá po prvom kliknutí/klávese.
- Zaujímavosti dňa sú vypnuté (na želanie). Route `/api/guru/fact` a tabuľky `guru_facts`/`guru_daily_facts` zostávajú, nič ich nevolá.
- Ekonomika (statická stránka) má zatiaľ Guru cez iframe okno; pozdrav tam nie je.

## 2026-11-03 – Ekonomika ako sekcia hlavnej appky
- Nová sekcia `/ekonomika` (len admini; dáta navyše chráni RLS na `economics_snapshots`, vidia ich 4 ľudia z vedenia). Rovnaká hlavička, menu Aplikácie, Guru (kontext „economy“, otázky o výnosoch a výkone bytov) ako zvyšok appky. Modul v `lib/modules.js` má `href:'/ekonomika'`; `config.module_urls.economy` ukazuje na `…/ekonomika`.
- `app/api/ekonomika/snapshot`: prečíta snímok (gzip+base64) cez session prihláseného, rozbalí na serveri, vráti JSON (~1,3 MB, komprimuje Vercel). Klient ho obnovuje každých 5 minút a tlačidlom Obnoviť.
- Výpočty: `lib/economy-math.js` (prefixové súčty na denných poliach, intervaly, presety, kanály, mesiace, filtre, Monte Carlo scenáre, banka, CSV) + `tests/economy-math.test.mjs`.
- Pohľady (`components/economy/`): Prehľad (6 KPI so zmenou oproti predchádzajúcemu rovnako dlhému obdobiu a sparkline; „Čo hovoria čísla“; mesačný graf výnos + obsadenosť s označením neúplného mesiaca; kanály ako prstenec; top byty; kto rastie / klesá; mestá s RevPAN), Porovnanie A ⇄ B (KPI, čiary, kanály, tabuľka, CSV), Byty (karty alebo tabuľka, triedenie, CSV), Mapa (Leaflet z unpkg, metrika, výber), Výhľad (slidery, histogram 2 000 scenárov, už rezervované po mesiacoch, analytický report na stiahnutie), Banka (firma/účet/mesiace, príjmy a výdavky, tabuľka, P&L YTD podklad, kandidátske kategórie), Analýza (dopyt pod/nad trhom, finančný pohľad, kvalita dát, report PriceLabs). Detail bytu v dialógu (história po mesiacoch, kanály, odkaz na Airbnb).
- Nové metriky oproti starej stránke: obsadenosť, výnos na dostupnú noc (RevPAN), rozklad zmeny na noci × cenu, koncentrácia top 10, mestá zjednotené (Bratislava I/II… → Bratislava).
- Smerovanie: zrušený proxy `/ekonomika/` na statickú stránku; `/ekonomika/` → 308 na `/ekonomika`. Starý projekt `live-in-ekonomika` (ekonomika.live-in.international) všetko presmerúva na novú sekciu.
- Hub: skip-link „Preskočiť na obsah“ sa ukáže len pri klávesnici (`:focus-visible`).
- Usage sa eviduje ako `economy_<pohľad>`; bankové filtre a obdobia A/B sa na banku nevzťahujú (ako predtým).

## 2026-11-03 – Guru vidí do Asany
- Nový nástroj Guru `asana` (`lib/guru-asana.js`): `search` (fulltext v úlohách cez Asana search API, s filtrami projekt/riešiteľ/hotové; bez platenej funkcie padá na typeahead podľa názvu), `project_tasks` (otvorené alebo hotové úlohy projektu, sekcie, riešiteľ), `task` (detail s popisom, poľami, poslednými 15 komentármi a podúlohami), `projects` (zoznam s počtami). Token `ASANA_TOKEN` (ten istý ako Údržba a import do KB); bez tokenu sa nástroj neponúka.
- Viditeľnosť: projekt s prihlasovacími údajmi je skrytý pre všetkých; faktúry, účtovníctvo, dochádzka a dovolenky, obchod (Sales, Business), kontakty, meetings/report a SIFC vidia len admini. Výnimky: `config.guru_asana = { deny_all, deny_staff, allow_staff }` (gid projektov). Úlohy mimo povolených projektov sa z výsledkov vyhadzujú.
- Systémový prompt Guru vysvetľuje, kedy Asanu použiť a aké sú hlavné projekty; v odpovedi uvádza názov, riešiteľa, termín, stav a odkaz. Widget na domove má čip „Aké opravy sú v Asane otvorené?“.
- Testy pravidiel viditeľnosti: `tests/guru-asana.test.mjs`.

## 2026-11-04 – CRM a Newsletter: krok 2 (dátový model a sync)
- Tabuľky `leads`, `lead_events`, `notifications`, `crm_sync_queue` (RLS: rola `crm`; notifikácie len vlastné; Guru číta leady cez `guru_ro`). Realtime zapnutý pre `notifications` a `leads`. Nové roly `crm` a `newsletter` (constraint `app_users_roles_valid` rozšírený; Zuzana+Patrik crm, Július crm+newsletter, Simona newsletter).
- `lib/crm.js` (čisté pravidlá: mestá, smerovanie, priority, telefón/wa.me, zdroj, štádiá ↔ HubSpot ↔ Asana, import, odpočet, pripomienky) + `tests/crm.test.mjs`.
- `lib/hubspot.js` (token len na serveri, bez PII v logoch), `lib/crm-asana.js` (sekcie LEAD 1 … ✕ v projekte LIVE-IN International, vlastné polia Zdroj / Dôvod straty / Prvý kontakt / Lead prijatý), `lib/supabase-admin.js` (service role), `lib/crm-server.js` (createLead idempotentne, changeStage s frontou zápisov, flushQueue s opakovaním, importAll, syncExternal).
- Trasy: `POST /api/crm/create-lead` (Zapier, kľúč `CRM_WEBHOOK_SECRET`), `POST /api/crm/import` (admin alebo cron kľúč), `GET /api/cron/crm-sync` každých 10 min (vercel.json).
- Potrebné premenné vo Verceli (hub): `HUBSPOT_TOKEN`, `CRM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`; v kroku 4 `WEB_PUSH_PRIVATE_KEY`, `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_SUBJECT`.

## 2026-11-04 – Marketingový plán 2027 v appke
- Sekcia `/plan` („Cesta k najväčším na Slovensku“): celý plán prepísaný do appky (vízia, čísla 69 → ~130 → ~310, tempo 15 bytov mesačne, mix zdrojov, 30 videí mesačne a rozpočet, päť motorov, lievik, štyri schody, úspech 2027, naša veta a výkaz, nová značka, semafor kapacity, tím, prvých 30 dní, metriky, kto za čo ručí). Dáta v `lib/plan-2027.js`, PDF v `public/plan/marketingovy-plan-2027.pdf`.
- Potvrdenie „Prečítal/a som si plán“ → tabuľka `plan_reads` (RLS: vlastný zápis, admin vidí všetkých); admin na stránke vidí, kto čítal (x z y aktívnych).
- Domov: výzva „Nový marketingový plán 2027“ kým človek nepotvrdí; ticker „Vedeli ste?“ má fakty z plánu; cieľ v „LIVE-IN v číslach“ ukazuje míľnik 2027 (`config.company_facts.goal_2027 = 310`, `pace_month = 15`); dlaždica modulu `plan` pre všetkých.
- Novinka v tickeri (`app_updates`) a dokument pre Guru v znalostnej báze (`cs.kb_docs` path `KB/marketingovy_plan_2027`).
