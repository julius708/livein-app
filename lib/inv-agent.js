// Agent na vyhľadávanie a aktualizáciu: beh na pozadí (cron na serveri), zámok proti súbežným behom, priebežné ukladanie postupu, opakovanie po chybe, história behov.
// Pri výpadku zdroja zostávajú posledné platné údaje; „stiahnuté“ sa nastaví len po úspešnom a úplnom prehľadaní alebo po opakovanom 404 na samotnom inzeráte.
import { loadSettings, ingestListing, markMissing, matchInquiry, recalcProperty, notifyDigest, passesFilters, relevantToInquiry, refreshWithdrawn } from './inv-store.js'
import { runSource, checkUrl } from './inv-sources.js'
import { normalizeListing, ACTIVE_INQ } from './inv-core.js'

const iso = (d = Date.now()) => new Date(d).toISOString()
const LOCK = 'invest-run'
const log = (...a) => console.log('[invest-agent]', ...a)

/* ---------------- plán behu (Europe/Bratislava) ---------------- */
function tzOffset(ts, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const o = {}
  for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value
  return Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour === '24' ? 0 : o.hour), Number(o.minute), Number(o.second)) - ts
}
export function localDate(ts, tz = 'Europe/Bratislava') { const l = ts + tzOffset(ts, tz); return new Date(l).toISOString().slice(0, 10) }
/** Okamih (UTC ms) daného lokálneho dňa a času „HH:MM“ v časovom pásme. */
export function zonedTime(ymd, hhmm, tz = 'Europe/Bratislava') {
  const [y, m, d] = ymd.split('-').map(Number), [h, mi] = String(hhmm || '07:00').split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0)
  let t = guess - tzOffset(guess, tz)
  t = guess - tzOffset(t, tz)
  return t
}
/** Kedy je plánovaný najbližší beh (UTC ms) podľa nastavení a posledného behu. */
export function nextPlannedRun(agent, lastRun, now = Date.now()) {
  if (!agent.enabled) return null
  const tz = agent.timezone || 'Europe/Bratislava'
  if (Number(agent.interval_hours) >= 24) {
    const todayAt = zonedTime(localDate(now, tz), agent.run_at_local, tz)
    const started = lastRun ? Date.parse(lastRun.started_at) : 0
    if (now < todayAt) return todayAt
    if (started >= todayAt) { const tomorrow = localDate(now + 24 * 3600e3, tz); return zonedTime(tomorrow, agent.run_at_local, tz) }
    return todayAt   // meškajúci beh: spustí sa pri najbližšom tiku cronu
  }
  const iv = Math.max(1, Number(agent.interval_hours) || 24) * 3600e3
  return lastRun ? Math.max(Date.parse(lastRun.started_at) + iv, 0) : now
}
/** Je teraz čas spustiť beh? Zohľadní plán, opakovanie po chybe a práve bežiaci beh. */
export function isRunDue({ agent, lastRun, now = Date.now() }) {
  if (!agent.enabled) return { due: false, reason: 'agent je vypnutý' }
  if (lastRun && lastRun.status === 'running' && now - Date.parse(lastRun.heartbeat_at) < 15 * 60e3) return { due: false, reason: 'beh práve prebieha' }
  if (lastRun && ['failed', 'partial'].includes(lastRun.status) && (lastRun.attempt || 1) < (agent.max_attempts || 3)) {
    const fin = Date.parse(lastRun.finished_at || lastRun.heartbeat_at || lastRun.started_at)
    const window = now - Date.parse(lastRun.started_at) < 12 * 3600e3
    if (window && now - fin >= (agent.retry_minutes || 60) * 60e3) return { due: true, reason: 'opakovanie po chybe', retry: true, resume: lastRun }
  }
  const next = nextPlannedRun(agent, lastRun, now)
  return next != null && now >= next ? { due: true, reason: 'plánovaný beh' } : { due: false, reason: 'ešte nie je čas', next }
}

/* ---------------- zdravie zdrojov ---------------- */
async function sourceHealth(s, src, r, now) {
  const patch = r.status === 'ok' ? { last_ok_at: iso(now), last_error: null, consecutive_failures: 0, blocked: false, blocked_reason: null }
    : r.status === 'blocked' ? { blocked: true, blocked_reason: String(r.error || 'zablokované').slice(0, 200), last_error: String(r.error || 'zablokované').slice(0, 200), last_error_at: iso(now), consecutive_failures: (src.consecutive_failures || 0) + 1 }
    : r.status === 'error' ? { last_error: String(r.error || 'chyba').slice(0, 200), last_error_at: iso(now), consecutive_failures: (src.consecutive_failures || 0) + 1 }
    : null
  if (patch) await s.from('inv_sources').update(patch).eq('key', src.key)
}

/** Opätovná kontrola už evidovaných inzerátov (cena a stav). 404/410 dvakrát po sebe = odstránený; blokovanie, 5xx a výpadok siete nič nemenia. */
export async function refreshListings(s, { settings, fetchImpl, budgetMs = 30000, limit = 25, now = Date.now(), robotsCache = new Map(), touched = new Set(), skipRecentHours = 12 }) {
  const t0 = Date.now()
  const out = { checked: 0, updated: 0, gone: 0, removed: 0, blocked: 0, errors: 0, skipped_recent: 0 }
  const rows = (await s.from('inv_listings').select('id,property_id,source_key,external_id,url,state,missing_checks,last_checked_at').eq('state', 'active')).data || []
  const cutoff = now - skipRecentHours * 3600e3
  const due = rows.filter((l) => l.url).filter((l) => { const stale = !l.last_checked_at || Date.parse(l.last_checked_at) < cutoff; if (!stale) out.skipped_recent++; return stale })
    .sort((a, b) => (Date.parse(a.last_checked_at) || 0) - (Date.parse(b.last_checked_at) || 0)).slice(0, limit)
  const blockedHosts = new Set()
  for (const l of due) {
    if (Date.now() - t0 > budgetMs) break
    const host = (() => { try { return new URL(l.url).hostname } catch { return '' } })()
    if (blockedHosts.has(host)) continue
    const r = await checkUrl(l.url, { fetchImpl, robotsCache, now })
    out.checked++
    if (r.state === 'ok') {
      const { data: prop } = await s.from('inv_properties').select('city,address').eq('id', l.property_id).maybeSingle()
      const raw = { ...r.listing, source_key: l.source_key, external_id: l.external_id, city: r.listing.city || (prop && prop.city) }
      const x = await ingestListing(s, raw, { settings, via: 'refresh', now })
      if (x.ok) { out.updated++; touched.add(x.property_id) } else out.errors++
    } else if (r.state === 'gone') {
      out.gone++
      const m = (l.missing_checks || 0) + 1
      const threshold = (settings.agent && settings.agent.missing_before_removed) || 2
      await s.from('inv_listings').update({ missing_checks: m, last_checked_at: iso(now), ...(m >= threshold ? { state: 'removed' } : {}) }).eq('id', l.id)
      if (m >= threshold) { out.removed++; if (await refreshWithdrawn(s, l.property_id)) touched.add(l.property_id) }
    } else if (r.state === 'blocked') { out.blocked++; blockedHosts.add(host) }
    else out.errors++
    await new Promise((res) => setTimeout(res, fetchImpl === fetch ? 1200 : 0))
  }
  out.blocked_hosts = [...blockedHosts]
  return out
}

/**
 * Jeden beh agenta. Idempotentný a bezpečný pri opakovaní: zámok, priebežný postup v inv_runs, výsledky po zdrojoch.
 * @param opts { trigger, mode, now, fetchImpl, maxMs, resume }
 */
export async function runAgent(s, opts = {}) {
  const now = opts.now || Date.now()
  const trigger = opts.trigger || 'cron'
  const fetchImpl = opts.fetchImpl || fetch
  const maxMs = opts.maxMs || 90000
  const started = Date.now()
  const clock = () => now + (Date.now() - started)   // časy behu sa odvíjajú od `now` (pri skutočnom behu ide o aktuálny čas)
  const settings = opts.settings || (await loadSettings(s))
  const mode = opts.mode || (settings.agent.general && settings.agent.targeted ? 'both' : settings.agent.general ? 'general' : settings.agent.targeted ? 'targeted' : 'both')
  const runId = `${trigger}-${now}-${Math.random().toString(36).slice(2, 7)}`
  const lock = await s.rpc('inv_acquire_lock', { p_name: LOCK, p_ttl_seconds: Math.ceil(maxMs / 1000) + 180, p_run: runId })
  if (lock.error) throw new Error('zámok: ' + lock.error.message)
  if (!lock.data) return { ok: false, locked: true, message: 'Beh už prebieha (zámok proti súbežným behom).' }
  let run = null
  try {
    const prev = opts.resume || null
    const ins = await s.from('inv_runs').insert({ mode, trigger, attempt: prev ? (prev.attempt || 1) + 1 : 1, cursor: { done: prev && prev.cursor && prev.cursor.done ? prev.cursor.done : [] }, started_at: iso(now), heartbeat_at: iso(now) }).select('*').single()
    if (ins.error) throw new Error('beh: ' + ins.error.message)
    run = ins.data
    const done = new Set(run.cursor.done || [])
    const beat = async (patch = {}) => { await s.from('inv_runs').update({ heartbeat_at: iso(clock()), ...patch }).eq('id', run.id) }
    const touched = new Set(), results = [], stats = { sources_total: 0, sources_ok: 0, sources_failed: 0, sources_blocked: 0, found: 0, created: 0, updated: 0, merged: 0, suggested: 0, price_changes: 0, filtered: 0, invalid: 0, errors: 0, removed: 0, withdrawn: 0, matches_created: 0, matches_updated: 0, notifications: 0 }

    // 1–4: zdroje → inzeráty → normalizácia a duplicity → uloženie
    const srcs = ((await s.from('inv_sources').select('*').eq('enabled', true)).data || []).filter((x) => x.kind !== 'ingest' && (mode === 'both' || x.mode === 'both' || x.mode === mode))
    const inquiries = ((await s.from('inv_inquiries').select('*').in('status', ACTIVE_INQ)).data || [])
    stats.sources_total = srcs.length
    const robotsCache = new Map()
    let timedOut = false
    for (const src of srcs) {
      if (done.has(src.key)) { results.push({ key: src.key, name: src.name, status: 'ok', resumed: true }); stats.sources_ok++; continue }
      if (Date.now() - started > maxMs * 0.6) { timedOut = true; results.push({ key: src.key, name: src.name, status: 'pending', note: 'pokračuje v ďalšom behu' }); continue }
      const t0 = Date.now()
      const r = await runSource(src, { fetchImpl, aiFetch: opts.aiFetch || fetchImpl, budgetMs: Math.max(5000, maxMs * 0.4), now, inquiries: mode === 'general' ? [] : inquiries, robotsCache, filters: settings.agent.filters, mode })
      const row = { key: src.key, name: src.name, status: r.status, fetched: r.fetched, found: r.listings.length, created: 0, updated: 0, merged: 0, filtered: 0, invalid: 0, errors: 0, notes: r.notes, error: r.error, ms: 0 }
      const seen = []
      if (r.status === 'ok') {
        for (const raw of r.listings) {
          const n = normalizeListing(raw)
          if (n.external_id) seen.push(n.external_id)
          const wanted = (mode !== 'targeted' && passesFilters(n, settings.agent.filters)) || (mode !== 'general' && inquiries.some((q) => relevantToInquiry(n, q)))
          if (!wanted) { row.filtered++; continue }
          try {
            const x = await ingestListing(s, raw, { settings, via: 'agent:' + src.key, now })
            if (!x.ok) { row.invalid++; continue }
            touched.add(x.property_id)
            if (x.created) row.created++; else if (x.merged) row.merged++; else row.updated++
            if (x.price && x.price.changed) stats.price_changes++
            if (x.suggested) stats.suggested++
          } catch (e) { row.errors++; log('ingest', String(e && e.message).slice(0, 120)) }
        }
        if (r.complete) {   // úplný prehľad: chýbajúce inzeráty (po opakovaní) sa označia ako odstránené, nikdy automaticky ako predané
          const mm = await markMissing(s, src.key, seen, { complete: true, ok: true, threshold: settings.agent.missing_before_removed || 2, now })
          row.removed = mm.removed; row.missing = mm.missing; stats.removed += mm.removed || 0; stats.withdrawn += (mm.withdrawn || []).length
          for (const pid of mm.withdrawn || []) touched.add(pid)
        } else row.note_incomplete = 'Zdroj nie je úplný prehľad: chýbajúce inzeráty sa neoznačujú.'
        done.add(src.key)
      }
      row.ms = Date.now() - t0
      results.push(row)
      stats.found += row.found; stats.created += row.created; stats.updated += row.updated; stats.merged += row.merged; stats.filtered += row.filtered; stats.invalid += row.invalid; stats.errors += row.errors
      if (r.status === 'ok') stats.sources_ok++; else if (r.status === 'blocked') stats.sources_blocked++; else if (r.status === 'error') stats.sources_failed++
      await sourceHealth(s, src, r, now)
      await beat({ cursor: { done: [...done] }, source_results: results, stats })
    }

    // 5: overenie cien a stavu už evidovaných ponúk
    const rf = await refreshListings(s, { settings, fetchImpl, budgetMs: Math.max(5000, maxMs * 0.25), now, robotsCache, touched })
    stats.refresh = rf; stats.removed += rf.removed || 0
    await beat({ source_results: results, stats })

    // 6: výpočty (nová verzia len pri zmene vstupov alebo nastavení)
    const allProps = ((await s.from('inv_properties').select('id,calc_id').is('merged_into', null)).data || [])
    const calcRows = ((await s.from('inv_settings').select('key,updated_at').eq('key', 'calc')).data || [])
    const lastOk = ((await s.from('inv_runs').select('started_at').in('status', ['ok', 'partial']).order('started_at', { ascending: false }).limit(1)).data || [])[0]
    const settingsChanged = calcRows[0] && (!lastOk || Date.parse(calcRows[0].updated_at) > Date.parse(lastOk.started_at))
    let recalced = 0
    for (const p of allProps) if (settingsChanged || !p.calc_id || touched.has(p.id)) { await recalcProperty(s, p.id, settings); recalced++ }
    stats.recalculated = recalced

    // 7: párovanie so všetkými aktívnymi dopytmi
    for (const q of inquiries) { const m = await matchInquiry(s, q.id, { settings, now }); if (m.ok) { stats.matches_created += m.stats.created; stats.matches_updated += m.stats.updated } }

    // 8: prehľad pre zodpovednú osobu
    const dg = await notifyDigest(s, { now })
    stats.notifications = dg.sent

    const noSources = srcs.length === 0
    const status = timedOut ? 'partial' : stats.sources_failed + stats.sources_blocked > 0 ? (stats.sources_ok > 0 ? 'partial' : 'failed') : 'ok'
    stats.no_sources = noSources
    const errTxt = results.filter((x) => x.error).map((x) => `${x.name || x.key}: ${x.error}`).join(' | ') || null
    await s.from('inv_runs').update({ status, finished_at: iso(clock()), heartbeat_at: iso(clock()), stats, source_results: results, cursor: { done: [...done] }, error: errTxt }).eq('id', run.id)
    return { ok: true, run_id: run.id, status, stats, sources: results }
  } catch (e) {
    const msg = String(e && e.message).slice(0, 300)
    log('beh zlyhal', msg)
    if (run) await s.from('inv_runs').update({ status: 'failed', finished_at: iso(clock()), error: msg }).eq('id', run.id)
    return { ok: false, error: msg, run_id: run && run.id }
  } finally {
    await s.rpc('inv_release_lock', { p_name: LOCK, p_run: runId })
  }
}

/** Volá cron každých 30 minút: spustí beh, len ak je podľa plánu čas (alebo treba opakovať po chybe). */
export async function runIfDue(s, opts = {}) {
  const now = opts.now || Date.now()
  const settings = opts.settings || (await loadSettings(s))
  const last = ((await s.from('inv_runs').select('*').order('started_at', { ascending: false }).limit(1)).data || [])[0] || null
  const d = isRunDue({ agent: settings.agent, lastRun: last, now })
  if (!d.due) return { ran: false, reason: d.reason, next: d.next ? iso(d.next) : null }
  const r = await runAgent(s, { ...opts, settings, trigger: d.retry ? 'retry' : 'cron', resume: d.resume || null, now })
  return { ran: true, reason: d.reason, ...r }
}

/** Stav agenta pre administrátora: posledný úspešný beh, ďalší plánovaný, aktívny len po skutočne úspešnom behu so zdrojom. */
export function agentStatus({ settings, runs, sources, now = Date.now() }) {
  const last = runs[0] || null
  const lastOk = runs.find((r) => ['ok', 'partial'].includes(r.status) && ((r.stats || {}).sources_ok || 0) > 0) || null
  const configured = sources.filter((x) => x.enabled && x.kind !== 'ingest').length
  const ingestOk = sources.some((x) => x.kind === 'ingest' && x.last_ok_at)
  const next = nextPlannedRun(settings.agent, last, now)
  const state = !settings.agent.enabled ? 'vypnuté' : lastOk || ingestOk ? 'aktívne' : configured === 0 ? 'nenakonfigurované (chýba aspoň jeden zdroj)' : 'čaká na prvý úspešný beh'
  return { state, active: !!(lastOk || ingestOk) && settings.agent.enabled, last, lastOk, next: next ? iso(next) : null, configured, blocked: sources.filter((x) => x.blocked), failing: sources.filter((x) => x.consecutive_failures > 0) }
}
