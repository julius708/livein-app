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

/** Tokeny názvu bez diakritiky a predpôn miest (KE:, BA:, TT:). */
export function nameTokens(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(ke|ba|tt)\s*:/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}

/** Preklep: rovnaká dĺžka a jeden iný znak, alebo jeden znak navyše/chýbajúci. */
function closeEnough(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, diff = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++diff > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return diff + (a.length - i) + (b.length - j) <= 1
}

/**
 * Nájde byt podľa textu z Asany („Dunajská A Danube“, „Grosslingova 38“, „KE: Hlavná, Charming“).
 * Skóre: zhodný token ≥ 4 znaky 2 b., kratší 1 b., prefix (≥ 4 znaky) 1,5 b. Vyhráva jednoznačne najlepší s aspoň 2 b.
 */
export function matchListing(text, flats) {
  const want = nameTokens(text)
  if (!want.length) return null
  let best = null, bestScore = 0, second = 0
  for (const f of flats) {
    const have = nameTokens(f.name)
    let score = 0
    for (const t of want) {
      if (have.includes(t)) score += t.length >= 4 ? 2 : 1
      else if (t.length >= 4 && have.some((h) => h.length >= 4 && (h.startsWith(t.slice(0, 4)) && (h.startsWith(t) || t.startsWith(h))))) score += 1.5
      else if (t.length >= 5 && have.some((h) => h.length >= 5 && h.slice(0, 5) === t.slice(0, 5))) score += 1
      else if (t.length >= 6 && have.some((h) => h.length >= 6 && closeEnough(t, h))) score += 1.5
    }
    if (score > bestScore) { second = bestScore; bestScore = score; best = f } else if (score > second) second = score
  }
  return bestScore >= 2 && bestScore - second >= 0.5 ? best : null
}

/**
 * Spojí opravy z Asany (tasks) a ručné opravy z appky (issues) s voľnými oknami bytov.
 * listings: [{guesty_id, name, title, city}], reservations: [{listing_id, check_in_date, check_out_date}]
 */
export function buildMaintenance({ listings, reservations, issues, tasks, today, horizon = 14 }) {
  const by = {}
  for (const r of reservations || []) (by[r.listing_id] = by[r.listing_id] || []).push(r)
  const flats = (listings || []).map((l) => ({ id: l.guesty_id, name: l.name || l.title || 'Byt', city: l.city || '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  const flatById = Object.fromEntries(flats.map((f) => [f.id, f]))
  const rank = { now: 0, soon: 1, busy: 2, none: 3 }
  const withWindow = (flat, base) => {
    let win = { kind: 'none', text: flat ? '' : 'byt sa nepodarilo priradiť' }
    let from = '9'
    if (flat) {
      const ws = freeWindows(by[flat.id] || [], today, horizon)
      win = describeWindow(ws, today, horizon)
      from = ws[0] ? ws[0].from : '9'
    }
    return { ...base, flat_id: flat ? flat.id : null, flat_name: flat ? flat.name : base.flat_name, city: flat ? flat.city : '', window: win,
      sort: `${base.priority === 'high' ? 0 : 1}|${rank[win.kind]}|${from}|${base.created_at}` }
  }
  const rows = []
  for (const t of tasks || []) {
    const flat = matchListing(t.listing, flats)
    rows.push(withWindow(flat, { id: t.gid, source: 'asana', flat_name: t.listing || 'nezaradený byt', text: t.problem || t.name, priority: 'normal',
      created_at: t.created_at, by: t.assignee || '', assignee_gid: t.assignee_gid || '', guest: t.guest || '', code: t.code || '', url: t.url || '', section: t.section || '', due_on: t.due_on || null }))
  }
  for (const i of issues || []) {
    const flat = i.listing_id ? flatById[i.listing_id] : null
    rows.push(withWindow(flat, { id: i.id, source: 'app', flat_name: i.listing_name, text: i.text, priority: i.priority, created_at: i.created_at, by: i.created_by_name || '', guest: '', code: '', url: '', section: '', due_on: null }))
  }
  rows.sort((a, b) => a.sort.localeCompare(b.sort))
  return { issues: rows, flats }
}
