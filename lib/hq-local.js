// Ústredňa – lokálny register v súbore JSON (len vývoj a lokálny runtime na Macu; v produkcii sa nikdy nepoužije).
// Zapína sa premennou HQ_LOCAL_STORE=<cesta k súboru> mimo produkcie. Podmnožina rozhrania Supabase klienta, ktorú používa lib/hq-store.js,
// s rovnakými unikátnymi kľúčmi ako migrácia 20261114_ustredna.sql (chyba 23505), aby sa lokálny beh správal ako databáza.
import fs from 'node:fs'
import path from 'node:path'

const UNIQUE = {
  hq_events: [['workspace_id', 'event_id'], ['workspace_id', 'source', 'source_event_id'], ['workspace_id', 'task_id', 'sequence']],
  hq_actors: [['id']], hq_sources: [['key']], hq_links: [['workspace_id', 'kind', 'external_id']],
}
const SERIAL = new Set(['hq_events', 'hq_quarantine'])
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)))

export function localStore(file = null) {
  let db = { tables: {}, serial: {} }
  const load = () => {
    if (!file) return
    for (let attempt = 0; ; attempt++) {
      try { db = JSON.parse(fs.readFileSync(file, 'utf8')); break } catch (e) {
        if (e.code === 'ENOENT') { db = { tables: {}, serial: {} }; break }
        if (attempt >= 3 || !(e instanceof SyntaxError)) throw e   // iný proces práve súbor vymieňa: krátko počkať a skúsiť znova; poškodený súbor sa nikdy nepovažuje za prázdny
        const until = Date.now() + 25; while (Date.now() < until) { /* krátke čakanie */ }
      }
    }
    db.tables = db.tables || {}; db.serial = db.serial || {}
  }
  const save = () => {
    if (!file) return
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp-' + process.pid
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1)); fs.renameSync(tmp, file)   // atomická výmena súboru
  }
  const T = (t) => (db.tables[t] = db.tables[t] || [])
  return {
    local: true, file,
    get db() { load(); return db },
    from(table) {
      const q = { mode: 'select', filters: [], ord: null, lim: null, rows: null, patch: null, one: null, returning: false }
      const err = (code, message) => ({ data: null, error: { code, message } })
      const b = {
        select() { if (q.mode !== 'select') q.returning = true; return b },
        insert(rows) { q.mode = 'insert'; q.rows = Array.isArray(rows) ? rows : [rows]; return b },
        update(patch) { q.mode = 'update'; q.patch = patch; return b },
        upsert(rows) { q.mode = 'upsert'; q.rows = Array.isArray(rows) ? rows : [rows]; return b },
        eq(c, v) { q.filters.push((r) => r[c] === v); return b },
        in(c, arr) { q.filters.push((r) => arr.includes(r[c])); return b },
        order(c, o = {}) { q.ord = [c, o.ascending !== false]; return b },
        limit(n) { q.lim = n; return b },
        single() { q.one = 'single'; return b },
        maybeSingle() { q.one = 'maybe'; return b },
        then(res, rej) { return Promise.resolve().then(run).then(res, rej) },
      }
      const fin = (out) => {
        if (q.mode !== 'select' && !q.returning) return { data: null, error: null }
        if (q.one === 'single') return out.length === 1 ? { data: out[0], error: null } : err('PGRST116', 'no rows or many rows')
        if (q.one === 'maybe') return out.length <= 1 ? { data: out[0] || null, error: null } : err('PGRST116', 'many rows')
        return { data: out, error: null }
      }
      // Celá operácia (načítanie, kontrola unikátnosti, zápis) prebehne synchrónne, takže v jednom procese je atomická.
      function run() {
        load()
        const rows = T(table)
        const clash = (r, self) => (UNIQUE[table] || []).find((keys) => rows.some((x) => x !== self && keys.every((k) => x[k] === r[k])))
        if (q.mode === 'insert') {
          const out = []
          for (const r0 of q.rows) {
            const r = clone(r0)
            if (SERIAL.has(table) && r.id == null) r.id = (db.serial[table] = (db.serial[table] || 0) + 1)
            const keys = clash(r, null)
            if (keys) return err('23505', `duplicate key (${keys.join(',')})`)
            rows.push(r); out.push(r)
          }
          save(); return fin(out.map(clone))
        }
        if (q.mode === 'upsert') {
          const keys = (UNIQUE[table] || [['id']])[0]
          for (const r0 of q.rows) { const ex = rows.find((x) => keys.every((k) => x[k] === r0[k])); if (ex) Object.assign(ex, clone(r0)); else rows.push(clone(r0)) }
          save(); return fin(q.rows.map(clone))
        }
        let sel = rows.filter((r) => q.filters.every((f) => f(r)))
        if (q.mode === 'update') {
          for (const r of sel) { const next = { ...r, ...clone(q.patch) }; if (clash(next, r)) return err('23505', 'duplicate key'); Object.assign(r, next) }
          save(); return fin(sel.map(clone))
        }
        if (q.ord) { const [c, asc] = q.ord; sel = [...sel].sort((x, y) => (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (asc ? 1 : -1)) }
        if (q.lim != null) sel = sel.slice(0, q.lim)
        return fin(sel.map(clone))
      }
      return b
    },
  }
}
