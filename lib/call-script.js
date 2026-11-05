/**
 * Skript hovoru s majiteľom bytu (lead). Jediný zdroj pravdy pre CRM (Jeden naraz, detail leadu, /crm/skript) aj pre Guru.
 * Fakty sú z webu live-in.international (Ceny a rozsah, Otázky majiteľov, Ako spolupráca funguje) a z KB. Keď sa zmení cena alebo postup, zmeň to tu.
 */
export const SCRIPT_VERSION = '5. 11. 2026'

export const PRE_CALL = [
  'Pozri pôvod leadu a zdroj (web formulár, Facebook/Instagram, odporúčanie). Podľa toho zvoľ úvod.',
  'Pozri mesto. Bratislava a Košice: ideme naplno. Iné mesto: vypočuj, zapíš, nesľubuj správu, povedz, že preveríme možnosti.',
  'Prečítaj poznámku a históriu. Ak už niekto volal, nadviaž na to, nezačínaj odznova.',
  'Maj po ruke kalkulačku: live-in.international/kalkulacka a formulár posúdenia: live-in.international/posudenie.',
  'Cieľ hovoru nie je predať po telefóne. Cieľ je dohodnúť ďalší krok: posúdenie bytu, obhliadku alebo zaslanie ponuky.',
]

export const OPENINGS = [
  { when: 'Webový formulár / posúdenie bytu', text: 'Dobrý deň, pri telefóne [meno] z LIVE-IN. Poslali ste nám cez web informácie o Vašom byte v [mesto]. Volám, aby sme si prešli, čo od prenájmu očakávate a čo by sme pre Vás vedeli zabezpečiť. Máte teraz 5 minút?' },
  { when: 'Facebook / Instagram (reklama, správa)', text: 'Dobrý deň, [meno] z LIVE-IN, správa prenájmov v Bratislave a Košiciach. Reagovali ste na našu ponuku na Facebooku. Rád/rada by som sa opýtal/a na Váš byt, aby sme Vám vedeli povedať, či a ako by sme ho vedeli spravovať. Hodí sa Vám to teraz?' },
  { when: 'Odporúčanie od klienta', text: 'Dobrý deň, [meno] z LIVE-IN. Ozývam sa na odporúčanie [kto odporučil], spravujeme mu/jej byt. Vraj zvažujete prenájom svojho bytu a chceli by ste vedieť, ako to u nás funguje.' },
  { when: 'Nedvíha (SMS po 1. pokuse)', text: 'Dobry den, [meno] z LIVE-IN (sprava prenajmov). Volal/a som ohladom Vasho bytu v [mesto]. Kedy Vam mozem zavolat? Alebo odpovedzte tu. Dakujem.' },
]

export const QUALIFY = [
  { q: 'Kde presne je byt? (mesto, časť, ulica)', why: 'Bratislava a Košice sú naše mestá. Lokalita rozhoduje o výnose aj o tom, či vôbec.' },
  { q: 'Aký je to byt? (izby, výmera, poschodie, výťah, parkovanie)', why: 'Rozhoduje o cene za noc a o tom, akí hostia prídu.' },
  { q: 'V akom je stave a je zariadený?', why: 'Krátkodobý prenájom potrebuje kompletné vybavenie. Ak nie je, bavíme sa o príprave bytu a jej rozpočte.' },
  { q: 'Čo je pre Vás najdôležitejšie: najvyšší príjem, žiadne starosti, alebo možnosť byt sám používať?', why: 'Podľa toho odporúčame krátkodobú správu, dlhodobú správu alebo nájomný model.' },
  { q: 'Odkedy by bol byt k dispozícii?', why: 'Termín štartu. Ak je voľný hneď, uprednostni obhliadku v najbližších dňoch.' },
  { q: 'Prenajímali ste už? Cez Airbnb, Booking alebo dlhodobo?', why: 'Skúsený majiteľ chce čísla a porovnanie. Začiatočník chce istotu a postup.' },
  { q: 'Rozhodujete o byte sám/sama, alebo s niekým?', why: 'Ak rozhoduje partner alebo rodina, ponúkni obhliadku s nimi.' },
]

export const FAQ = [
  { g: 'Cena a peniaze', items: [
    { q: 'Koľko stojí krátkodobá správa?', a: 'Provízia za krátkodobú správu je 17 % z príjmu z pobytov (Rental Income). V ponuke presne uvedieme základ výpočtu a náklady, ktoré sa účtujú samostatne: upratovanie a bielizeň, poplatky platforiem (Airbnb, Booking), energie, spotrebný materiál, údržba a príprava bytu. Realitné služby (predaj, kúpa) majú vlastnú odmenu.' },
    { q: 'Koľko zarobím?', a: 'Nehovorte konkrétne číslo po telefóne. Povedzte: „Záleží na lokalite, veľkosti, vybavení a období roka. Na webe máme kalkulačku, kde si viete nastaviť vlastný scenár. Po posúdení bytu Vám pošleme konkrétny odhad.“ Kalkulačka pracuje s priemermi z našich bytov v Bratislave a Košiciach.' },
    { q: 'Je krátkodobý prenájom vždy výnosnejší ako dlhodobý?', a: 'Nie pri každom byte. Rozhoduje príjem po nákladoch, obsadenosť a priebeh roka. Preto najprv posúdime konkrétny byt a porovnáme obe možnosti.' },
    { q: 'Kedy a ako dostanem peniaze?', a: 'Mesačne. Dostanete vyúčtovanie, kde je oddelene príjem z pobytov, jednotlivé náklady, provízia a suma pre majiteľa. Presný deň a spôsob je v zmluve.' },
    { q: 'Platím niečo vopred? Sú nejaké skryté poplatky?', a: 'Posúdenie bytu je bezplatné. Pred podpisom poznáte rozsah služby, cenu a všetky samostatne účtované položky. Nič, čo nie je v ponuke, sa neúčtuje.' },
    { q: 'Ponúkate garantovaný / fixný nájom?', a: 'Fixný nájom posudzuje vedenie individuálne, nie je automatickou súčasťou správy. Pri vhodnom byte vieme pripraviť nájomný model, kde LIVE-IN vystupuje ako nájomca. Nesľubujte výšku ani dostupnosť. Zapíšte záujem a odovzdajte Júliusovi alebo Patrikovi.' },
    { q: 'Čo DPH a dane?', a: 'V ponuke uvedieme, či sú sumy s DPH alebo bez. Daňové otázky majiteľa (príjem z prenájmu) neriešime, odporučte účtovníka. Kalkulačka na webe počíta s 5 % DPH z príjmu a so softvérom Guesty 50 € mesačne.' },
  ] },
  { g: 'Čo pre majiteľa robíme', items: [
    { q: 'Čo všetko zahŕňa krátkodobá správa?', a: 'Prípravu bytu a home staging podľa dohodnutého rozpočtu, profesionálne fotografie, inzeráty na Airbnb a Booking.com, rezervácie a dynamické ceny cez PriceLabs, komunikáciu s hosťami a pokyny na príchod, upratovanie a bielizeň medzi pobytmi, koordináciu údržby a mesačný prehľad príjmov, nákladov a obsadenosti.' },
    { q: 'A dlhodobá správa?', a: 'Pripravíme prezentáciu bytu, obhliadky so záujemcami, výber nájomníka a dokumentáciu, odovzdávací protokol so stavmi meračov. Počas nájmu podľa dohody sledujeme platby, komunikujeme s nájomníkom, koordinujeme údržbu a kontroly. Cena je v individuálnej ponuke.' },
    { q: 'Kto komunikuje s hosťami?', a: 'My. Podpora hostí je denne od 8:00 do 22:00, check-in o 16:00, check-out o 11:00 (podľa bytu 10:00). Majiteľ s hosťami nekomunikuje.' },
    { q: 'Kto rieši upratovanie a opravy?', a: 'Upratovanie a bielizeň koordinujeme my, máme vlastnú práčovňu a tím. Opravy riešime podľa schváleného rozsahu a rozpočtu, ktorý si dohodneme pred začiatkom. Väčšie náklady majiteľ schvaľuje.' },
    { q: 'Čo keď hosť niečo poškodí?', a: 'Škody evidujeme s fotodokumentáciou a riešime s hosťom cez platformu (Airbnb a Booking majú vlastné mechanizmy). Byt má pri vchode kameru a kódové zámky s logom. Detaily poistenia a zodpovednosti sú v zmluve, nesľubujte konkrétnu náhradu.' },
    { q: 'Budem mať prehľad, čo sa v byte deje?', a: 'Áno. Mesačné vyúčtovanie s príjmami, nákladmi a obsadenosťou. Pri bežnej požiadavke alebo poruche viete, koho kontaktovať.' },
  ] },
  { g: 'Ako spolupráca prebieha', items: [
    { q: 'Ako to prebieha od začiatku?', a: '1. Spoznáme byt (mesto, parametre, cieľ, podľa situácie obhliadka). 2. Porovnáme vhodné možnosti. 3. Dohodneme podmienky: rozsah, cena, vyúčtovanie, schvaľovanie nákladov. 4. Pripravíme byt a prezentáciu, odovzdanie zdokumentujeme. 5. Spustíme správu. 6. Sledujeme výsledky a navrhujeme úpravy.' },
    { q: 'Ako rýchlo môžeme začať?', a: 'Závisí od pripravenosti bytu. Zariadený byt v dobrom stave vieme spustiť do pár týždňov, konkrétny plán si stanovíme po posúdení. Nesľubujte dátum po telefóne.' },
    { q: 'Ako vyzerá zmluva?', a: 'Dva mechanizmy: zmluva o správe (byt zostáva prenajímať majiteľ, my spravujeme) alebo nájomný model (LIVE-IN je nájomca a prevádzkuje byt, podmienky tvorí nájomná zmluva a všeobecné nájomné podmienky). Pred podpisom si vysvetlíme výpočet, energie, odovzdanie, osobné využitie a ukončenie.' },
    { q: 'Ako prebieha odovzdanie bytu?', a: 'Kľúče a prístupy potvrdíme samostatne. Stav bytu a vybavenia zdokumentujeme videozáznamom, ak energie hradí LIVE-IN, zapíšeme aj stavy meračov.' },
    { q: 'Môžem spoluprácu ukončiť?', a: 'Áno, pravidlá ukončenia a výpovedná lehota sú v zmluve a prejdeme ich pred podpisom. Existujúce rezervácie hostí treba rešpektovať.' },
  ] },
  { g: 'Byt a vybavenie', items: [
    { q: 'Musí byť byt zariadený?', a: 'Pre krátkodobé pobyty áno, kompletne: postele, kuchyňa, spotrebiče, Wi-Fi, bielizeň. Pri posúdení prejdeme stav a navrhneme, čo doplniť. Nákup vybavenia nie je v provízii, rozsah a rozpočet dohodneme.' },
    { q: 'Ktorý model je pre môj byt vhodný?', a: 'Závisí od lokality, stavu, vybavenia, dostupnosti a cieľa. Centrum a dobre vybavený byt: krátkodobo. Byt mimo centra, nezariadený alebo majiteľ chce kľud: dlhodobo. Výsledok dáme po posúdení.' },
    { q: 'Môžem byt používať aj sám?', a: 'Dá sa to dohodnúť vopred podľa modelu a existujúcich rezervácií. Zapíšte, koľko dní v roku a kedy, ide to do ponuky.' },
    { q: 'Čo musí byť v byte pred prvým hosťom?', a: 'Na webe máme článok „Byt pripravený pre prvého hosťa“ a „Čo pripraviť pred odovzdaním bytu do správy“. Pošlite odkaz e-mailom: live-in.international/poradna.' },
  ] },
  { g: 'Iné mestá, predaj, firmy', items: [
    { q: 'Byt je v Trnave / Nitre / inom meste.', a: 'Správu ponúkame v Bratislave a Košiciach. Zapíšte dopyt, povedzte, že preveríme možnosti a ozveme sa. V appke nastavte mesto na správnu hodnotu, nech sa to nepočíta do našej úspešnosti.' },
    { q: 'Chcem byt predať alebo kúpiť.', a: 'Predaj a kúpu riešime samostatnou realitnou službou s vlastnou odmenou. Odovzdajte Júliusovi. Ak je byt prenajatý, postup prispôsobíme existujúcim dohodám.' },
    { q: 'Mám viac bytov / som developer alebo firma.', a: 'Výborne, zapíšte počet a lokality a odovzdajte vedeniu (Július, Patrik). Portfóliá riešime individuálne.' },
  ] },
  { g: 'Námietky', items: [
    { q: '„17 % je veľa.“', a: 'Porovnajte celok, nie percento: ceny za noc cez dynamické ceny, obsadenosť, žiadna práca s hosťami, upratovanie a údržba vyriešené. Ponúknite kalkulačku a konkrétny odhad po posúdení. Nezľavujte z provízie, to je rozhodnutie vedenia.' },
    { q: '„Spravujem si to sám.“', a: 'Opýtajte sa, koľko času to berie a aká je obsadenosť. Ponúknite bezplatné posúdenie ako porovnanie: ak to vychádza lepšie u nás, uvidí to v číslach.' },
    { q: '„Bojím sa, že mi hostia zničia byt.“', a: 'Kamera pri vchode, kódové zámky, overení hostia cez platformy, fotodokumentácia po každom pobyte, domáci poriadok s postupom pri porušení. Riešime to denne na 130+ bytoch.' },
    { q: '„Ešte si to rozmyslím.“', a: 'V poriadku. Dohodnite konkrétny termín, kedy zavoláte znova, a pošlite e-mailom zhrnutie s odkazom na kalkulačku a poradňu. Zapíšte pripomienku do appky.' },
    { q: '„Pošlite mi to e-mailom.“', a: 'Pošlite, ale najprv sa opýtajte 2 až 3 kvalifikačné otázky (mesto, byt, cieľ), inak e-mail nemá čo obsahovať. Dohodnite, kedy zavoláte.' },
  ] },
]

export const CLOSING = [
  'Zhrňte: „Takže máte [byt] v [mesto], chcete [cieľ]. Ďalší krok je [posúdenie / obhliadka / ponuka].“',
  'Dohodnite konkrétny termín a kto sa ozve. Obhliadku v Bratislave zabezpečuje tím BA, v Košiciach Patrik a tím KE.',
  'Hneď po hovore zapíšte do appky: štádium (Kontaktovaný / Obhliadka / Ponuka), poznámku z hovoru a mesto. Appka to zapíše do HubSpotu aj Asany.',
  'Ak lead nie je relevantný (nemá byt, spam, chce niečo iné), odkliknite „Nie je lead“ s dôvodom.',
]

export const NEVER = [
  'Nesľubujte konkrétny výnos, obsadenosť ani dátum spustenia. Vždy „po posúdení bytu“.',
  'Nesľubujte fixný nájom, zľavu z provízie ani náhradu škody. To rozhoduje vedenie.',
  'Nezdieľajte cenové minimá, interné čísla ani údaje iných majiteľov.',
  'S majiteľmi hovoríme formálne (vykanie). WhatsApp a SMS bez diakritiky.',
  'Eskalácia: predaj a kúpa, fixný nájom, portfóliá, sťažnosti → Július. Košice a financie → Patrik. Zmluvy a faktúry → Simona.',
]

export const FOLLOWUP = [
  '1. pokus: zavolať do jedného pracovného dňa od prijatia (lehota v appke).',
  'Nedvíha: hneď SMS (šablóna vyššie) a štádium Kontaktovaný s poznámkou „Nedvíha, poslaná SMS“.',
  '2. pokus: nasledujúci pracovný deň v inom čase (ráno vs. podvečer).',
  '3. pokus: o 3 dni + e-mail so zhrnutím a odkazom na kalkulačku.',
  'Po 3 neúspešných pokusoch: štádium Stratený, dôvod „Nedovolali sme sa“. Lead ostáva v Kontaktoch.',
]
