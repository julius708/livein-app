// „Môj deň“: karty na domovskej obrazovke podľa roly človeka. Čistá logika (bez databázy): z nazbieraných údajov zloží karty, najnaliehavejšie hore.
// Každá karta má jednu hlavnú vec, pár čísel, krátky zoznam a jedno tlačidlo, kam ísť ďalej.

import { inboxCard } from './core.js'

const has = (roles, list) => (roles || []).some((r) => list.includes(r))
export const OPS = ['admin', 'operations', 'customer_service', 'assistant']
const sk = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c)

/**
 * @param {object} d  { cleaner, manager, hf, hw, leads, maint, mentions } (každé môže chýbať)
 * @param {{roles: string[], isAdmin: boolean}} who
 * @returns {Array<{id,icon,title,urgent,big,stats,items,cta,tone}>}
 */
export function buildCards(d, who) {
  const roles = who.roles || []
  const cards = []
  const c = d.cleaner
  if (c) {
    const todayN = c.today.length
    const done = c.today.filter((t) => t.status === 'done').length
    const left = todayN - done
    const next = c.today.find((t) => t.status === 'in_progress') || c.today.find((t) => t.status === 'todo') || null
    cards.push({
      id: 'cleaner', icon: '🧽', title: 'Moje upratovania dnes', urgent: left > 0 || c.fresh > 0, tone: 'green',
      big: todayN ? { value: left > 0 ? left : '✓', label: left > 0 ? `${sk(left, 'byt ostáva', 'byty ostávajú', 'bytov ostáva')} upratať` : 'všetko hotové' } : { value: '–', label: 'dnes nemáš nič priradené' },
      stats: [{ v: todayN, l: 'dnes' }, { v: c.tomorrow.length, l: 'zajtra' }, ...(c.fresh ? [{ v: c.fresh, l: 'nové', hot: true }] : [])],
      items: c.today.filter((t) => t.status !== 'done').slice(0, 4).map((t) => ({ text: t.listing_name, tag: t.status === 'in_progress' ? 'prebieha' : t.alert_kind ? 'nahlásené' : '' })),
      cta: next ? { href: `/uprat?u=${next.id}`, label: `Ďalší byt: ${next.listing_name}` } : { href: '/uprat', label: todayN ? 'Otvoriť môj plán' : 'Môj rozvrh a plán' },
    })
  }
  const m = d.manager
  if (m) {
    const attention = m.unassigned + m.alerts + m.problems
    cards.push({
      id: 'cleaning-manager', icon: '🧹', title: 'Upratovanie', urgent: attention > 0, tone: attention > 0 ? 'amber' : 'green',
      big: { value: m.unassigned, label: `${sk(m.unassigned, 'byt čaká', 'byty čakajú', 'bytov čaká')} na priradenie (dnes a zajtra)` },
      stats: [{ v: `${m.done}/${m.total}`, l: 'dnes hotové' }, { v: m.inProgress, l: 'prebieha' }, ...(m.alerts ? [{ v: m.alerts, l: 'upozornení', hot: true }] : []), ...(m.problems ? [{ v: m.problems, l: 'problémov', hot: true }] : []), ...(m.applications ? [{ v: m.applications, l: 'prihlášok' }] : [])],
      items: [],
      cta: { href: m.unassigned ? '/upratovanie?tab=plan' : '/upratovanie', label: m.unassigned ? 'Rozdeliť byty' : 'Otvoriť plán' },
    })
  }
  if (has(roles, OPS) && d.hf) {
    const hf = d.hf
    cards.push({
      id: 'reservations', icon: '🛬', title: 'Príchody a odchody dnes', urgent: false, tone: 'blue',
      big: { value: hf.arrivals ?? 0, label: sk(hf.arrivals, 'príchod dnes', 'príchody dnes', 'príchodov dnes') },
      stats: [{ v: hf.departures ?? 0, l: 'odchody' }, { v: hf.tomorrow_arrivals ?? 0, l: 'príchody zajtra' }, { v: hf.guests_in_house ?? 0, l: 'hostí v byte' }],
      items: [],
      cta: { href: '#dash', label: 'Zoznam rezervácií' },
    })
  }
  if (has(roles, ['admin', 'operations', 'cleaning', 'assistant']) && d.hw) {
    const hw = d.hw
    const todo = Number(hw.today_todo) || 0
    cards.push({
      id: 'laundry', icon: '🧼', title: 'Práčovňa', urgent: todo > 0, tone: todo > 0 ? 'amber' : 'green',
      big: { value: todo, label: `${sk(todo, 'taška', 'tašky', 'tašiek')} treba dnes zabaliť` },
      stats: [{ v: hw.today_packed ?? 0, l: 'zabalených' }, { v: hw.today_same_day ?? 0, l: 'príchod v ten deň' }, { v: hw.tomorrow_total ?? 0, l: 'zajtra' }],
      items: [], cta: { href: '/pracovna', label: 'Otvoriť Práčovňu' },
    })
  }
  if (has(roles, ['admin', 'crm']) && d.leads) {
    const l = d.leads
    cards.push({
      id: 'leads', icon: '📞', title: 'Leady', urgent: l.overdue > 0, tone: l.overdue > 0 ? 'red' : 'blue',
      big: { value: l.fresh, label: `${sk(l.fresh, 'nový lead', 'nové leady', 'nových leadov')} za 3 dni` },
      stats: [...(l.overdue ? [{ v: l.overdue, l: 'po lehote', hot: true }] : [])],
      items: [], cta: { href: '/crm', label: 'Otvoriť CRM' },
    })
  }
  if (has(roles, OPS) && d.maint > 0) {
    cards.push({
      id: 'maint', icon: '🛠️', title: 'Údržba', urgent: false, tone: 'amber',
      big: { value: d.maint, label: `${sk(d.maint, 'otvorený prípad', 'otvorené prípady', 'otvorených prípadov')}` },
      stats: [], items: [], cta: { href: '/udrzba', label: 'Otvoriť údržbu' },
    })
  }
  if (d.mentions > 0) {
    cards.push({
      id: 'mentions', icon: '💬', title: 'Označili ťa na nástenke', urgent: true, tone: 'amber',
      big: { value: d.mentions, label: `${sk(d.mentions, 'neprečítaná správa', 'neprečítané správy', 'neprečítaných správ')}` },
      stats: [], items: [], cta: { href: '#nastenka', label: 'Prečítať' },
    })
  }
  const ib = inboxCard(d.inbox && d.inbox.n, d.inbox && d.inbox.items)
  if (ib) cards.push(ib)
  // najnaliehavejšie hore, inak poradie podľa dôležitosti práce (rola upratovačky a manažéra vždy pred prehľadmi)
  return cards.map((x, i) => ({ ...x, _i: i })).sort((a, b) => (b.urgent === a.urgent ? a._i - b._i : b.urgent ? 1 : -1)).map(({ _i, ...x }) => x)
}

/** Pozdrav pod nadpisom: jedna veta podľa toho, čo človeka dnes čaká. */
export function daySummary(cards) {
  const urgent = cards.filter((c) => c.urgent)
  if (!cards.length) return 'Dnes ťa nič konkrétne nečaká. Pozri si moduly nižšie.'
  if (!urgent.length) return 'Všetko je v poriadku. Toto je tvoj dnešný prehľad.'
  return `Čaká ťa ${urgent.length} ${sk(urgent.length, 'vec', 'veci', 'vecí')}, ktoré treba pozrieť ako prvé.`
}
