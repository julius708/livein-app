// Ústredňa – hlasové a písané príkazy: z vety urobí zámer. Čistá funkcia; samotné rozpoznanie reči robí prehliadač.
// Príkaz nikdy nič nezapíše sám: „zadaj úlohu“ len predvyplní formulár, ktorý človek potvrdí tlačidlom (rovnaká akcia ako ručné zadanie).

export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,!?;:„“"']/g, ' ').replace(/\s+/g, ' ').trim()

const AREA_WORDS = {
  overview: ['prehlad', 'domov', 'uvod'], attention: ['pozornost', 'rozhodnutia'], messages: ['spravy', 'posta', 'nastenka', 'nastenku'], agents: ['ludia', 'ludi', 'agenti', 'agentov', 'tim', 'ulohy'],
  visits: ['obhliadky', 'obhliadok', 'kalendar'], properties: ['nehnutelnosti', 'byty', 'leady', 'crm'], marketing: ['marketing', 'obsah', 'newsletter'],
  operations: ['prevadzka', 'prevadzku', 'prichody', 'udrzba', 'udrzbu', 'opravy'], finance: ['financie', 'peniaze', 'vyuctovanie', 'ekonomika', 'ekonomiku'],
  knowledge: ['znalosti', 'obsidian', 'poznamky', 'trezor'], connections: ['prepojenia', 'zdroje'], map: ['mapa', 'mapu', 'graf'],
}

/** Nájde človeka alebo agenta podľa mena aj v inom páde („Codexu“, „Zuzke“): zhoda prvých 4 písmen niektorého slova mena. */
function findPerson(words, people) {
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    const w = words[i]
    if (w.length < 3) continue
    for (const p of people || []) {
      for (const t of fold(p.name).split(' ')) {
        if (t.length < 3) continue
        const stem = t.slice(0, Math.max(3, Math.min(5, t.length - 1)))
        if (w === t || (w.length >= stem.length && w.startsWith(stem))) return { person: p, at: i }
      }
    }
  }
  return null
}

/** Veta → zámer: { type: 'assign'|'nav'|'search'|'briefing'|'refresh'|'theme'|'unknown', … }. */
export function parseCommand(text, { people = [] } = {}) {
  const original = String(text || '').trim().split(/\s+/).filter(Boolean), words = original.map((w) => fold(w))
  const f = words.join(' ')
  if (!f) return { type: 'unknown', query: '' }
  const tail = (from) => original.slice(from).join(' ').replace(/^[\s:,–-]+/, '').trim()

  let m = /^(?:(?:zadaj|vytvor|pridaj|zadat)(?: novu)? ulohu(?: pre)?|(?:nova )?uloha pre)\b/.exec(f)
  if (m) {
    let i = m[0].split(' ').length
    const hit = findPerson(words.slice(i), people)
    let assigneeId = null
    if (hit) { assigneeId = hit.person.id; i += hit.at + fold(hit.person.name).split(' ').filter((t) => words.slice(i + hit.at, i + hit.at + 3).some((w) => w.startsWith(t.slice(0, 3)))).length || 1 }
    while (['aby', 'nech', 'ze'].includes(words[i])) i++
    const summary = tail(i)
    return { type: 'assign', assigneeId, assigneeName: hit ? hit.person.name : null, summary: summary ? summary[0].toUpperCase() + summary.slice(1) : '' }
  }
  if (/\b(brifing|briefing)\b|prejdi priority|co odo mna|co potrebuje moj/.test(f)) return { type: 'briefing' }
  if (/\b(nocny|tmavy)\b/.test(f)) return { type: 'theme', value: 'night' }
  if (/\b(denny|svetly)\b/.test(f)) return { type: 'theme', value: 'day' }
  if (/^(obnov|aktualizuj|nacitaj znova)\b/.test(f)) return { type: 'refresh' }
  m = /^(hladaj|najdi|vyhladaj)\b/.exec(f)
  if (m) return { type: 'search', query: tail(1) }
  for (const [area, list] of Object.entries(AREA_WORDS)) if (words.some((w) => list.includes(w))) return { type: 'nav', area }
  return { type: 'unknown', query: original.join(' ') }
}
