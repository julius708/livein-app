#!/usr/bin/env node
// Skúška toku roly do ústredne: hľadá označenie pilotu na každom kroku (Slack, výstup na disku, trezor, prehľad v produkčnej ústredni).
// Nič nezapisuje a nič neposiela. Zmienka o pilote nie je dôkaz behu; počíta sa len správa podpísaná rolou a súbor v priečinku roly.
// ✔ je dôkaz, ✘ dôkaz chýba, ? neoverené. Lokálny model (čo by ústredňa ukázala po zbere) je len výpočet a do výsledku nevstupuje.
// Vstup do roly sa z ústredne overiť nedá, preto skript sám výsledok DOLOŽENÉ nevydá: ten krok musí doložiť prostredie roly.
//
//   node tools/ustredna/pilot-check.mjs --id GH-PILOT-20261120-01 --role GROK-HUB \
//     --outputs "<Disk>/Live-in/Vystupy_agentov" [--outputs …]      priečinky výstupov rolí
//     --vault "<Disk>/Live-in/Live-in International"                 tímový trezor (Agenti/<ID>/)
//     --slack <uložený výpis kanála alebo vlákna> [--slack …]        pripraví relácia Claude cez konektor
//     [--snapshot prehlad.json]                                      prehľad, ktorý má PRODUKČNÁ ústredňa; bez neho je produkčná viditeľnosť neoverená
//     [--json]
// Návratový kód: 0 = všetky povinné kroky sú doložené, 2 = nič nechýba, ale niečo je neoverené, 1 = pri niektorom kroku dôkaz chýba.
import fs from 'node:fs'
import os from 'node:os'
import { pilotCheck } from '../../lib/hq-pilot-fs.js'

const args = process.argv.slice(2), opt = {}, many = { outputs: [], slack: [] }
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2), v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; if (many[k]) many[k].push(v); else opt[k] = v }
const home = (p) => String(p).replace(/^~(?=\/|$)/, os.homedir())
if (!opt.id || !opt.role) { console.error('Použitie: --id <označenie pilotu> --role <ID roly> [--outputs …] [--vault …] [--slack …] [--snapshot …]'); process.exit(1) }
const dump = (file) => { const s = fs.readFileSync(home(file), 'utf8'); try { const j = JSON.parse(s); return typeof j.messages === 'string' ? j.messages : s } catch { return s } }
const rep = pilotCheck({ id: opt.id, role: opt.role, outputs: many.outputs.map(home), vault: opt.vault ? home(opt.vault) : '', slackTexts: many.slack.map(dump), snapshot: opt.snapshot ? JSON.parse(fs.readFileSync(home(opt.snapshot), 'utf8')) : null })
const code = rep.verdict === 'proven' ? 0 : rep.verdict === 'unverified' ? 2 : 1
if (opt.json) { console.log(JSON.stringify(rep, null, 1)); process.exit(code) }
const t = (iso) => (iso ? new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '–')
console.log(`Pilot ${rep.id} · rola ${rep.role} · kontrola ${t(rep.at)}`)
for (const s of rep.steps) {
  console.log(`${s.model ? '~' : s.ok === null ? '?' : s.ok ? '✔' : s.optional ? '○' : '✘'} ${s.label}${s.optional ? ' (nepovinné)' : ''}${s.note ? ' — ' + s.note : ''}`)
  for (const h of s.items || []) console.log('    ' + (h.file ? `${h.file} · zmenený ${t(h.at)} · označenie v: ${h.by}` : `${t(h.at)} · podpis „${h.signature}“ · poslané cez ${h.via || '?'} · účet ${h.account} · ts ${h.ts || '–'}`))
  for (const h of s.mentions || []) console.log(`    zmienka, nie výstup roly: ${t(h.at)} · podpis „${h.signature || 'bez podpisu'}“ · cez ${h.via || '?'} · ts ${h.ts || '–'}`)
  if (s.dirs && s.dirs.length) console.log('    priečinky roly: ' + s.dirs.join(', '))
  if (s.asOf) console.log('    dodaný prehľad je z ' + t(s.asOf))
  if (s.shown) console.log(`    ${s.shown.label} · posledný výstup ${t(s.shown.last)} · prostredie: ${s.shown.runtimes.join(', ') || 'neznáme'} · poznámok v trezore: ${s.shown.brainNotes}${s.shown.name ? ' · meno: ' + s.shown.name : ''}`)
}
console.log(`VÝSLEDOK: ${rep.verdictLabel}` + (rep.failed.length ? ` · dôkaz chýba: ${rep.failed.join(', ')}` : '') + (rep.unverified.length ? ` · neoverené: ${rep.unverified.join(', ')}` : ''))
console.log('Legenda: ✔ dôkaz · ✘ dôkaz chýba · ? neoverené · ○ nepovinné bez dôkazu · ~ lokálny model, nie dôkaz.')
process.exit(code)
