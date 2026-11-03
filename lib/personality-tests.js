// Testy osobnosti pre tím: otázky, výpočet skóre a zhrnutie. Čistý modul bez databázy (testované v tests/).
// Škála 1–5 (Vôbec nie … Určite áno). Položka s r:true je obrátená.
export const SCALE = ['Vôbec nie', 'Skôr nie', 'Ako kedy', 'Skôr áno', 'Určite áno']

const mk = (d, arr) => arr.map((t) => { const r = t.startsWith('~'); return { d, t: r ? t.slice(1) : t, r } })

const DISCQ = [
  ['D', 'Ste s partiou priateľov a nikto sa nevie rozhodnúť, kam ísť na večeru.', 'Vyberiem miesto a poviem: ideme tam.'],
  ['I', 'Prídete na oslavu, kde poznáte len jedného človeka.', 'Do hodiny sa rozprávam s polovicou miestnosti.'],
  ['S', 'Sused vás poprosí o pomoc so sťahovaním v deň, keď ste mali voľno.', 'Pomôžem, aj keď sa mi to príliš nehodí.'],
  ['C', 'Kupujete nový telefón alebo väčší spotrebič.', 'Najprv si prečítam recenzie a porovnám parametre, až potom sa rozhodnem.'],
  ['D', 'V reštaurácii vám prinesú niečo iné, než ste si objednali.', 'Hneď zavolám obsluhu a jasne poviem, čo chcem.'],
  ['I', 'Zažili ste niečo vtipné alebo zaujímavé.', 'Musím to hneď niekomu vyrozprávať, najlepšie viacerým.'],
  ['S', 'Priatelia na poslednú chvíľu menia plán na víkend.', 'Vyvedie ma to z miery, mal som už všetko premyslené.'],
  ['C', 'Skladáte nábytok alebo inštalujete niečo nové.', 'Postupujem presne podľa návodu, krok za krokom.'],
  ['D', 'Blízky človek urobil niečo, čo sa vám nepáči.', 'Poviem mu to na rovinu, aj keď to bude nepríjemné.'],
  ['I', 'Chcete niekomu vysvetliť, prečo je nejaký film alebo miesto skvelé.', 'Rozprávam s takým nadšením, že to nakoniec chce vidieť aj on.'],
  ['S', 'Pri rodinnej večeri sa dvaja začnú hádať.', 'Snažím sa situáciu upokojiť a zmieriť obe strany.'],
  ['C', 'Plánujete dovolenku.', 'Mám pripravený rozpis, rezervácie a záložný plán, keby niečo nevyšlo.'],
  ['D', 'Hráte spoločenskú hru alebo šport.', 'Hrám na výhru, prehra ma naozaj mrzí.'],
  ['I', 'Urobili ste niečo, na čo ste hrdý.', 'Poteší ma, keď si to ostatní všimnú a pochvália.'],
  ['S', 'Rozhodujete sa, ako stráviť voľný večer.', 'Najradšej mám overenú rutinu, kde viem, čo ma čaká.'],
  ['C', 'Pripravujete niečo podľa receptu.', 'Odmeriam presné množstvá, neodhadujem od oka.'],
  ['D', 'Stojíte v dlhom rade alebo čakáte na niekoho, kto mešká.', 'Rýchlo strácam trpezlivosť a hľadám, ako to urýchliť.'],
  ['I', 'Rozhodujete sa medzi dvoma možnosťami.', 'Idem skôr podľa pocitu a toho, ako to cítim, než podľa výpočtov.'],
  ['S', 'Niekto vás požiada o láskavosť, ktorá sa vám nehodí.', 'Radšej nepoviem nie, aby som nepokazil dobrý vzťah.'],
  ['C', 'Dostanete účet z obchodu alebo faktúru.', 'Prejdem si položky a sumu, či všetko sedí.'],
]

export const TESTS = {
  disc: {
    title: 'DISC', icon: '🧭', min: 5,
    desc: 'Štyri štýly správania: ako riešiš výzvy, pôsobíš na ľudí, aké tempo potrebuješ a ako pristupuješ ku kvalite.',
    dims: { D: ['Dominancia', 'Rozhodný, priamy, chce výsledky.'], I: ['Vplyv', 'Spoločenský, nadšený, presvedčivý.'], S: ['Stabilita', 'Trpezlivý, lojálny, pokojný.'], C: ['Svedomitosť', 'Presný, analytický, dôsledný.'] },
    items: DISCQ.map((q) => ({ d: q[0], s: q[1], t: q[2] })),
  },
  big5: {
    title: 'Big Five', icon: '🖐️', min: 5,
    desc: 'Päť hlavných dimenzií osobnosti: otvorenosť, svedomitosť, extraverzia, prívetivosť a citlivosť na stres.',
    dims: { O: ['Otvorenosť', 'Záujem o nové nápady a skúsenosti.'], C: ['Svedomitosť', 'Poriadok, plánovanie, dôslednosť.'], E: ['Extraverzia', 'Energia z kontaktu s ľuďmi.'], A: ['Prívetivosť', 'Ohľaduplnosť a ochota spolupracovať.'], N: ['Citlivosť na stres', 'Ako silno prežívaš napätie a obavy.'] },
    items: [
      ...mk('O', ['Rád skúšam nové a nezvyčajné veci.', 'Zaujímajú ma abstraktné nápady a teórie.', 'Predstavivosť mi pomáha riešiť problémy.', '~Radšej mám overené postupy než experimenty.', 'Rád sa učím veci mimo svojho odboru.']),
      ...mk('C', ['Svoje veci mám zvyčajne v poriadku.', 'Úlohy dokončím včas.', 'Pri práci dbám na detaily.', '~Často nechávam veci na poslednú chvíľu.', 'Najprv plánujem, potom konám.']),
      ...mk('E', ['Na večierkoch spontánne oslovujem nových ľudí.', 'Medzi ľuďmi sa nabíjam energiou.', 'Rád som stredobodom pozornosti.', '~Radšej som sám než vo veľkej skupine.', 'Rozhovor začínam rád ja.']),
      ...mk('A', ['Zaujímam sa o pocity druhých.', 'Ľahko odpúšťam.', 'Ochotne pomôžem aj bez nároku na odmenu.', '~Vo sporoch presadzujem hlavne svoj názor.', 'Dôverujem ľuďom, kým ma nesklamú.']),
      ...mk('N', ['Často sa zbytočne trápim.', 'Stres ma rýchlo vyvedie z miery.', 'Nálada sa mi počas dňa mení.', '~Zostávam pokojný aj pod tlakom.', 'Pred dôležitými udalosťami som nervózny.']),
    ],
  },
  t16: {
    title: '16 typov osobnosti', icon: '🔤', min: 6,
    desc: 'Štyri preferencie (inšpirované Jungovou typológiou) dajú štvorpísmenový typ, napríklad ENTJ.',
    dims: { E: ['Extraverzia (E) / Introverzia (I)', 'Vysoké % = E, nízke = I.'], S: ['Konkrétnosť (S) / Intuícia (N)', 'Vysoké % = S, nízke = N.'], T: ['Logika (T) / Cit (F)', 'Vysoké % = T, nízke = F.'], J: ['Plánovanie (J) / Flexibilita (P)', 'Vysoké % = J, nízke = P.'] },
    items: [
      ...mk('E', ['Energiu čerpám z rozhovorov s ľuďmi.', 'Radšej rozprávam, než počúvam.', 'Pri novej skupine ľudí sa rýchlo zapojím.', 'Dlhé obdobie osamote ma unavuje.', 'Na porade sa ozvem ako prvý.']),
      ...mk('S', ['Spoliehám sa na konkrétne fakty a skúsenosti.', 'Mám rád praktické, osvedčené riešenia.', 'Všímam si detaily okolo seba.', 'Radšej riešim to, čo je tu a teraz, než budúcnosť.', 'Pri vysvetľovaní používam konkrétne príklady.']),
      ...mk('T', ['Pri rozhodovaní rozhoduje logika viac než pocity.', 'Radšej som spravodlivý než ohľaduplný.', 'Kritiku podám priamo, aj keď zabolí.', 'Argumenty ma presvedčia viac než emócie.', 'Pri konflikte hľadám, kto má pravdu.']),
      ...mk('J', ['Mám rád jasný plán a termíny.', 'Veci dokončujem, než začnem ďalšie.', 'Bez rozvrhu sa necítim komfortne.', 'Radšej rozhodnem skoro, než nechám možnosti otvorené.', 'Ráno mám zvyčajne premyslené, čo urobím.']),
    ],
    summ: (sc) => (sc.E >= 50 ? 'E' : 'I') + (sc.S >= 50 ? 'S' : 'N') + (sc.T >= 50 ? 'T' : 'F') + (sc.J >= 50 ? 'J' : 'P'),
  },
  roly: {
    title: 'Tímové roly', icon: '🤝', min: 4,
    desc: 'Akú rolu v tíme najprirodzenejšie hráš: líder, tvorca, realizátor, spojka, analytik alebo podporovateľ.',
    dims: { L: ['Líder', 'Dáva smer a organizuje.'], T: ['Tvorca', 'Prináša nové nápady.'], R: ['Realizátor', 'Dotiahne plán do konca.'], Z: ['Spojka', 'Prepája ľudí a rokuje.'], A: ['Analytik', 'Posudzuje riziká a údaje.'], P: ['Podporovateľ', 'Stará sa o atmosféru a ľudí.'] },
    items: [
      ...mk('L', ['Prirodzene preberám organizáciu práce tímu.', 'Rád rozdeľujem úlohy podľa silných stránok ľudí.', 'Keď sa tím stráca, dám mu smer.']),
      ...mk('T', ['Prichádzam s nápadmi, ktoré iných prekvapia.', 'Rád vymýšľam nové postupy.', 'Pri problémoch hľadám nekonvenčné riešenia.']),
      ...mk('R', ['Najviac ma baví premeniť plán na hotovú vec.', 'Dotiahnem veci do konca, aj keď ma to nebaví.', 'Spoľahlivo plním dohodnuté termíny.']),
      ...mk('Z', ['Zoznamujem ľudí a prepájam tím s okolím.', 'Rád rokujem s klientmi a partnermi.', 'Rýchlo si získam dôveru nových ľudí.']),
      ...mk('A', ['Pred rozhodnutím posúdim riziká a údaje.', 'Odhalím slabé miesta v plánoch.', 'Rád porovnávam možnosti podľa faktov.']),
      ...mk('P', ['Všimnem si, keď má kolega zlý deň.', 'Starám sa o dobrú atmosféru v tíme.', 'Pomáham zmieriť protichodné názory.']),
    ],
  },
  styl: {
    title: 'Pracovný štýl', icon: '⚙️', min: 4,
    desc: 'Ako najradšej pracuješ: tempo, samostatnosť, potreba štruktúry a kontakt s kolegami.',
    dims: { T: ['Tempo', 'Vysoké % = rýchle tempo, nízke = premyslené.'], S: ['Samostatnosť', 'Vysoké % = radšej sám, nízke = radšej v tíme.'], R: ['Štruktúra', 'Vysoké % = jasné pravidlá, nízke = improvizácia.'], K: ['Kontakt s ľuďmi', 'Vysoké % = veľa komunikácie, nízke = pokoj na sústredenie.'] },
    items: [
      ...mk('T', ['Pracujem najlepšie v rýchlom tempe.', 'Radšej urobím hneď a opravím neskôr.', 'Dlhé prípravy ma spomaľujú.', '~Potrebujem čas na premyslenie pred rozhodnutím.']),
      ...mk('S', ['Najlepšie pracujem sám.', 'Nerád čakám na schválenie.', 'Dávam prednosť vlastnému postupu.', '~Radšej riešim úlohy v tíme.']),
      ...mk('R', ['Potrebujem jasné pravidlá a postupy.', 'Pracujem podľa zoznamu úloh.', 'Zmena plánu uprostred dňa ma vyruší.', '~Rád improvizujem.']),
      ...mk('K', ['Radšej riešim veci osobne než e-mailom.', 'Pri práci rád debatujem s kolegami.', 'Potrebujem pravidelnú spätnú väzbu.', '~Najlepšie sa sústredím v tichu bez rušenia.']),
    ],
  },
  hodn: {
    title: 'Kariérne hodnoty', icon: '💎', min: 4,
    desc: 'Čo ťa v práci najviac motivuje: peniaze, sloboda, zmysel, istota, rast, uznanie, vzťahy alebo výzva.',
    dims: { Z: ['Zárobok', 'Dobrý príjem a odmena.'], S: ['Sloboda', 'Samostatnosť pri práci.'], M: ['Zmysel', 'Pomáhať a robiť zmysluplné veci.'], I: ['Istota', 'Stabilita a predvídateľnosť.'], R: ['Rast', 'Učenie a rozvoj.'], U: ['Uznanie', 'Postavenie a viditeľnosť.'], V: ['Vzťahy', 'Dobrý kolektív.'], X: ['Výzva', 'Náročné ciele a zmena.'] },
    items: [
      ...mk('Z', ['Dobrý príjem je pre mňa v práci najdôležitejší.', 'Som ochotný pracovať viac za vyššiu odmenu.']),
      ...mk('S', ['Chcem si sám určovať, kedy a ako pracujem.', 'Pracovná sloboda je pre mňa cennejšia ako titul.']),
      ...mk('M', ['Práca má pre mňa zmysel, ak pomáha druhým.', 'Chcem robiť niečo, na čom mi naozaj záleží.']),
      ...mk('I', ['Stabilná pozícia a pravidelný príjem sú pre mňa kľúčové.', 'Neistota v práci mi veľmi vadí.']),
      ...mk('R', ['Chcem sa v práci neustále učiť.', 'Rozvoj zručností je pre mňa dôležitejší než odmena.']),
      ...mk('U', ['Záleží mi na uznaní a na tom, aby moju prácu ostatní videli.', 'Rád postupujem na vyššie pozície.']),
      ...mk('V', ['Dobrý kolektív je pre mňa dôležitejší než plat.', 'Rád pracujem s ľuďmi, ktorých mám rád.']),
      ...mk('X', ['Ťahajú ma náročné ciele.', 'Nudí ma rutina, potrebujem výzvy.']),
    ],
  },
}

export const TEST_KEYS = ['disc', 'big5', 't16', 'roly', 'styl', 'hodn']

/** Overí odpovede: pole celých čísel 1–5 s dĺžkou podľa testu. */
export function validAnswers(key, answers) {
  const T = TESTS[key]
  if (!T || !Array.isArray(answers) || answers.length !== T.items.length) return false
  return answers.every((v) => Number.isInteger(v) && v >= 1 && v <= 5)
}

/** Skóre 0–100 % pre každú dimenziu. */
export function score(key, answers) {
  const T = TESTS[key]
  const sum = {}, n = {}
  T.items.forEach((it, i) => { let v = answers[i]; if (it.r) v = 6 - v; sum[it.d] = (sum[it.d] || 0) + v; n[it.d] = (n[it.d] || 0) + 1 })
  const out = {}
  for (const d of Object.keys(sum)) out[d] = Math.round((sum[d] - n[d]) / (4 * n[d]) * 100)
  return out
}

/** Krátke zhrnutie: typ (16 typov) alebo dve najsilnejšie dimenzie. */
export function summary(key, sc) {
  const T = TESTS[key]
  if (T.summ) return T.summ(sc)
  return Object.keys(sc).sort((a, b) => sc[b] - sc[a]).slice(0, 2).map((x) => T.dims[x][0]).join(' + ')
}

/** Najnovší výsledok pre každú dvojicu používateľ + test. */
export function latest(rows) {
  const m = {}
  for (const r of rows || []) { const k = r.user_id + '|' + r.test_key; if (!m[k] || m[k].created_at < r.created_at) m[k] = r }
  return Object.values(m)
}

/** Dimenzie zoradené podľa skóre (na stĺpce vo výsledku). */
export function ranked(key, sc) {
  const T = TESTS[key]
  return Object.keys(T.dims).sort((a, b) => (sc[b] || 0) - (sc[a] || 0)).map((d) => ({ d, name: T.dims[d][0], help: T.dims[d][1], pct: sc[d] || 0 }))
}
