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
