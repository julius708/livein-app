// Tímový pohľad na testy osobnosti: mapa tímu, podobnosť ľudí, priemery a vysvetlenia. Čistý modul (testované v tests/).
import { TESTS } from './personality-tests.js'

/** Farby pre ľudí na mape (zelená appky, oranžová a doplnkové tóny). */
export const PALETTE = ['#173E2C', '#F46D16', '#2F6FB5', '#8E44AD', '#C2185B', '#00897B', '#6D4C41', '#E0A106', '#3949AB', '#D84315', '#558B2F', '#5E35B1', '#00838F', '#AD1457', '#4E342E', '#1565C0']
export const personColor = (i) => PALETTE[i % PALETTE.length]

/** Osi mapy pre každý test: funkcia dá hodnotu -1…1 zo skóre, popisky sú konce osí (vľavo/vpravo, dole/hore). */
export const AXES = {
  disc: {
    x: { f: (s) => (v(s.I) + v(s.S) - v(s.D) - v(s.C)) / 200, labels: ['Úlohy a fakty', 'Ľudia a vzťahy'] },
    y: { f: (s) => (v(s.D) + v(s.I) - v(s.S) - v(s.C)) / 200, labels: ['Pokojné tempo', 'Rýchle tempo'] },
    corners: ['D · Dominancia', 'I · Vplyv', 'S · Stabilita', 'C · Svedomitosť'],
    how: 'Vpravo sú ľudia orientovaní na vzťahy, vľavo na úlohy. Hore je rýchle tempo a rozhodnosť, dole pokoj a dôslednosť. Kto je blízko seba, pracuje podobne.',
  },
  big5: {
    x: { f: (s) => (v(s.E) - 50) / 50, labels: ['Introvert', 'Extrovert'] },
    y: { f: (s) => (v(s.O) - 50) / 50, labels: ['Overené postupy', 'Nové nápady'] },
    how: 'Vpravo sú ľudia, ktorých nabíja kontakt s ľuďmi, vľavo tí, čo potrebujú viac pokoja. Hore sú otvorení novému, dole tí, čo radšej stavajú na overenom.',
  },
  t16: {
    x: { f: (s) => (v(s.E) - 50) / 50, labels: ['I · Introverzia', 'E · Extraverzia'] },
    y: { f: (s) => (v(s.J) - 50) / 50, labels: ['P · Flexibilita', 'J · Plánovanie'] },
    how: 'Vpravo extraverti, vľavo introverti. Hore ľudia s plánom a termínmi, dole tí, čo radi nechávajú možnosti otvorené. Písmená S/N a T/F sú v karte každého človeka.',
  },
  roly: {
    x: { f: (s) => (v(s.Z) + v(s.P) + v(s.L) - v(s.A) - v(s.R) - v(s.T)) / 300, labels: ['Práca a analýza', 'Ľudia a prepájanie'] },
    y: { f: (s) => (v(s.L) + v(s.T) + v(s.Z) - v(s.R) - v(s.A) - v(s.P)) / 300, labels: ['Podporuje a dokončuje', 'Rozbieha a vedie'] },
    how: 'Hore sú tí, čo veci rozbiehajú (líder, tvorca, spojka), dole tí, čo ich dotiahnu a podržia tím (realizátor, analytik, podporovateľ). Dobrý tím má oboje.',
  },
  styl: {
    x: { f: (s) => (v(s.K) - 50) / 50, labels: ['Pokoj na sústredenie', 'Veľa komunikácie'] },
    y: { f: (s) => (v(s.T) - 50) / 50, labels: ['Premyslené tempo', 'Rýchle tempo'] },
    how: 'Vpravo ľudia, čo radi riešia veci naživo a často, vľavo tí, čo potrebujú ticho. Hore rýchle tempo („urobím hneď“), dole premyslené („najprv rozmyslím“).',
  },
  hodn: {
    x: { f: (s) => (v(s.M) + v(s.V) - v(s.Z) - v(s.U)) / 200, labels: ['Zárobok a uznanie', 'Zmysel a vzťahy'] },
    y: { f: (s) => (v(s.X) + v(s.R) - v(s.I) - v(s.S)) / 200, labels: ['Istota a sloboda', 'Výzva a rast'] },
    how: 'Vpravo motivuje zmysel práce a kolektív, vľavo odmena a postavenie. Hore ľudia, ktorých ťahajú výzvy a učenie, dole tí, čo chcú istotu a vlastné tempo.',
  },
}
const v = (x) => (typeof x === 'number' ? x : 0)
const clamp = (x) => Math.max(-1, Math.min(1, x))

/** Pozícia človeka na mape testu: x, y v rozsahu -1…1. */
export function position(key, scores) {
  const a = AXES[key]
  if (!a || !scores) return { x: 0, y: 0 }
  return { x: clamp(a.x.f(scores)), y: clamp(a.y.f(scores)) }
}

/** Podobnosť dvoch výsledkov v % (100 = rovnaké skóre vo všetkých dimenziách). */
export function similarity(key, a, b) {
  const dims = Object.keys(TESTS[key].dims)
  if (!a || !b) return 0
  const diff = dims.reduce((acc, d) => acc + Math.abs(v(a[d]) - v(b[d])), 0) / dims.length
  return Math.round(100 - diff)
}

/** Priemer tímu pre každú dimenziu. */
export function teamAverage(key, list) {
  const dims = Object.keys(TESTS[key].dims)
  const out = {}
  for (const d of dims) out[d] = list.length ? Math.round(list.reduce((acc, p) => acc + v(p.scores[d]), 0) / list.length) : 0
  return out
}

/** Všetky dvojice zoradené od najpodobnejšej: [{a, b, sim}]. */
export function pairs(key, list) {
  const out = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push({ a: list[i], b: list[j], sim: similarity(key, list[i].scores, list[j].scores) })
  return out.sort((p, q) => q.sim - p.sim)
}

/** Dimenzie, v ktorých sa dvaja ľudia najviac zhodujú a najviac líšia. */
export function compare(key, a, b) {
  const T = TESTS[key]
  const rows = Object.keys(T.dims).map((d) => ({ d, name: T.dims[d][0], a: v(a[d]), b: v(b[d]), diff: Math.abs(v(a[d]) - v(b[d])) }))
  const sorted = [...rows].sort((p, q) => p.diff - q.diff)
  return { rows, same: sorted.slice(0, 2), differ: sorted.slice(-2).reverse() }
}

/** Čo znamená silná dimenzia pre spoluprácu (krátke, praktické). */
export const COLLAB = {
  disc: { D: 'Chce rýchle rozhodnutia a výsledky. Hovor stručne, k veci, nechaj mu voľnosť.', I: 'Potrebuje kontakt a nadšenie. Rozprávaj sa, oceň nápady, dohody si zapíšte.', S: 'Cení pokoj a spoľahlivosť. Nemeň plány na poslednú chvíľu, daj čas na prispôsobenie.', C: 'Chce presnosť a dôvody. Pošli fakty, pravidlá a dostatok času na kontrolu.' },
  big5: { O: 'Rád skúša nové. Dávaj mu priestor na nápady a experimenty.', C: 'Má rád poriadok a termíny. Dohody dodrž, zmeny ohlás vopred.', E: 'Nabíja ho kontakt s ľuďmi. Rieš veci naživo, zapoj ho do diskusií.', A: 'Je ohľaduplný a ochotný. Dbaj, aby na ňom nezostávalo priveľa úloh.', N: 'Stres prežíva silnejšie. Dávaj jasné informácie a pokojnú spätnú väzbu.' },
  t16: { E: 'Energiu čerpá z ľudí – rieš veci v rozhovore.', S: 'Chce konkrétne fakty a príklady, nie teórie.', T: 'Rozhoduje logikou – argumentuj, nie emóciami.', J: 'Chce plán a termíny – dohodni ich vopred.' },
  roly: { L: 'Prirodzene organizuje. Daj mu zodpovednosť za smer.', T: 'Prináša nápady. Nechaj ho vymýšľať, realizáciu zver iným.', R: 'Dotiahne veci. Dávaj mu jasné zadania a termíny.', Z: 'Prepája ľudí. Posielaj ho tam, kde treba rokovať.', A: 'Posudzuje riziká. Pýtaj si od neho spätnú väzbu pred rozhodnutím.', P: 'Stará sa o ľudí. Pomáha, keď je v tíme napätie.' },
  styl: { T: 'Pracuje rýchlo. Neblokuj ho dlhými prípravami.', S: 'Radšej sám. Daj mu cieľ a nechaj postup na ňom.', R: 'Potrebuje pravidlá. Dohodni postup a nemeň ho za behu.', K: 'Potrebuje kontakt. Pravidelne sa ozvi a daj spätnú väzbu.' },
  hodn: { Z: 'Motivuje odmena. Hovor o výsledkoch a férovom ohodnotení.', S: 'Motivuje sloboda. Nekontroluj každý krok.', M: 'Motivuje zmysel. Vysvetli, komu práca pomáha.', I: 'Motivuje istota. Dávaj jasné podmienky a stabilitu.', R: 'Motivuje rast. Ponúkni učenie a nové zručnosti.', U: 'Motivuje uznanie. Oceň prácu nahlas a viditeľne.', V: 'Motivujú vzťahy. Dbaj na dobrý kolektív.', X: 'Motivuje výzva. Dávaj náročné ciele a zmenu.' },
}

/** Dve najsilnejšie dimenzie človeka s radou pre spoluprácu. */
export function advice(key, scores) {
  const T = TESTS[key]
  return Object.keys(T.dims).sort((a, b) => v(scores[b]) - v(scores[a])).slice(0, 2).map((d) => ({ d, name: T.dims[d][0], pct: v(scores[d]), text: (COLLAB[key] || {})[d] || '' }))
}

/** Zoskupí najnovšie výsledky podľa človeka: [{id, name, by:{test_key: row}}] zoradené podľa mena. */
export function byPerson(rows) {
  const people = {}
  for (const r of rows || []) {
    if (!people[r.user_id]) people[r.user_id] = { id: r.user_id, name: r.name || 'Kolega', by: {} }
    const cur = people[r.user_id].by[r.test_key]
    if (!cur || cur.created_at < r.created_at) people[r.user_id].by[r.test_key] = r
  }
  return Object.values(people).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
}

/** Iniciály do krúžku na mape (bez závislosti na serverovom module auth). */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}
