// Atrapa Supabase klienta pre testy toku (len podmnožina dotazov, ktorú modul Investície používa).
// Emuluje unikátne kľúče (23505), predvolené hodnoty z migrácie, auto-id a rpc zámku. Nikdy sa nepoužíva v produkcii.
import { randomUUID } from 'node:crypto'

const UUID_TABLES = new Set(['inv_properties', 'inv_listings', 'inv_calcs', 'inv_merge_candidates', 'inv_inquiries', 'inv_matches', 'inv_tasks', 'inv_offers', 'leads'])
const SERIAL = new Set(['inv_events', 'inv_runs', 'inv_price_history', 'notifications', 'crm_sync_queue', 'lead_events'])
const UNIQUE = {
  inv_listings: [['source_key', 'external_id']], inv_matches: [['inquiry_id', 'property_id']], inv_calcs: [['property_id', 'input_hash'], ['property_id', 'version']],
  inv_merge_candidates: [['property_a', 'property_b']], inv_settings: [['key']], inv_sources: [['key']],
}
const nowIso = () => new Date().toISOString()
const DEFAULTS = {
  inv_properties: () => ({ status: 'new', price_currency: 'EUR', rental_mode: 'compare', rental: {}, features: {}, equipment: [], prov: {}, first_seen_at: nowIso(), created_at: nowIso(), updated_at: nowIso(), merged_into: null, last_checked_at: null, last_confirmed_at: null }),
  inv_listings: () => ({ state: 'active', missing_checks: 0, first_seen_at: nowIso(), created_at: nowIso(), updated_at: nowIso() }),
  inv_inquiries: () => ({ status: 'new', cities: [], areas: [], excluded_areas: [], types: [], rooms: [], conditions: [], must: {}, prefer: {}, created_at: nowIso(), updated_at: nowIso() }),
  inv_matches: () => ({ score: 0, decision: 'open', result: {}, needs_review: false, first_matched_at: nowIso(), updated_at: nowIso() }),
  inv_tasks: () => ({ status: 'open', created_at: nowIso() }),
  inv_offers: () => ({ status: 'draft', match_ids: [], content: {}, internal: {}, calc_snapshot: {}, created_at: nowIso(), updated_at: nowIso() }),
  inv_runs: () => ({ status: 'running', attempt: 1, started_at: nowIso(), heartbeat_at: nowIso(), stats: {}, source_results: [], cursor: {} }),
  inv_sources: () => ({ enabled: true, blocked: false, mode: 'both', config: {}, consecutive_failures: 0, created_at: nowIso(), updated_at: nowIso() }),
  inv_events: () => ({ payload: {}, at: nowIso() }), inv_price_history: () => ({ at: nowIso() }), inv_calcs: () => ({ created_at: nowIso() }),
  notifications: () => ({ created_at: nowIso(), read_at: null }),
}
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)))

export function fakeSupabase(seed = {}) {
  const db = { tables: {}, serial: {}, locks: {}, log: [] }
  for (const [t, rows] of Object.entries(seed)) db.tables[t] = rows.map((r) => ({ ...clone(r) }))
  const T = (t) => (db.tables[t] = db.tables[t] || [])
  const client = {
    db,
    from(table) {
      const q = { mode: 'select', filters: [], ord: null, lim: null, rng: null, rows: null, patch: null, one: null, head: false, count: false, returning: false }
      const test = (r) => q.filters.every((f) => f(r))
      const cmp = (op) => (c, v) => { q.filters.push((r) => op(r[c], v)); return b }
      const b = {
        select(cols, o) { if (q.mode === 'insert' || q.mode === 'update' || q.mode === 'delete') q.returning = true; if (o && o.head) q.head = true; if (o && o.count) q.count = true; return b },
        insert(rows) { q.mode = 'insert'; q.rows = Array.isArray(rows) ? rows : [rows]; return b },
        update(patch) { q.mode = 'update'; q.patch = patch; return b },
        delete() { q.mode = 'delete'; return b },
        eq: cmp((a, v) => a === v || (a != null && v != null && String(a) === String(v))),
        neq: cmp((a, v) => a !== v),
        gt: cmp((a, v) => a > v), gte: cmp((a, v) => a >= v), lt: cmp((a, v) => a < v), lte: cmp((a, v) => a <= v),
        in(c, arr) { q.filters.push((r) => arr.includes(r[c])); return b },
        is(c, v) { q.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b },
        not(c, op, v) { if (op === 'is') q.filters.push((r) => (v === null ? r[c] != null : r[c] !== v)); else if (op === 'in') q.filters.push((r) => !String(v).replace(/[()]/g, '').split(',').includes(String(r[c]))); return b },
        ilike(c, pat) { const re = new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); q.filters.push((r) => re.test(String(r[c] ?? ''))); return b },
        contains(c, arr) { q.filters.push((r) => arr.every((x) => (r[c] || []).includes(x))); return b },
        order(c, o = {}) { q.ord = [c, o.ascending !== false]; return b },
        limit(n) { q.lim = n; return b },
        range(a, z) { q.rng = [a, z]; return b },
        single() { q.one = 'single'; return b },
        maybeSingle() { q.one = 'maybe'; return b },
        then(res, rej) { return Promise.resolve(run()).then(res, rej) },
      }
      const err = (code, message) => ({ data: null, error: { code, message } })
      function run() {
        const rows = T(table)
        if (q.mode === 'insert') {
          const out = []
          for (const r0 of q.rows) {
            const r = { ...(DEFAULTS[table] ? DEFAULTS[table]() : {}), ...clone(r0) }
            if (UUID_TABLES.has(table) && !r.id) r.id = randomUUID()
            if (SERIAL.has(table) && r.id == null) r.id = (db.serial[table] = (db.serial[table] || 0) + 1)
            for (const keys of UNIQUE[table] || []) if (rows.some((x) => keys.every((k) => x[k] === r[k]))) return err('23505', `duplicate key (${keys.join(',')})`)
            rows.push(r); out.push(r)
          }
          return fin(out.map(clone))
        }
        let sel = rows.filter(test)
        if (q.mode === 'update') {
          for (const r of sel) {
            const next = { ...r, ...clone(q.patch) }
            for (const keys of UNIQUE[table] || []) if (rows.some((x) => x !== r && keys.every((k) => x[k] === next[k]))) return err('23505', 'duplicate key')
            Object.assign(r, next)
          }
          return fin(sel.map(clone))
        }
        if (q.mode === 'delete') { for (const r of sel) rows.splice(rows.indexOf(r), 1); return fin(sel.map(clone)) }
        if (q.ord) { const [c, asc] = q.ord; sel = [...sel].sort((x, y) => (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (asc ? 1 : -1)) }
        if (q.rng) sel = sel.slice(q.rng[0], q.rng[1] + 1)
        if (q.lim != null) sel = sel.slice(0, q.lim)
        if (q.head) return { data: null, error: null, count: sel.length }
        return fin(sel.map(clone), q.count ? sel.length : undefined)
      }
      function fin(out, count) {
        if (q.mode !== 'select' && !q.returning) return { data: null, error: null }
        if (q.one === 'single') return out.length === 1 ? { data: out[0], error: null } : err('PGRST116', 'no rows or many rows')
        if (q.one === 'maybe') return out.length <= 1 ? { data: out[0] || null, error: null } : err('PGRST116', 'many rows')
        return { data: out, error: null, ...(count !== undefined ? { count } : {}) }
      }
      return b
    },
    async rpc(name, args) {
      if (name === 'inv_acquire_lock') {
        const l = db.locks[args.p_name]
        if (l && l.until > Date.now()) return { data: false, error: null }
        db.locks[args.p_name] = { until: Date.now() + args.p_ttl_seconds * 1000, run: args.p_run }
        return { data: true, error: null }
      }
      if (name === 'inv_release_lock') { const l = db.locks[args.p_name]; if (l && l.run === args.p_run) l.until = 0; return { data: null, error: null } }
      return { data: null, error: { message: 'unknown rpc ' + name } }
    },
  }
  return client
}
export const fakeNow = (iso) => new Date(iso).getTime()
