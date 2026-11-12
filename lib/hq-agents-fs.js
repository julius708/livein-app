// Ústredňa – agenti: zber dôkazov z počítača (len Node, pre skript tools/ustredna/agents-sync.mjs).
// Číta len metadáta: názvy rozvrhov, stav, čas posledného behu, počty a časy súborov. Zadania (prompty) ani obsah súborov nečíta.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { roleOf, rruleText, cronText } from './hq-agents.js'

const SKIP = /(^|\/)(\.[^/]+|node_modules)(\/|$)/

/** Priečinky <rola>… v koreni: počet súborov a čas najnovšieho. Napr. Disk „Vystupy_agentov/A7“ alebo pracovný priečinok Codexu „A6b“. */
export function scanOutputs(root, { runtime, where, max = 20000 } = {}) {
  let dirs
  try { dirs = fs.readdirSync(root, { withFileTypes: true }) } catch { return [] }
  const out = []
  for (const d of dirs) {
    if (!d.isDirectory() || d.isSymbolicLink()) continue
    const role = roleOf(d.name.split('_')[0])
    if (!role || role !== d.name.split('_')[0]) continue
    let files = 0, last = 0
    const walk = (dir, rel) => {
      let es
      try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of es) {
        if (files >= max) return
        const r = rel + '/' + e.name
        if (e.isSymbolicLink() || SKIP.test(r)) continue
        if (e.isDirectory()) walk(path.join(dir, e.name), r)
        else if (e.isFile()) { files++; try { const t = fs.statSync(path.join(dir, e.name)).mtimeMs; if (t > last) last = t } catch {} }
      }
    }
    walk(path.join(root, d.name), d.name)
    if (files) out.push({ runtime, role, where, files, last: last ? new Date(last).toISOString() : null })
  }
  // viac priečinkov tej istej roly (A11, A11_sensitive) sa spočíta spolu
  const merged = new Map()
  for (const o of out) { const m = merged.get(o.role); if (!m) merged.set(o.role, o); else { m.files += o.files; if (o.last && (!m.last || o.last > m.last)) m.last = o.last } }
  return [...merged.values()]
}

const unq = (v) => String(v || '').trim().replace(/^"(.*)"$/, '$1')
/** Automatizácie Codexu: názov, stav, rozvrh, posledný beh. Najprv z databázy Codexu (len na čítanie, bez zadaní), inak zo súborov automation.toml. */
export function scanCodex(home) {
  const db = path.join(home, 'sqlite', 'codex.db')
  if (fs.existsSync(db)) {
    try {
      const raw = execFileSync('sqlite3', ['-readonly', '-json', 'file:' + db + '?immutable=1', 'select name, status, rrule, last_run_at from automations order by name'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] })
      const rows = JSON.parse(raw || '[]')
      if (rows.length) return rows.map((r) => ({ runtime: 'GPT', role: roleOf(r.name), name: r.name, every: rruleText(r.rrule), active: r.status === 'ACTIVE', lastRun: r.last_run_at ? new Date(Number(r.last_run_at)).toISOString() : null, ok: null }))
    } catch { /* bez sqlite3 alebo zamknutá databáza: skúsi súbory */ }
  }
  const dir = path.join(home, 'automations')
  let ids
  try { ids = fs.readdirSync(dir) } catch { return [] }
  const out = []
  for (const id of ids) {
    let text
    try { text = fs.readFileSync(path.join(dir, id, 'automation.toml'), 'utf8') } catch { continue }
    const get = (k) => { const m = new RegExp('^' + k + '\\s*=\\s*(.+)$', 'm').exec(text); return m ? unq(m[1]) : '' }
    const name = get('name'); if (!name) continue
    out.push({ runtime: 'GPT', role: roleOf(name), name, every: rruleText(get('rrule')), active: get('status') === 'ACTIVE', lastRun: null, ok: null })
  }
  return out
}

/** Rutiny Claude zo zoznamu, ktorý uložila relácia Claude (odpoveď /v1/code/triggers). Berie len názov, rozvrh, stav a posledný beh; zadania zahodí. */
export function readClaudeRoutines(file) {
  const s = fs.readFileSync(file, 'utf8'), a = s.indexOf('{'), b = s.lastIndexOf('}')
  const j = JSON.parse(s.slice(a, b + 1)), list = Array.isArray(j.data) ? j.data : []
  return {
    more: !!j.has_more,
    schedules: list.filter((x) => x && x.name && x.created_kind !== 'reminder').map((x) => {
      const lr = x.last_run || {}, st = String(lr.status || '')
      return { runtime: 'Claude', role: roleOf(x.name), name: String(x.name), every: x.cron_expression ? cronText(x.cron_expression) : 'jednorazovo', active: !!x.enabled, lastRun: lr.finished_at || lr.fired_at || x.last_fired_at || null, ok: /SUCCEEDED/.test(st) ? true : /FAILED|ERROR/.test(st) ? false : null }
    }),
  }
}

/** Meno a náplň rolí z registra Codexu (pole roles: [{ role, name }]); „name“ je tam náplň roly. */
export function readCodexRegister(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return (j.roles || []).filter((r) => r && r.role).map((r) => ({ id: String(r.role), func: String(r.name || '') })) } catch { return [] }
}
