// Upratovanie: mesačný report (Excel + e-mail). Čisté funkcie nad údajmi z cl_report_data; nič nečíta z databázy.
import { payForTask, workedMinutes, fmtEur, STATUS_LABEL, PAY_SOURCE_LABEL, addDays, isYmd } from './cl-core.js'

export const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
export const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''))

/** "2026-11" -> { from: '2026-11-01', to: '2026-11-30' } */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}
/** Predošlý mesiac k dátumu (YYYY-MM-DD) ako "RRRR-MM". */
export function prevMonth(ymd) {
  const d = new Date(ymd.slice(0, 7) + '-01T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}
export const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
export const reportFileName = (ym) => `Upratovanie_${MONTHS[Number(ym.slice(5, 7)) - 1].normalize('NFD').replace(/[̀-ͯ]/g, '')}_${ym.slice(0, 4)}.xlsx`

const hm = (min) => (min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : '')
const tm = (iso) => (iso ? new Date(iso).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** Údaje z cl_report_data -> model reportu: riadky úloh, súhrn po upratovačkách a po bytoch, problémy. */
export function reportModel(data, ym) {
  const staff = Object.fromEntries((data.staff || []).map((s) => [s.email, s]))
  const flats = Object.fromEntries((data.flats || []).map((f) => [f.listing_id, f]))
  const rows = [...(data.tasks || [])].filter((t) => t.status !== 'cancelled').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.listing_name).localeCompare(String(b.listing_name), 'sk'))).map((t) => {
    const s = staff[t.cleaner_email]
    const p = payForTask(t, s, flats[t.listing_id])
    return { ...t, cleaner: s ? s.name : t.cleaner_email || '', minutes: workedMinutes(t), cents: p.cents, source: p.source }
  })
  const by = {}
  for (const r of rows) {
    const k = r.cleaner_email || '—'
    const o = by[k] || (by[k] = { name: r.cleaner || 'Nepriradené', done: 0, open: 0, minutes: 0, doneCents: 0, estCents: 0, missing: 0, problems: 0 })
    if (r.problem_text) o.problems += 1
    if (r.status === 'done') { o.done += 1; o.minutes += r.minutes || 0; if (r.cents == null) o.missing += 1; else o.doneCents += r.cents } else { o.open += 1; if (r.cents != null && r.cleaner_email) o.estCents += r.cents }
  }
  const cleaners = Object.values(by).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  const fl = {}
  for (const r of rows) { const o = fl[r.listing_id] || (fl[r.listing_id] = { name: r.listing_name, done: 0, open: 0, minutes: 0, cents: 0 }); if (r.status === 'done') { o.done += 1; o.minutes += r.minutes || 0; o.cents += r.cents || 0 } else o.open += 1 }
  const flatsList = Object.values(fl).sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, 'sk'))
  const total = cleaners.reduce((a, c) => ({ done: a.done + c.done, open: a.open + c.open, minutes: a.minutes + c.minutes, doneCents: a.doneCents + c.doneCents, estCents: a.estCents + c.estCents, missing: a.missing + c.missing, problems: a.problems + c.problems }), { done: 0, open: 0, minutes: 0, doneCents: 0, estCents: 0, missing: 0, problems: 0 })
  return { ym, label: monthLabel(ym), rows, cleaners, flats: flatsList, total, problems: rows.filter((r) => r.problem_text) }
}

/** Hárky pre buildXlsx (lib/xlsx-lite.js). */
export function reportSheets(m) {
  const H = (v) => ({ v, s: 'head' })
  const eur = (c) => (c == null ? null : { v: c / 100, s: 'money' })
  const sum = [[{ v: `Upratovanie ${m.label}: súhrn po upratovačkách`, s: 'title' }], [], ['Upratovačka', 'Hotové úlohy', 'Nehotové', 'Odpracované', 'Hotové (€)', 'Odhad nehotových (€)', 'Bez sadzby', 'Problémy'].map(H)]
  for (const c of m.cleaners) sum.push([c.name, c.done, c.open, hm(c.minutes) || null, eur(c.doneCents), eur(c.estCents), c.missing || null, c.problems || null])
  sum.push([], [{ v: 'SPOLU', s: 'bold' }, m.total.done, m.total.open, hm(m.total.minutes) || null, { v: m.total.doneCents / 100, s: 'moneyBold' }, eur(m.total.estCents), m.total.missing || null, m.total.problems || null])
  sum.push([], [{ v: 'Suma je orientačný prehľad podľa sadzieb v appke (za hodinu z odpracovaného času, inak cena bytu alebo sadzba za upratovanie), nie výplatná páska.', s: 'bold' }])
  const tasks = [['Dátum', 'Byt', 'Upratovačka', 'Stav', 'Štart', 'Koniec', 'Minúty', 'Suma €', 'Zdroj sumy', 'Ručná úloha', 'Problém', 'Poznámka upratovačky'].map(H)]
  for (const r of m.rows) tasks.push([r.date.split('-').reverse().join('. '), r.listing_name, r.cleaner || null, STATUS_LABEL[r.status] || r.status, tm(r.started_at) || null, tm(r.finished_at) || null, r.minutes, eur(r.cents), PAY_SOURCE_LABEL[r.source], r.manual ? 'áno' : null, r.problem_text || null, r.cleaner_note || null])
  const flats = [['Byt', 'Hotové upratovania', 'Nehotové', 'Odpracované', 'Suma €'].map(H)]
  for (const f of m.flats) flats.push([f.name, f.done, f.open, hm(f.minutes) || null, eur(f.cents)])
  return [
    { name: 'Súhrn', cols: [30, 14, 12, 14, 14, 20, 12, 10], rows: sum },
    { name: 'Úlohy', cols: [12, 30, 26, 11, 14, 14, 9, 11, 26, 11, 40, 40], freeze: true, rows: tasks },
    { name: 'Podľa bytov', cols: [34, 18, 12, 14, 12], freeze: true, rows: flats },
  ]
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** Predmet a telo e-mailu s mesačným reportom (tabuľka je v prílohe). */
export function reportEmail(m) {
  const t = m.total
  const subject = `Upratovanie: report za ${m.label}`
  const lines = m.cleaners.map((c) => `${c.name}: ${c.done} hotových${c.minutes ? `, ${hm(c.minutes)}` : ''}, ${fmtEur(c.doneCents)}${c.missing ? ` (${c.missing} bez sadzby)` : ''}`)
  const text = [`Report upratovania za ${m.label}.`, '', `Hotových upratovaní: ${t.done}, nehotových: ${t.open}, problémov: ${t.problems}.`, `Orientačne k vyplateniu: ${fmtEur(t.doneCents)}.`, '', ...lines, '', 'Celá tabuľka je v prílohe (Excel). Sumy sú orientačné, nie výplatná páska.'].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;color:#233E31"><h2 style="margin:0 0 8px">Upratovanie: ${esc(m.label)}</h2><p>Hotových upratovaní: <b>${t.done}</b>, nehotových: ${t.open}, problémov: ${t.problems}.<br>Orientačne k vyplateniu: <b>${esc(fmtEur(t.doneCents))}</b>.</p><table style="border-collapse:collapse;font-size:14px"><tr><th align="left" style="padding:4px 12px 4px 0">Upratovačka</th><th align="right" style="padding:4px 12px">Hotové</th><th align="right" style="padding:4px 12px">Čas</th><th align="right" style="padding:4px 0 4px 12px">Suma</th></tr>${m.cleaners.map((c) => `<tr><td style="padding:4px 12px 4px 0">${esc(c.name)}</td><td align="right" style="padding:4px 12px">${c.done}</td><td align="right" style="padding:4px 12px">${esc(hm(c.minutes) || '—')}</td><td align="right" style="padding:4px 0 4px 12px">${esc(fmtEur(c.doneCents))}${c.missing ? ' *' : ''}</td></tr>`).join('')}</table>${t.missing ? '<p style="font-size:12px;color:#66716A">* pri niektorých úlohách nie je nastavená sadzba.</p>' : ''}<p style="font-size:13px">Celá tabuľka je v prílohe (Excel). Sumy sú orientačné, nie výplatná páska.</p></div>`
  return { subject, text, html }
}
export { addDays, isYmd }
