/** Marketingový plán 2027 „Cesta k najväčším na Slovensku“ (živý dokument, 4. 11. 2026). Dáta pre stránku /plan, domov a Guru. */
export const PLAN_KEY = 'marketing-2027'
export const PLAN_PDF = '/plan/marketingovy-plan-2027.pdf'
export const PLAN = {
  title: 'Cesta k najväčším na Slovensku.',
  subtitle: 'Ako sa zo ~130 bytov dostaneme na koniec roka 2027. Čo urobíme, v akom poradí a čo nás na konci čaká.',
  version: 'Živý dokument · 4. 11. 2026 · vlastník plánu Július',
  vision: 'Byť najväčší na Slovensku tak, aby vyhrali všetci, ktorí s nami pracujú.',
  winners: [
    { icon: '🔑', who: 'Majitelia', what: 'Vyšší čistý príjem a pokoj. Odovzdajú kľúče a vidia, čo im zostáva.' },
    { icon: '💚', who: 'Hostia', what: 'Čisto, jasné pokyny, rýchla pomoc. Vracajú sa a píšu dobré recenzie.' },
    { icon: '👥', who: 'Tím', what: 'Jasné procesy, férové podmienky a značka, na ktorú sú ľudia hrdí.' },
    { icon: '🤝', who: 'Partneri', what: 'Makléri, poradcovia a tvorcovia, ktorí svojim klientom ponúknu istotu.' },
  ],
  loop: ['Obsah ukazuje, ako to robíme', 'Majiteľ nás kontaktuje', 'Rastieme', 'Lepšie ceny, nástroje, ľudia'],
  feeling: '„Wau, ty pracuješ s LIVE-IN? Prečo ešte nie sme s nimi aj my?“',
  numbers: { start: 69, now: 130, base: 250, goal: 310, growth: 370, ambition: 400, paceNow: 8, paceBase: 10, paceGoal: 15, paceGrowth: 20 },
  sources: [
    { pct: 50, name: 'Sociálne siete a Meta reklamy', color: '#F46D16' },
    { pct: 20, name: 'Web a Google', color: '#173E2C' },
    { pct: 15, name: 'Odporúčania majiteľov', color: '#2F6B4F' },
    { pct: 15, name: 'Partneri a makléri', color: '#FFB27A' },
  ],
  videos: [
    { n: 1, name: 'Obsadené: epizóda', desc: 'Ľudia za značkou, humor z reálnych situácií' },
    { n: 1, name: 'Séria dôkazov', desc: 'Kam išlo každé euro, byt v centre vs. mimo' },
    { n: 3, name: 'Reels z prevádzky', desc: 'Príchod hosťa, upratovanie, premena bytu' },
    { n: 1, name: 'Majitelia a otázky', desc: 'Odpovede na to, čo sa majitelia pýtajú' },
    { n: 1, name: 'Tip pre majiteľov', desc: 'Ceny, sezóna, čo zvýši výsledok' },
  ],
  budget: [['Správa sietí, 30 videí', 1500], ['Obsadené (navyše)', 1200], ['Správca reklám', 350], ['Reklamy (500–1 000 €)', 750]],
  engines: [
    { icon: '▶️', tag: 'Motor č. 1', name: 'Sociálne siete a reklamy', desc: 'Denný obsah, séria dôkazov a Meta reklamy. Z každého videa musí byť jasné, čo majiteľ získa a ako to vidí vo výkaze.', measure: 'dopyty a cena za spustený byt podľa videa', main: true },
    { icon: '📅', tag: 'Vlog', name: 'Obsadené', desc: 'Dopĺňa sociálne siete. Ukazuje ľudí a reálne situácie.', measure: 'dokončené epizódy, odpovede majiteľov' },
    { icon: '🌐', tag: 'Hľadanie', name: 'Web a Google', desc: 'Jedna veta a tlačidlo „Posúdiť môj byt“. Nájdu nás tí, ktorí už hľadajú správcu.', measure: 'hľadanie značky, dopyty z webu' },
    { icon: '🤝', tag: 'Spolupráca', name: 'Partneri', desc: 'Makléri, účtovníci, poradcovia a tvorcovia. Odmena len za spustený byt, každý má vlastný QR kód.', measure: 'spustené byty podľa QR a UTM' },
    { icon: '💚', tag: 'Doplnok', name: 'Odporúčania', desc: 'Majiteľ odporúča majiteľa s transparentnou odmenou.', measure: 'podiel dopytov z odporúčaní' },
  ],
  funnel: [
    { n: 1, name: 'Zaujmeme', desc: 'Video alebo reklama na sociálnych sieťach', tools: 'Instagram · Facebook' },
    { n: 2, name: 'Dopyt', desc: 'Formulár, správa alebo telefón', tools: 'Meta · Zapier · 3CX' },
    { n: 3, name: 'Posúdenie bytu', desc: 'Kalkulačka výnosnosti a rozhovor', tools: 'HubSpot' },
    { n: 4, name: 'Zmluva', desc: 'Jasné podmienky písomne', tools: 'Asana' },
    { n: 5, name: 'Spustený byt', desc: 'Fotenie, listing, prvý hosť', tools: 'Guesty · PriceLabs' },
  ],
  steps: [
    { n: 1, when: 'nov–dec 2026', name: 'Základ', items: ['Nástroje prepojené', 'UTM a QR kódy', 'Vzorový výkaz'], result: 'Merateľné nástroje, tím v novom vzhľade' },
    { n: 2, when: 'jan–mar 2027', name: 'Odhalenie', items: ['Nová značka všade', 'Obsadené beží', 'Reklamy na plný výkon'], result: 'Prvé spustené byty z kampane' },
    { n: 3, when: 'apr–jún 2027', name: 'Škálovanie', items: ['Séria dôkazov', 'Partneri a odporúčania', 'Rast v rytme kapacity'], result: 'Tempo 15 bytov mesačne' },
    { n: 4, when: 'júl–dec 2027', name: 'Líderstvo', items: ['Ročné porovnania', 'Tempo až 20 mesačne', 'Aktívne byty k dátumu'], result: '~310 bytov a rozhodnutie pre 2028' },
  ],
  success: [['~310', 'apartmánov v správe'], ['15', 'nových bytov mesačne'], ['1.', 'zdroj: sociálne siete'], ['↓', 'cena za spustený byt']],
  successSigns: ['Značku poznajú podľa tváre: videá z prevádzky sa zdieľajú.', 'Každý výkaz včas a jasný: majiteľ vidí, kam išlo každé euro.', 'Marketing je merateľný: vieme, ktoré video prinieslo byt.', 'Nehľadáme, nájdu nás: na Googli aj Instagrame podľa mena.', 'Partneri za nami chodia: odporúčajú LIVE-IN, lebo to pomáha ich klientom.', 'Tím je hrdý: jasné roly, férové podmienky, značka.'],
  sentence: 'Každodennú prevádzku riešime my. Vy vidíte, čo Vám zostáva.',
  proof: ['Príjem z pobytov', 'Provízia', 'Upratovanie a prevádzka', 'Poplatky platformám', 'Vám zostáva'],
  traffic: [
    { color: '#1E8A5A', name: 'Zelená: zrýchliť', when: ['Onboarding stíha termíny', 'Výkazy chodia včas', 'Incidenty sa riešia v deň'], then: 'Zvyšujeme reklamy, otvárame partnerstvá, tempo o schod vyššie.' },
    { color: '#F46D16', name: 'Oranžová: držať', when: ['Fronta leadov je dlhšia ako kapacita', 'Pár výkazov mešká'], then: 'Reklama ostáva, riešime príčinu.' },
    { color: '#C23B3B', name: 'Červená: brzdiť', when: ['Hromadia sa neriešené incidenty', 'Majitelia sa sťažujú na komunikáciu'], then: 'Reklamu znižujeme, kým nenapravíme prevádzku.' },
  ],
  rule: 'Marketingový výdavok sa riadi prevádzkovou kapacitou, nie naopak. Kvalita je naša značka a bez nej by rýchly rast nemal zmysel.',
  brand: [['Zelená', '#173E2C', '#fff'], ['Oranžová', '#F46D16', '#fff'], ['Broskyňová', '#FFB27A', '#173E2C'], ['Krémová', '#F6F2EA', '#173E2C']],
  brandSteps: [['do 4. 1.', 'Najprv základ', 'Web, profily, podpisy a tím v novom vzhľade.'], ['4.–18. 1.', 'Odhalenie', '„Takto teraz vyzeráme“ s ľuďmi, nie s grafikou.'], ['jan–feb', 'Všade naraz', 'Meta reklamy, billboardy s QR, karty pre partnerov.'], ['mar–jún', 'Dôkaz naživo', 'Otvorený deň, výkazy majiteľom, referencie, ročné porovnania.']],
  teamRoles: [['Property manažéri', 'výkazy, referencie, odpovede majiteľom'], ['Zákaznícky servis', 'odpoveď do jedného pracovného dňa'], ['Práčovňa a údržba', 'kvalita, ktorú ukazujeme v obsahu'], ['Marketing a vedenie', 'posolstvo, obsah, čísla, vlastník plánu']],
  first30: [
    { t: 'T1', by: 'do 11. 11.', items: ['Vlastník plánu', 'Manuál posolstva na 1 stranu', '10 majiteľov na referencie'] },
    { t: 'T2', by: 'do 18. 11.', items: ['Vzorový anonymizovaný výkaz', 'Register tvrdení', 'Casting Obsadené, 6 šablón'] },
    { t: 'T3', by: 'do 25. 11.', items: ['3 referencie so súhlasom', 'Matica 5 konkurentov', 'Web: jedna veta a tlačidlo'] },
    { t: 'T4', by: 'do 4. 12.', items: ['Prepojiť Instagram, Facebook a Analytics', 'UTM a QR kódy', 'Prvý 30-dňový test'] },
  ],
  metrics: [['Nové byty mesačne', 'cieľ 10, potom 15, potom 20'], ['Cena za spustený byt', 'hlavná marketingová metrika'], ['Podiel dopytov zo sociálnych sietí', 'cieľ 50 %'], ['Aktívne byty k dátumu', 'čisté číslo po kontrole'], ['Retencia majiteľov', 'a dôvody odchodov'], ['Hľadanie značky', 'Google, Instagram, web']],
  owners: [['Július', 'vlastník značky a posolstva'], ['Patrik', 'čísla a overenie tvrdení'], ['Prevádzka', 'dodanie sľubu'], ['Marketingový tím', 'tvorba a distribúcia']],
  rhythm: ['Mesačne 45 minút: čo sľubujeme, čo dokazujeme, čo dodávame', 'Každý pondelok: radar trendov a konkurencie', 'Plán po každom mesiaci vylepšujeme'],
  closing: 'Staviame značku, pre ktorú je výhra majiteľa, hosťa, kolegu aj partnera tá istá výhra.',
}
/** Zaujímavosti z plánu do pásu na domove. */
export const PLAN_FACTS = [
  { icon: '🚀', text: 'Marketingový plán 2027: z ~130 bytov na ~310 do konca roka 2027. Tempo 15 nových bytov mesačne.' },
  { icon: '▶️', text: 'Motor číslo 1 sú sociálne siete: 30 videí mesačne a reklamy, ktoré ich rozšíria. Polovica nových majiteľov má prísť odtiaľ.' },
  { icon: '💬', text: 'Naša veta pre majiteľov: „Každodennú prevádzku riešime my. Vy vidíte, čo Vám zostáva.“' },
  { icon: '🚦', text: 'Plyn pridávame, len keď má tím kapacitu: zelená zrýchliť, oranžová držať, červená brzdiť.' },
  { icon: '⚡', text: 'Na každý dopyt odpovedáme do jedného pracovného dňa. Lead nesmie čakať.' },
]
