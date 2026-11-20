// Upratovanie: texty upozornení (push aj e-mail). Čisté funkcie; odosielanie je v cl-notify-server.js.
import { dayLabel } from './cl-core.js'

export const ALERT_LABEL = { late: 'Meškám', cant: 'Nemôžem prísť', help: 'Potrebujem pomoc', supplies: 'Chýba tovar alebo bielizeň' }
export const ALERT_ICON = { late: '⏰', cant: '🚫', help: '🆘', supplies: '📦' }
const n = (k, one, few, many) => (k === 1 ? one : k >= 2 && k <= 4 ? few : many)
export const bytWord = (k) => `${k} ${n(k, 'byt', 'byty', 'bytov')}`
export const upratWord = (k) => `${k} ${n(k, 'upratovanie', 'upratovania', 'upratovaní')}`

const names = (tasks, max = 6) => {
  const l = tasks.map((t) => t.listing_name)
  return l.length > max ? `${l.slice(0, max).join(', ')} a ${l.length - max} ďalších` : l.join(', ')
}

/** Upratovačke pribudli byty (priradil manažér alebo appka). */
export function assignMessage(tasks, url = '/uprat') {
  const days = [...new Set(tasks.map((t) => t.date))].sort()
  const when = days.length === 1 ? dayLabel(days[0]) : `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`
  return { title: tasks.length === 1 ? 'Nové upratovanie' : `Nové upratovania: ${tasks.length}`, body: `${when}: ${names(tasks)}`, url, tag: 'cl-assign' }
}

/** Večerná pripomienka: čo ju čaká zajtra. */
export function eveningMessage(tasks, day, url = '/uprat') {
  return { title: `Zajtra máš ${upratWord(tasks.length)}`, body: `${dayLabel(day)}: ${names(tasks)}. Otvor appku pre trasu a čo si zobrať.`, url, tag: 'cl-evening' }
}

/** Manažérovi: upratovačka poslala upozornenie k úlohe. */
export function alertMessage({ kind, cleaner, flat, date, text }, url = '/upratovanie?tab=plan') {
  return { title: `${ALERT_ICON[kind] || '⚠️'} ${ALERT_LABEL[kind] || 'Upozornenie'}: ${cleaner}`, body: `${flat}${date ? ' · ' + dayLabel(date) : ''}${text ? ': ' + text : ''}`, url, tag: 'cl-alert' }
}

/** Manažérovi: čaká návrh rozdelenia na zajtra (potvrdí v appke jedným klikom). */
export function proposalMessage({ day, assignments, unassigned, total }, url) {
  const per = new Map()
  for (const a of assignments) per.set(a.name || a.email, (per.get(a.name || a.email) || 0) + 1)
  const split = [...per.entries()].map(([k, v]) => `${k} ${v}`).join(', ')
  return {
    title: `Na ${dayLabel(day)} je ${bytWord(total)} bez upratovačky`,
    body: `Návrh rozdelenia: ${split || 'nikoho sa nepodarilo priradiť'}${unassigned.length ? `. Nepriradené: ${unassigned.length}` : ''}. Potvrď v appke.`,
    url,
    tag: 'cl-proposal',
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** E-mail z upozornenia: predmet = titulok, tlačidlo vedie do appky (absolútny odkaz). */
export function emailFor(msg, origin) {
  const link = msg.url && msg.url.startsWith('/') ? origin + msg.url : msg.url || origin
  const text = `${msg.body}\n\n${link}`
  const html = `<div style="font-family:Arial,sans-serif;color:#233E31;max-width:520px"><h3 style="margin:0 0 8px">${esc(msg.title)}</h3><p style="margin:0 0 14px">${esc(msg.body)}</p><p><a href="${esc(link)}" style="display:inline-block;background:#173E2C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700">Otvoriť v appke</a></p></div>`
  return { subject: msg.title, text, html }
}

/** Zapnuté upozornenia: predvolene všetko zapnuté, vypnúť sa dá v Nastaveniach. */
export function notifyOn(settings, key) {
  const v = settings && settings.notify
  return !(v && v[key] === false)
}
