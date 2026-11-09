# Digitálny sprievodca bytom a QR nálepky (pilot)

Každý byt má **trvalý verejný kód** (8 znakov z abecedy bez 0/O/1/l/I, náhodný, nikdy sa nemení; mapovanie kód ↔ Guesty listing ID je len v tabuľke `guide_units` na serveri). Dva trvalé odkazy:

- `https://app.live-in.international/g/<KÓD>` – sprievodca (Wi-Fi ako prvá voľba po overení, adresa a navigácia, karta pre taxikára, mapa, parkovanie, pravidlá, odchod, tipy, podujatia, pomoc), SK/EN v jednej mobilnej šablóne.
- `https://app.live-in.international/g/<KÓD>/recenzia` – spätná väzba: verejná recenzia cez schválený Google Business Profile a súkromná správa tímu, obe vždy rovnako viditeľné.

## Bezpečnosť Wi-Fi
- Hosť zadá meno a priezvisko a e-mail (oba povinné; e-mail sa ukladá na marketing). Server (`POST /api/g/wifi`) načíta z Guesty **aktívne rezervácie tej istej jednotky** (dnes medzi príchodom a odchodom, stav confirmed/checked_in) a spáruje hosťa: zhoda e-mailu, alebo meno aj priezvisko v mene hosťa z rezervácie (bez diakritiky, v ľubovoľnom poradí). Kanálové alias e-maily (Booking, Airbnb) hosť nepozná, preto stačí meno. Až potom vráti názov siete a heslo (tlačidlo Kopírovať).
- Limity pokusov: IP 10 / 15 min, meno+e-mail 5 / h, byt 40 / h. Po prekročení aj pri zlyhaní rovnaká všeobecná chyba (neprezradí, či rezervácia existuje).
- Odpoveď má `Cache-Control: no-store`; heslo je len v pamäti stránky (nie v URL, histórii ani lokálnom úložisku).
- Log (`guide_wifi_log`) obsahuje iba výsledok, kód bytu a čas. Limity používajú pseudonymné kľúče (`guide_wifi_attempts`, hash s tajomstvom, mazanie po 24 h).
- E-mail sa uloží k rezervácii ako neoverený (`guide_guest_emails`); po pripojení ho hosť potvrdí jedným tlačidlom. Bez zaškrtávacích políčok: potvrdením e-mailu hosť súhlasí s podmienkami a novinkami LIVE-IN (text pri tlačidle v jeho jazyku), odhlásenie je v každom e-maile (rozhodnutie J. Hönsch, 8. 11. 2026).
- Vo verejnom HTML, QR kódoch, URL, analytike ani logoch nie sú heslá, vstupné kódy ani údaje hostí. Pri ukladaní karty sa odmietne text, ktorý vyzerá ako kód alebo heslo.

## Súbory
| Kde | Čo |
|---|---|
| `supabase/migrations/20261108_sprievodca.sql` | tabuľky `guide_*`, RLS cez `guide_team()` (admin, operations, customer_service, bot), trigger zamyká `public_code` |
| `lib/guide/core.js` | kód bytu, rozhodnutie o Wi-Fi, limity, anonymný log, podmienky vydania štítku, podujatia, pravidlá, párovanie Prílohy A |
| `lib/guide/server.js` | DB operácie, Wi-Fi tok, spätná väzba, vydanie štítku (idempotentné), oznámenie, synchronizácia portfólia |
| `lib/guide/label.js` | vektorový PDF štítok 150 × 105 mm (pdf-lib, qrcode, Figtree), skúšobný hárok A4 |
| `lib/guesty.js` | Guesty Open API: zdieľaný token (`guesty_state`), rezervácia podľa potvrdzovacieho kódu |
| `app/g/[code]`, `app/g/[code]/recenzia`, `app/api/g/wifi` | verejné stránky a Wi-Fi endpoint |
| `app/sprievodca/*` | interná správa: jednotky, karta bytu, Wi-Fi (chránené), štítky, pravidlá/tipy/podujatia, import Prílohy A, nastavenia pilotu |
| `app/api/cron/guide-sync` | denne: nové listingy dostanú jednotku a kód; pilotné jednotky s úplnými podmienkami dostanú štítok |
| `tools/guide/priloha-a.mjs` | docx Prílohy A → JSON kariet (lokálne, výstup sa necommituje) |
| `tests/guide.test.mjs` | testy (`node --test tests/guide.test.mjs`) |

## Vydávanie štítkov
Podmienky (všetky): overené Guesty ID (aktívny listing), adresa, verejný kód, overené číslo podpory (`guide_settings.general.support_phone_verified`), funkčné oba produkčné odkazy pre ten istý byt (server ich reálne otvorí a hľadá `data-code`). Odkaz Google Business Profile **nie je** podmienkou (pilot, rozhodnutie Július 8. 11. 2026): QR vedie na sprievodcu a stránka spätnej väzby ukáže Google tlačidlo až po doplnení odkazu. Inak stav **na kontrolu** s dôvodmi a bez oznámenia.
Kľúč vydania = Guesty listing ID + verzia šablóny (`guide_label_issues` unique). Opakovanie nevydá ten istý štítok ani druhé oznámenie. PDF je v DB, odkaz na tlač `/sprievodca/stitok/<id>` ide ako in-app notifikácia adminom a prevádzke (voliteľne webhook `GUIDE_NOTIFY_WEBHOOK`, napr. Slack). Zmena obsahu, hesla ani pravidiel nemení QR odkaz ani kód; nová verzia štítku len pri zmene šablóny (`template_version`) alebo adresy.

## Varianty QR a test čítania
Skúšobný hárok (`/sprievodca/harok`) má variant A (biele QR na zelenej) a variant B (tmavé QR v bielej ploche iba pod kódom; logo ostáva priamo na zelenej). Automatický test dekódovania (jsQR nad renderom 200 dpi): variant B prečítal oba kódy, variant A jeden z dvoch kódov neprečítal. Predvolený je preto **variant B**. Verzia 2 (8. 11. 2026): brandový dizajn podľa webu (zelený panel s gradientom, krémová plocha, oranžový akcent, ilustrácia Bratislavy z Higgsfield v `lib/guide/art/label-art.png`, dve karty s QR); oba QR overené dekódovaním z renderu 200 dpi. Fyzický test na iPhone a Androide, z bežnej vzdialenosti a pri slabšom svetle: **čaká na ručné overenie** (hárok je pripravený na tlač).

## Konfigurácia (bez tajomstiev)
| Premenná / nastavenie | Načo | Stav |
|---|---|---|
| `CRM_BOT_EMAIL`, `CRM_BOT_PASSWORD` | servisný účet pre verejné stránky a cron | ✅ |
| `GUIDE_SECRET` | hash pseudonymných kľúčov limitov a podpis potvrdenia e-mailu (inak `CRON_SECRET`) | ⏳ odporúčané nastaviť |
| Guesty token (`guesty_state` / `guesty_tokens`, obnovuje Ring) | overenie rezervácie | ✅ overené v náhľade (neexistujúca aj cudzia rezervácia sú zamietnuté); token sa drží aj v pamäti procesu, nový sa žiada len keď chýba |
| `guide_settings.general.support_phone` + `support_phone_verified` | overené číslo podpory na štítok a stránku | ✅ +421 2 3233 9005 (ústredňa z webu), 8. 11. 2026 |
| `guide_units.gbp_url` | schválený odkaz Google Business Profile na recenziu, pre každý byt (nepovinné pre štítok) | ⏳ doplní LIVE-IN; dovtedy je na stránke spätnej väzby len súkromná správa tímu |
| `guide_settings.pilot.units` | tri pilotné jednotky (Guesty listing ID) | ✅ Klariská (Historical), Nám. 1. mája (Flagship), KE: Alžbetina (Quiet), 8. 11. 2026 |
| `GUIDE_NOTIFY_WEBHOOK` | interný kanál oznámení (Slack) | voliteľné; zatiaľ in-app notifikácie |
| `CRON_SECRET` | cron `/api/cron/guide-sync` (denne 5:20) | ✅ |

## Príloha A
`node tools/guide/priloha-a.mjs priloha.docx > karty.json` a vložiť do importu na `/sprievodca` (najprv „len skúška“). Párovanie podľa adresy: jedna adresa s jednou jednotkou a jednou kartou = spárované; viac jednotiek alebo kariet na adrese = na kontrolu (štítok sa nevydá, doplní sa ručne). Na registri (141 jednotiek, 156 kariet zo 107 adries): 63 spárovaných, 38 na kontrolu, 4 adresy mimo registra, 3 jednotky bez karty. Poznámka: dve karty majú heslo v podkladoch nahradené „[tel]“, tie sa neimportujú.

## Známe správanie
Neznámy kód zobrazí stránku „Táto stránka neexistuje“, ale HTTP stav je 200: appka má koreňový `loading.js`, takže Next odpoveď streamuje skôr, než sa stránka vyhodnotí (rovnako ako ostatné detailné stránky appky). Vyhľadávače stránky neindexujú (`robots: noindex`).

## Návrat
Vercel: vrátiť predchádzajúci deployment. Dáta ostávajú. Odstránenie schémy (po zálohe): `drop table guide_label_issues, guide_feedback, guide_guest_emails, guide_wifi_log, guide_wifi_attempts, guide_events, guide_tips, guide_rules, guide_wifi, guide_cards, guide_units, guide_settings cascade; drop function guide_units_lock_code(); drop function guide_team();`

## Dotazník hostí (profil zákazníka)
`/g/<KÓD>/dotaznik`, karta „Pomôžte nám vás spoznať a získajte darček“ v sprievodcovi. Desať nepovinných otázok: odkiaľ, s kým, dôvod cesty, dĺžka pobytu, ako nás našli, návrat, čo je pri ubytovaní dôležité, vek, odporúčanie 1–5, odkaz. Jedenásť jazykov (SK, EN, DE, CS, PL, HU, IT, ES, FR, UK, NL), rovnaký prepínač jazykov má celý sprievodca; obsah karty bytu ostáva SK/EN (ostatné jazyky zobrazia anglický obsah). Odpovede sú anonymné (`guide_surveys`, bez IP); meno je nepovinné a slúži na spárovanie s rezerváciou, e-mail je povinný; zadaním e-mailu súhlasí s podmienkami a novinkami (bez políčka), odhlásenie v každom e-maile. Darček nastaví admin v `/sprievodca/dotaznik`: zľavový kód na priamu rezerváciu alebo digitálny odkaz; zobrazí sa až po odoslaní, v jazyku hosťa. Prehľad odpovedí po otázkach a CSV export pre marketing tamtiež.


## v2 (9. 11. 2026): obsah pre všetky byty
- **Návrh z Guesty**: `lib/guide/guesty-import.js` stiahne pre každý byt pokyny k príchodu (SK custom field + EN checkInInstructions), odchod, parkovanie, manuál, dôležité informácie, vybavenie, časy, adresu so súradnicami a Wi-Fi. `lib/guide/content.js` odstráni kódy a heslá (`stripCodes`), odhadne jazyk a zostaví sekcie; model (`lib/anthropic.js`) z toho urobí dvojjazyčné rozklikávacie sekcie (`guide_cards.sections`). Výsledok je návrh: `approved=false`, stav `review`, `source=guesty`, snímka v `guide_cards.guesty`.
- **Spustenie**: `/api/cron/guide-import?k=CRON_SECRET&limit=3` opakovane (3 byty na volanie, limit funkcie 60 s), `&force=1` prepíše neschválené, `&listing=<id>` jeden byt, `&recompute=1` prepočíta úplnosť. V appke: `/sprievodca` → „Importovať chýbajúce“, v detaile bytu „Načítať z Guesty“.
- **Verejná stránka**: akčné čipy (navigovať, zavolať, Wi-Fi, nahlásiť problém na `udrzba@live-in.international`, zdieľať), očíslované kroky príchodu, rozklikávacie sekcie (`<details>`), spoločné pravidlá LIVE-IN s nadpismi (`guide_rules.title`), kontrolný zoznam pred odchodom (lokálne v prehliadači).
- **Úplnosť** (`completeness`, 0–100): adresa 15, Wi-Fi 15, príchod 15, odchod 10, parkovanie 10, pomoc 5, ≥ 2 sekcie 15, schválenie 10, Google recenzia 5. Zoznam bytov má stĺpec a filter „incomplete“, detail má „Ďalší nedoplnený“.
- **Pilot → všetky byty**: `guide_settings.pilot.all = true` – denný beh a tlačidlo „Vydať štítky pre všetky pripravené“ vydajú štítok každému bytu so schváleným obsahom a splnenými podmienkami (`issuePlan`).
- **Zadanie pre tím**: `docs/sprievodca/DOPLNENIE-OBSAHU.md`.
