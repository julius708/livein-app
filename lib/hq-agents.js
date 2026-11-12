// Ústredňa – agenti: pravdivý zoznam rolí poskladaný z dôkazov, nie z registra.
// Dôkazy: rozvrhy (automatizácie GPT/Codex, rutiny Claude), výstupy (súbory na disku), hlásenia v Slacku a zápisy v Braine (Obsidian).
// Rozvrh nie je dôkaz práce. „Dodáva“ je len rola, ktorá za posledné 3 dni zanechala výstup. Bez importov, dá sa použiť aj v prehliadači.

export const AGENTS_VERSION = 1
export const AGENT_LIMITS = { roles: 150, items: 300, text: 140, coverage: 10, asks: 20, ask: 280 }
const DAY = 86400e3
export const FRESH_DAYS = 3, RECENT_DAYS = 14

const ROLE_RE = /(?:^|[^A-Za-z0-9])(S-[AK]\d{1,2}[A-Z]?|V-GPT-[A-Z]|A\d{1,2}[a-d]?|[PB]\d{1,2}|ZS)(?![A-Za-z0-9])/
/** ID roly z názvu rozvrhu, priečinka alebo podpisu správy: „LIVE-IN A15 — Vyúčtovanie“ → A15. */
export const roleOf = (text) => { const m = ROLE_RE.exec(String(text || '')); return m ? m[1] : null }
const two = (n) => String(n).padStart(2, '0')
const DOW = { MO: 'po', TU: 'ut', WE: 'st', TH: 'št', FR: 'pi', SA: 'so', SU: 'ne' }, DOW_N = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so', 'ne']

/** iCal RRULE (Codex) po slovensky: „FREQ=HOURLY;BYMINUTE=42“ → „každú hodinu (:42)“. */
export function rruleText(r) {
  const p = Object.fromEntries(String(r || '').split(';').map((x) => x.split('=')).filter((x) => x.length === 2))
  const at = p.BYHOUR != null ? `${two(p.BYHOUR)}:${two(p.BYMINUTE || 0)}` : ''
  if (p.FREQ === 'MINUTELY') return `každých ${p.INTERVAL || 1} min`
  if (p.FREQ === 'HOURLY') return (Number(p.INTERVAL) > 1 ? `každých ${p.INTERVAL} h` : 'každú hodinu') + (p.BYMINUTE != null ? ` (:${two(p.BYMINUTE)})` : '')
  if (p.FREQ === 'DAILY') return ('denne ' + at).trim()
  if (p.FREQ === 'WEEKLY') { const d = String(p.BYDAY || '').split(',').filter(Boolean); const days = d.join() === 'MO,TU,WE,TH,FR' ? 'po–pi' : d.map((x) => DOW[x] || x).join(', '); return ((days || 'týždenne') + ' ' + at).trim() }
  if (p.FREQ === 'MONTHLY') return ('mesačne ' + at).trim()
  return String(r || '').slice(0, 60)
}
/** Cron (rutiny Claude) po slovensky: „CRON_TZ=Europe/Bratislava 43 7 * * 1“ → „po 07:43“. */
export function cronText(c) {
  const f = String(c || '').replace(/^CRON_TZ=\S+\s+/, '').trim().split(/\s+/)
  if (f.length !== 5) return String(c || '').slice(0, 60)
  const [m, h, dom, , dow] = f
  if (!/^\d+$/.test(m)) return f.join(' ')
  const times = /^[\d,]+$/.test(h) ? h.split(',').map((x) => `${two(x)}:${two(m)}`).join(' a ') : null
  if (!times) { const r = /^(\d+)-(\d+)$/.exec(h); return r ? `každú hodinu ${r[1]}–${r[2]} h (:${two(m)})` : h === '*' ? `každú hodinu (:${two(m)})` : f.join(' ') }
  if (dom !== '*') return `${dom}. deň v mesiaci ${times}`
  if (dow !== '*') return (dow === '1-5' ? 'po–pi' : dow.split(',').map((x) => DOW_N[Number(x)] || x).join(', ')) + ' ' + times
  return 'denne ' + times
}

const str = (v, n = AGENT_LIMITS.text) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n)
const iso = (v) => (v != null && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null)
const rid = (v) => { const r = str(v, 12); return /^[A-Za-z0-9-]{1,12}$/.test(r) ? r : null }
const RUNTIMES = ['GPT', 'Claude']

/** Očistí prijatý prehľad dôkazov. Neznáme polia zahodí, texty skráti, časy overí. Vyhodí chybu, ak formát nesedí. */
export function sanitizeAgents(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== AGENTS_VERSION) throw new Error('Neznámy formát prehľadu agentov.')
  const asOf = iso(raw.asOf)
  if (!asOf) throw new Error('Prehľad agentov nemá platný čas (asOf).')
  const arr = (v) => (Array.isArray(v) ? v : [])
  if (arr(raw.roles).length > AGENT_LIMITS.roles || [raw.schedules, raw.outputs, raw.slack].some((a) => arr(a).length > AGENT_LIMITS.items)) throw new Error('Prehľad agentov je príliš veľký.')
  const seen = new Set()
  const roles = arr(raw.roles).map((r) => ({ id: rid(r && r.id), name: str(r && r.name, 40), func: str(r && r.func, 80) })).filter((r) => r.id && !seen.has(r.id) && seen.add(r.id))
  const schedules = arr(raw.schedules).map((s) => ({ runtime: RUNTIMES.includes(s && s.runtime) ? s.runtime : null, role: rid(s && s.role), name: str(s && s.name), every: str(s && s.every, 60), active: !!(s && s.active), lastRun: iso(s && s.lastRun), ok: s && typeof s.ok === 'boolean' ? s.ok : null })).filter((s) => s.runtime && s.name)
  const outputs = arr(raw.outputs).map((o) => ({ runtime: RUNTIMES.includes(o && o.runtime) ? o.runtime : null, role: rid(o && o.role), where: str(o && o.where, 60), files: Math.max(0, Math.min(1e6, Math.round(Number(o && o.files) || 0))), last: iso(o && o.last) })).filter((o) => o.runtime && o.role)
  const slack = arr(raw.slack).map((m) => ({ runtime: RUNTIMES.includes(m && m.runtime) ? m.runtime : null, role: rid(m && m.role), last: iso(m && m.last), count: Math.max(0, Math.min(1e5, Math.round(Number(m && m.count) || 0))) })).filter((m) => m.role && m.last)
  const coverage = arr(raw.coverage).slice(0, AGENT_LIMITS.coverage).map((c) => str(c, 260)).filter(Boolean)
  // otázky, ktoré roly samy adresovali vedeniu (z ich hlásení); je to tvrdenie roly, nie overený fakt
  const asks = arr(raw.asks).slice(0, AGENT_LIMITS.asks).map((a) => ({ role: rid(a && a.role), at: iso(a && a.at), text: str(a && a.text, AGENT_LIMITS.ask), context: str(a && a.context, AGENT_LIMITS.ask) })).filter((a) => a.role && a.at && a.text)
  return { v: AGENTS_VERSION, asOf, roles, schedules, outputs, slack, coverage, asks }
}

/** Zápisy rolí v Braine z indexu trezoru: priečinok Agenti/<ID>/, podpriečinok Claude/ sú zápisy Claude. Meno roly je v nadpise 00_Index („Atlas · A1“). */
export function brainByRole(ix) {
  const out = new Map()
  if (!ix || !Array.isArray(ix.notes)) return out
  for (const n of ix.notes) {
    const m = /^Agenti\/([^/]+)\/(.+)$/.exec(n.path || '')
    if (!m || !rid(m[1])) continue
    const b = out.get(m[1]) || { notes: 0, last: null, claudeNotes: 0, claudeLast: null, otherNotes: 0, otherLast: null, name: '' }
    const claude = /^Claude\//.test(m[2]), t = n.mtime || null
    b.notes++; if (t && (!b.last || t > b.last)) b.last = t
    if (claude) { b.claudeNotes++; if (t && (!b.claudeLast || t > b.claudeLast)) b.claudeLast = t } else { b.otherNotes++; if (t && (!b.otherLast || t > b.otherLast)) b.otherLast = t }
    if (m[2] === '00_Index.md') { const nm = /^(.+?)\s+·\s+/.exec(n.title || ''); if (nm && nm[1] !== m[1]) b.name = nm[1].slice(0, 40) }
    out.set(m[1], b)
  }
  return out
}

export const AGENT_STATE = {
  delivering: { label: 'Dodáva', tone: '', hint: `Výstup za posledné ${FRESH_DAYS} dni.` },
  scheduled: { label: 'Beží podľa rozvrhu', tone: 'blue', hint: `Rozvrh je zapnutý a v tom istom prostredí je výstup do ${RECENT_DAYS} dní.` },
  idle: { label: 'Rozvrh beží, výstup nevidno', tone: 'orange', hint: `Rozvrh je zapnutý, ale v prostredí, kde beží, nie je výstup ${RECENT_DAYS} dní alebo vôbec.` },
  quiet: { label: 'Ticho', tone: 'gray', hint: 'Žiadny zapnutý rozvrh a žiadny čerstvý výstup.' },
  registered: { label: 'Len v registri', tone: 'gray', hint: 'Rola má priečinok alebo meno, ale žiadny dôkaz práce.' },
}
const maxIso = (...v) => v.filter(Boolean).sort().pop() || null
const order = (id) => { const m = /^([A-Z]+(?:-[A-Z]+)*-?)(\d*)(.*)$/.exec(id) || []; const g = id.startsWith('A') ? 0 : id.startsWith('P') ? 1 : id.startsWith('B') ? 2 : id.startsWith('S-') ? 4 : id.startsWith('V-') ? 5 : 3; return [g, Number(m[2] || 0), m[3] || ''] }
const byRole = (a, b) => { const x = order(a.id), y = order(b.id); return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2])) }

/**
 * Poskladá zoznam rolí z prehľadu dôkazov (môže chýbať) a z indexu Brainu (môže chýbať). Vráti null, ak nie je ani jedno.
 * Stav sa počíta k času prehľadu (asOf), nie k „teraz“: starý prehľad sa označí ako neaktuálny, nevydáva sa za dnešok.
 */
export function buildAgents(snap, ix, now = Date.now()) {
  const brain = brainByRole(ix)
  if (!snap && !brain.size) return null
  const S = snap || { asOf: null, roles: [], schedules: [], outputs: [], slack: [], coverage: [], asks: [] }
  const ref = Date.parse(S.asOf || (ix && ix.syncedAt) || new Date(now).toISOString())
  const fresh = (t, days) => !!t && ref - Date.parse(t) <= days * DAY
  const roster = new Map(S.roles.map((r) => [r.id, r]))
  const ids = new Set([...roster.keys(), ...brain.keys(), ...S.schedules.map((s) => s.role), ...S.outputs.map((o) => o.role), ...S.slack.map((m) => m.role)].filter(Boolean))
  const roles = [...ids].map((id) => {
    const b = brain.get(id) || null, r = roster.get(id) || {}
    const side = (rt) => {
      const sch = S.schedules.filter((s) => s.role === id && s.runtime === rt), out = S.outputs.filter((o) => o.role === id && o.runtime === rt), sl = S.slack.filter((m) => m.role === id && m.runtime === rt)
      const brainLast = b ? (rt === 'Claude' ? b.claudeLast : b.otherLast) : null
      const lastOut = maxIso(...out.map((o) => o.last)), lastSlack = maxIso(...sl.map((m) => m.last))
      const last = maxIso(lastOut, lastSlack, brainLast)
      if (!sch.length && !last) return null
      const active = sch.filter((s) => s.active)
      return { schedules: sch.length, active: active.length, every: (active[0] || sch[0] || {}).every || '', scheduleName: (active[0] || sch[0] || {}).name || '', lastRun: maxIso(...sch.map((s) => s.lastRun)), runOk: sch.some((s) => s.ok === false) ? false : sch.some((s) => s.ok === true) ? true : null, last, fresh: fresh(last, FRESH_DAYS), recent: fresh(last, RECENT_DAYS), lastWhere: !last ? '' : last === lastSlack ? 'Slack #ai-tim' : last === lastOut ? (out.find((o) => o.last === last) || {}).where || 'súbor' : 'Brain', files: out.reduce((n, o) => n + o.files, 0) }
    }
    const gpt = side('GPT'), claude = side('Claude')
    const unk = S.slack.filter((m) => m.role === id && !m.runtime), lastUnk = maxIso(...unk.map((m) => m.last))
    const last = maxIso(gpt && gpt.last, claude && claude.last, lastUnk, b && b.last)
    // rozvrh sa posudzuje v prostredí, kde beží: hodinový rozvrh GPT bez výstupu GPT je „bez výstupu“, aj keď tú istú rolu nedávno odovzdal Claude
    const running = [gpt, claude].filter((x) => x && x.active)
    const state = fresh(last, FRESH_DAYS) ? 'delivering' : running.length ? (running.every((x) => x.recent) ? 'scheduled' : 'idle') : last ? 'quiet' : 'registered'
    const func = r.func || ((gpt && gpt.scheduleName) || (claude && claude.scheduleName) || '').replace(/^.*?[—–-]\s+/, '').slice(0, 80)
    return { id, name: r.name || (b && b.name) || '', func, state, last, gpt, claude, brain: b ? { notes: b.notes, last: b.last, claudeNotes: b.claudeNotes, otherNotes: b.otherNotes } : null }
  }).sort(byRole)
  const other = S.schedules.filter((s) => !s.role).map((s) => ({ runtime: s.runtime, name: s.name, every: s.every, active: s.active, lastRun: s.lastRun, ok: s.ok }))
  const count = (st) => roles.filter((r) => r.state === st).length
  const rt = (k) => ({ schedules: S.schedules.filter((s) => s.runtime === k).length, active: S.schedules.filter((s) => s.runtime === k && s.active).length, roles: roles.filter((r) => { const x = r[k === 'GPT' ? 'gpt' : 'claude']; return x && (x.schedules || x.recent) }).length, roleSchedules: roles.filter((r) => { const x = r[k === 'GPT' ? 'gpt' : 'claude']; return x && x.active }).length, delivering: roles.filter((r) => { const x = r[k === 'GPT' ? 'gpt' : 'claude']; return x && fresh(x.last, FRESH_DAYS) }).length })
  const brainLast = maxIso(...[...brain.values()].map((b) => b.last))
  return {
    asOf: S.asOf, hasSnapshot: !!snap, stale: !!S.asOf && now - Date.parse(S.asOf) > 36 * 3600e3, roles, other, coverage: S.coverage,
    asks: (S.asks || []).map((a) => ({ ...a, name: (roster.get(a.role) || {}).name || (brain.get(a.role) || {}).name || '' })).sort((a, b) => String(b.at).localeCompare(String(a.at))),
    totals: { roles: roles.length, delivering: count('delivering'), scheduled: count('scheduled'), idle: count('idle'), quiet: count('quiet'), registered: count('registered'), gpt: rt('GPT'), claude: rt('Claude'), brainRoles: brain.size, brainLast, brainLastGpt: maxIso(...[...brain.values()].map((b) => b.otherLast)), brainLastClaude: maxIso(...[...brain.values()].map((b) => b.claudeLast)) },
  }
}
