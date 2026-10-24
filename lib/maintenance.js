// Údržba: čistá logika bez Supabase a Reactu, aby sa dala otestovať.

/** Dnešný dátum v Bratislave ako YYYY-MM-DD. */
export function todayBA(d = new Date()) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bratislava' })
}

export function addDays(ymd, n) {
  const t = new Date(ymd + 'T12:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export function fmtDM(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${Number(d)}.${Number(m)}.`
}

/**
 * Voľné okná bytu v najbližších `horizon` dňoch podľa potvrdených rezervácií.
 * Vracia [{from, to}] – `to` je deň ďalšieho príchodu, null = ďalej voľné.
 * Odchod a príchod v ten istý deň nie je okno (byt sa len otočí).
 */
export function freeWindows(reservations, today, horizon = 14) {
  const end = addDays(today, horizon)
  const rs = (reservations || [])
    .filter((r) => r.check_out_date > today && r.check_in_date <= end)
    .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))
  const out = []
  let start = today
  for (const r of rs) {
    if (r.check_in_date > start) out.push({ from: start, to: r.check_in_date })
    if (r.check_out_date > start) start = r.check_out_date
  }
  if (start <= end) out.push({ from: start, to: null })
  return out
}

/** Text pre kartu: kedy sa dá v byte opravovať. */
export function describeWindow(windows, today, horizon = 14) {
  const w = windows[0]
  if (!w) return { kind: 'busy', text: `obsadený ďalších ${horizon}+ dní` }
  if (w.from === today) {
    return { kind: 'now', text: w.to ? `voľný teraz, ďalší príchod ${fmtDM(w.to)}` : `voľný teraz, bez rezervácie ${horizon} dní` }
  }
  return { kind: 'soon', text: w.to ? `voľný od ${fmtDM(w.from)} do ${fmtDM(w.to)}` : `voľný od ${fmtDM(w.from)}` }
}

/**
 * Spojí otvorené opravy s voľnými oknami bytov.
 * listings: [{guesty_id, name, title, city}], reservations: [{listing_id, check_in_date, check_out_date}],
 * issues: [{id, listing_id, listing_name, text, priority, created_at, created_by_name}]
 */
export function buildMaintenance({ listings, reservations, issues, today, horizon = 14 }) {
  const by = {}
  for (const r of reservations || []) (by[r.listing_id] = by[r.listing_id] || []).push(r)
  const flats = (listings || []).map((l) => ({ id: l.guesty_id, name: l.title || l.name || 'Byt', city: l.city || '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  const flatById = Object.fromEntries(flats.map((f) => [f.id, f]))
  const rank = { now: 0, soon: 1, busy: 2, none: 3 }
  const rows = (issues || []).map((i) => {
    const flat = i.listing_id ? flatById[i.listing_id] : null
    let win = { kind: 'none', text: 'bez väzby na byt' }
    let from = '9'
    if (flat) {
      const ws = freeWindows(by[flat.id] || [], today, horizon)
      win = describeWindow(ws, today, horizon)
      from = ws[0] ? ws[0].from : '9'
    }
    return { ...i, flat_name: flat ? flat.name : i.listing_name, city: flat ? flat.city : '', window: win, sort: `${i.priority === 'high' ? 0 : 1}|${rank[win.kind]}|${from}|${i.created_at}` }
  }).sort((a, b) => a.sort.localeCompare(b.sort))
  return { issues: rows, flats }
}
