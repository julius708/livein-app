// Ústredňa – skúška toku roly (pilot): hľadá označenie pilotu (napr. GH-PILOT-20261120-01) na každom kroku cesty do ústredne.
// Nič nezapisuje a nikam nič neposiela. Zmienka o pilote nie je dôkaz behu: výstup roly sa počíta len vtedy,
// keď je správa v Slacku podpísaná rolou alebo súbor leží v priečinku roly.
// Tri veci sa nemiešajú: dôkaz (true/false), neoverené (null) a lokálny model toho, čo by ústredňa ukázala (nikdy nie je dôkaz).
// Vstup do roly je mimo dosahu ústredne, preto ostáva neoverený a výsledok „doložené“ tento skript sám nevydá. Len Node.
import fs from 'node:fs'
import path from 'node:path'
import { namedRole, roleOf, sanitizeAgents, buildAgents, AGENTS_VERSION, AGENT_STATE } from './hq-agents.js'
import { scanOutputs } from './hq-agents-fs.js'
import { summarizeSlack } from './hq-agents-slack.js'
import { scanVault } from './hq-vault-fs.js'

const TEXT = /\.(md|txt|json|csv|html?)$/i, SKIP = /(^|\/)(\.[^/]+|node_modules)(\/|$)/, MAX = 1024 * 1024

/** Súbory v priečinku, ktoré majú označenie v názve alebo v texte. Dokumenty Google (.gdoc) sú na disku len odkaz, ich text sa tu prehľadať nedá. */
export function findMarked(dir, id, { limit = 5000 } = {}) {
  const hits = []
  let files = 0, gdocs = 0, last = 0
  const walk = (d, rel) => {
    let es
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      if (files >= limit) return
      const r = rel ? rel + '/' + e.name : e.name
      if (e.isSymbolicLink() || SKIP.test(r)) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) { walk(full, r); continue }
      if (!e.isFile()) continue
      files++
      if (/\.g(doc|sheet|slides)$/i.test(e.name)) gdocs++
      let st
      try { st = fs.statSync(full) } catch { continue }
      if (st.mtimeMs > last) last = st.mtimeMs
      let by = e.name.includes(id) ? 'názov' : ''
      if (!by && TEXT.test(e.name) && st.size <= MAX) { try { if (fs.readFileSync(full, 'utf8').includes(id)) by = 'obsah' } catch { /* nečitateľný súbor sa nepočíta */ } }
      if (by) hits.push({ file: r, at: st.mtime.toISOString(), by })
    }
  }
  walk(dir, '')
  return { hits: hits.sort((a, b) => a.at.localeCompare(b.at)), files, gdocs, last: last ? new Date(last).toISOString() : null }
}

/** Priečinky roly v koreni výstupov: pomenovaná rola podľa celého mena („GROK_HUB“ aj „GROK-HUB“), číselná podľa ID pred podčiarkovníkom. */
export function roleDirs(root, role) {
  let ds
  try { ds = fs.readdirSync(root, { withFileTypes: true }) } catch { return [] }
  return ds.filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => d.name).filter((n) => { const head = n.split('_')[0]; return namedRole(n) === role || (roleOf(head) === role && head === role) })
}

/** Výsledok: chýba dôkaz (aspoň jeden povinný krok je false) · neoverené (nič nezlyhalo, ale niečo sa overiť nedalo) · doložené (všetko true). */
export const PILOT_VERDICT = { missing: 'CHÝBA DÔKAZ', unverified: 'NEOVERENÉ', proven: 'DOLOŽENÉ' }

/**
 * Prejde kroky toku a vráti správu. Každý krok má `ok`: true = je dôkaz, false = dôkaz chýba, null = neoverené.
 * `snapshot` je prehľad agentov, ktorý má PRODUKČNÁ ústredňa (dodá ho ten, kto ho z produkcie vzal); bez neho je produkčná viditeľnosť neoverená.
 * Lokálny model (čo by ústredňa ukázala po zbere z týchto podkladov) sa počíta vždy, ale dôkazom nie je a do výsledku nevstupuje.
 */
export function pilotCheck({ id, role, outputs = [], vault = '', slackTexts = [], snapshot = null, now = new Date() } = {}) {
  if (!id || !role) throw new Error('Chýba označenie pilotu alebo rola.')
  const slack = summarizeSlack(slackTexts.join('\n\n'), { marker: id })
  const own = slack.hits.filter((h) => h.role === role), mentions = slack.hits.filter((h) => h.role !== role)

  const disk = { hits: [], dirs: [], files: 0, gdocs: 0 }
  for (const root of outputs) for (const name of roleDirs(root, role)) {
    const f = findMarked(path.join(root, name), id)
    disk.dirs.push(path.basename(root) + '/' + name); disk.files += f.files; disk.gdocs += f.gdocs
    disk.hits.push(...f.hits.map((h) => ({ ...h, file: name + '/' + h.file })))
  }

  const brain = { dir: false, notes: 0, index: false, hits: [] }
  if (vault) {
    const d = path.join(vault, 'Agenti', role)
    if (fs.existsSync(d)) { const f = findMarked(d, id); brain.dir = true; brain.hits = f.hits; brain.index = fs.existsSync(path.join(d, '00_Index.md')); brain.notes = f.files - f.gdocs }
  }

  const show = (view) => { const r = view && view.roles.find((x) => x.id === role); return r ? { state: r.state, label: AGENT_STATE[r.state].label, last: r.last, name: r.name, runtimes: ['gpt', 'claude', 'grok'].filter((k) => r[k]), brainNotes: r.brain ? r.brain.notes : 0 } : null }
  // lokálny model: zber z tých istých podkladov na tomto počítači
  const local = { v: AGENTS_VERSION, asOf: now.toISOString(), roles: [], schedules: [], slack: slack.roles, coverage: [], asks: [], outputs: outputs.flatMap((root) => scanOutputs(root, { runtime: 'Claude', where: 'Disk · ' + path.basename(root) })) }
  const model = show(buildAgents(sanitizeAgents(local), vault ? scanVault(vault, { now }) : null, now.getTime()))
  // produkcia: len z dodaného prehľadu; index trezoru v produkcii skript nevidí
  const prod = snapshot ? show(buildAgents(sanitizeAgents(snapshot), null, now.getTime())) : null
  const prodAsOf = snapshot && Number.isFinite(Date.parse(snapshot.asOf)) ? new Date(snapshot.asOf).toISOString() : null
  const covered = !!prodAsOf && own.concat(disk.hits).some((h) => h.at <= prodAsOf)   // prehľad vznikol až po výstupe pilotu

  const steps = [
    { key: 'vstup', label: 'Vstup do roly', ok: null, note: 'Neoverené a z ústredne neoveriteľné: čo rola dostala a kedy, vie doložiť len jej vlastné prostredie.' },
    { key: 'slack', label: 'Hlásenie v Slacku podpísané rolou', ok: own.length > 0, items: own, mentions, note: slack.stats.messages ? '' : 'Nebol dodaný žiadny výpis Slacku.' },
    { key: 'disk', label: 'Výstup v priečinku roly na disku', ok: disk.hits.length > 0, items: disk.hits, dirs: disk.dirs, note: !disk.dirs.length ? 'Priečinok roly vo výstupoch nie je.' : disk.hits.length ? '' : !disk.files ? 'Priečinok roly je prázdny.' : disk.gdocs ? `V priečinku je ${disk.gdocs} dokumentov Google; ich text sa z disku prehľadať nedá.` : 'V priečinku roly nie je súbor s označením pilotu.' },
    { key: 'brain', label: 'Zápis v priečinku roly v trezore', ok: brain.hits.length > 0, optional: true, items: brain.hits, note: !vault ? 'Trezor nebol zadaný.' : !brain.dir ? `Priečinok Agenti/${role} neexistuje.` : !brain.notes ? `Priečinok Agenti/${role} je prázdny.` : brain.index ? '' : 'Chýba 00_Index.md (meno roly sa berie z jeho nadpisu).' },
    { key: 'model', label: 'Lokálny model: čo by ústredňa ukázala po zbere z týchto podkladov', ok: null, model: true, shown: model, note: 'Nie je dôkaz. Je to výpočet na tomto počítači, nie stav produkcie.' + (model ? '' : ' Rola by v zozname nebola.') },
    { key: 'produkcia', label: 'Rola v prehľade, ktorý má produkčná ústredňa', ok: snapshot ? !!prod && prod.state === 'delivering' && covered : null, shown: prod, asOf: prodAsOf,
      note: !snapshot ? 'Neoverené: nebol dodaný prehľad z produkcie.' : !prod ? 'Rola v dodanom prehľade nie je.' : prod.state !== 'delivering' ? 'Rola v prehľade je, ale nie ako „Dodáva“.' : covered ? 'Že dodaný prehľad naozaj pochádza z produkcie, skript neoveruje.' : 'Prehľad je starší ako výstup pilotu, pilot v ňom byť nemôže.' },
  ]
  const required = steps.filter((x) => !x.optional && !x.model)
  const verdict = required.some((x) => x.ok === false) ? 'missing' : required.some((x) => x.ok === null) ? 'unverified' : 'proven'
  return { id, role, at: now.toISOString(), verdict, verdictLabel: PILOT_VERDICT[verdict], ok: verdict === 'proven', unverified: required.filter((x) => x.ok === null).map((x) => x.key), failed: required.filter((x) => x.ok === false).map((x) => x.key), steps, slack: slack.stats }
}
