// Spoločný kód pre všetky appky LIVE-IN: zdroj je táto (hlavná) appka, ostatné appky dostanú rovnaké kópie.
//   node tools/sync-shared.mjs          prepíše kópie v susedných repozitároch (../livein-cs, ../livein-ring)
//   node tools/sync-shared.mjs --check  nič nezapíše, skončí chybou, ak sa niektorá kópia líši (použité aj v teste)
// Appky Znalosti a Zaradenie sa tu nesynchronizujú: pripájajú sa do hlavnej appky a ich kópie zaniknú.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://app.live-in.international'

/** Adresy modulov, ktoré bežia pod hlavnou doménou ako samostatné nasadenia (nie sú v MODULES ako `href`). */
const MOUNTS = { ring: '/ring', cs: '/cs', pracovna: '/pracovna', onboarding: '/zaradenie', kb: '/kb', economy: '/ekonomika/' }

const GROUPLESS_HEAD = (n) => `// Rovnaký zoznam ako dlaždice na domove hlavnej appky (lib/modules.js). GENEROVANÉ príkazom \`node tools/sync-shared.mjs\` v hlavnej appke – neupravovať ručne, zmeny rob v hlavnej appke.\n`

/** Zoznam aplikácií z hlavnej appky: len moduly s pevnou adresou, v poradí ako na domove. */
export function appsList(MODULES) {
  const list = [{ id: 'home', icon: '🏠', title: 'Domov', desc: 'Prehľad dňa, nástenka, čísla.', url: ORIGIN + '/', roles: ['*'] }]
  for (const m of MODULES) {
    const url = m.href ? (/^https?:/.test(m.href) ? m.href : ORIGIN + m.href) : MOUNTS[m.id] ? ORIGIN + MOUNTS[m.id] : null
    if (!url) continue
    list.push({ id: m.id, icon: m.icon, title: m.title, desc: m.desc, url, roles: m.roles })
  }
  return list
}

/** Zdrojový text AppsMenu.js pre appky bez vlastného zoznamu: kód komponentu je z hlavnej appky, zoznam sa dosadí. */
export function appsMenuSource(hubSource, apps) {
  const q = (v) => (Array.isArray(v) ? '[' + v.map(q).join(', ') + ']' : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'")
  const lines = apps.map((a) => `  { id: ${q(a.id)}, icon: ${q(a.icon)}, title: ${q(a.title)}, desc: ${q(a.desc)}, url: ${q(a.url)}, roles: ${q(a.roles)} },`)
  const head = hubSource.split('\n')
  const iFn = head.findIndex((l) => l.startsWith('export default function AppsMenu'))
  const body = head.slice(iFn + 1).join('\n')
  return `'use client'\nimport { useEffect, useRef, useState } from 'react'\n\n${GROUPLESS_HEAD()}const APPS = [\n${lines.join('\n')}\n]\n\n/** Menu aplikácií v hlavičke: \`roles\` z app_users (ak nie sú známe, skryjú sa len časti pre vedenie). */\nexport default function AppsMenu({ current, roles }) {\n${body.replace("  if (!apps || !apps.length) return null\n", "  const apps = APPS.filter((a) => a.roles.includes('*') || (Array.isArray(roles) ? a.roles.some((r) => roles.includes(r)) : !(a.roles.length === 1 && a.roles[0] === 'admin')))\n  if (!apps.length) return null\n")}`
}

const read = (p) => readFileSync(p, 'utf8')
const TARGETS = [
  { name: 'cs', dir: resolve(ROOT, '../livein-cs'), files: [['lib/guru-widget-core.js', 'lib/guru-widget-core.js'], ['components/GuruWidget.js', 'components/GuruWidget.js'], ['app/guru/guru-widget.css', 'app/guru-widget.css']], menu: 'app/AppsMenu.js' },
  { name: 'ring', dir: resolve(ROOT, '../livein-ring'), files: [['lib/guru-widget-core.js', 'lib/guru-widget-core.js'], ['components/GuruWidget.js', 'components/GuruWidget.js'], ['app/guru/guru-widget.css', 'app/guru-widget.css']], menu: 'components/AppsMenu.js' },
]

/** @returns {Promise<Array<{target:string,file:string,status:'ok'|'drift'|'missing'}>>} */
export async function planSync({ write = false } = {}) {
  const { MODULES } = await import(pathToFileURL(resolve(ROOT, 'lib/modules.js')).href)
  const apps = appsList(MODULES)
  const hubMenu = read(resolve(ROOT, 'components/AppsMenu.js'))
  const out = []
  for (const t of TARGETS) {
    if (!existsSync(t.dir)) { out.push({ target: t.name, file: '(repozitár chýba)', status: 'missing' }); continue }
    const jobs = t.files.map(([src, dst]) => [dst, read(resolve(ROOT, src))])
    jobs.push([t.menu, appsMenuSource(hubMenu, apps)])
    for (const [dst, want] of jobs) {
      const p = resolve(t.dir, dst)
      const have = existsSync(p) ? read(p) : null
      const status = have === want ? 'ok' : 'drift'
      if (status === 'drift' && write) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, want) }
      out.push({ target: t.name, file: dst, status })
    }
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check')
  const res = await planSync({ write: !check })
  for (const r of res) console.log(`${r.status === 'ok' ? '  ok   ' : r.status === 'missing' ? ' chýba ' : check ? ' LÍŠI SA' : ' zapísané'}  ${r.target}/${r.file}`)
  if (check && res.some((r) => r.status === 'drift')) process.exit(1)
}
