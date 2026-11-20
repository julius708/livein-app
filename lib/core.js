// Spoločný záznam udalostí a schránka: čisté pomocné funkcie (bez databázy, dajú sa testovať).

/** Slovenské názvy udalostí; neznáma udalosť sa zobrazí ako jej kód. */
export const EVENT_LABELS = {
  'task.start': 'začala upratovanie',
  'task.finish': 'dokončila upratovanie',
  'task.problem': 'nahlásila problém',
  'task.alert': 'poslala upozornenie',
  'task.assign': 'priradila byt',
  'task.reopen': 'vrátila úlohu na opravu',
  'task.cancel': 'zrušila úlohu',
  'task.add': 'pridala úlohu',
  'application.decide': 'rozhodla o prihláške',
  'member.invite': 'pozvala člena tímu',
  'post.add': 'napísala na nástenku',
  'inbox.sent': 'poslala správu',
}
export const MODULE_LABELS = { upratovanie: 'Upratovanie', kb: 'Znalosti', zaradenie: 'Zaradenie', crm: 'CRM', pracovna: 'Práčovňa' }

export const eventLabel = (e) => EVENT_LABELS[e] || e
export const moduleLabel = (m) => MODULE_LABELS[m] || m

/** Interný odkaz: iba cesta v appke (nikdy iná doména). */
export const safeHref = (h) => (typeof h === 'string' && /^\/[^/\\]/.test(h) ? h : null)

const sk = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c)
export const unreadLabel = (n) => `${n} ${sk(n, 'neprečítaná správa', 'neprečítané správy', 'neprečítaných správ')}`

/** Karta pre „Môj deň“: len keď je niečo neprečítané. */
export function inboxCard(unread, items = []) {
  if (!(unread > 0)) return null
  return {
    id: 'inbox', icon: '📥', title: 'Schránka', urgent: true, tone: 'blue',
    big: { value: unread, label: unreadLabel(unread).replace(/^\d+ /, '') },
    stats: [],
    items: items.slice(0, 3).map((x) => ({ text: x.title, tag: x.kind === 'alert' ? 'dôležité' : '' })),
    cta: { href: '/schranka', label: 'Otvoriť schránku' },
  }
}
