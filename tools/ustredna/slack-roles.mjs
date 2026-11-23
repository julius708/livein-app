#!/usr/bin/env node
// Z uložených výpisov Slacku (#ai-tim) pripraví slack.json pre agents-sync.mjs: kto sa podpísal, cez čo bola správa poslaná a kedy.
// Výpisy ukladá relácia Claude cez svoj konektor (čítanie kanála alebo vlákna); skript sám do Slacku nevidí. Text správ sa neukladá.
//
//   node tools/ustredna/slack-roles.mjs --out slack.json <výpis> [<výpis> …]
//   node tools/ustredna/slack-roles.mjs --marker GH-PILOT-20261120-01 <výpis> …      vypíše aj správy s týmto označením
import fs from 'node:fs'
import { summarizeSlack } from '../../lib/hq-agents-slack.js'

const args = process.argv.slice(2), opt = {}, files = []
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true' } else files.push(args[i]) }
if (!files.length) { console.error('Chýba aspoň jeden uložený výpis Slacku.'); process.exit(1) }
/** Výpis z konektora je JSON s textom v poli „messages“; čistý text sa berie tak, ako je. */
const readDump = (file) => { const s = fs.readFileSync(file, 'utf8'); try { const j = JSON.parse(s); return typeof j.messages === 'string' ? j.messages : typeof j.results === 'string' ? j.results : s } catch { return s } }
const sum = summarizeSlack(files.map(readDump).join('\n\n'), { marker: opt.marker && opt.marker !== 'true' ? opt.marker : '' })
console.log(sum.coverage)
console.log(`bez podpisu roly: ${sum.stats.unsigned}`)
for (const r of sum.roles) console.log(r.role.padEnd(9), (r.runtime || '?').padEnd(7), r.last.slice(0, 16), String(r.count).padStart(3), r.name || '')
if (opt.marker) { console.log(`--- správy s označením ${opt.marker}: ${sum.hits.length}`); for (const h of sum.hits) console.log(h.at.slice(0, 16), (h.role || 'bez roly').padEnd(9), `podpis „${h.signature}“`, `cez ${h.via || '?'}`, `účet ${h.account}`, `ts ${h.ts || '–'}`) }
if (opt.out) { fs.writeFileSync(opt.out, JSON.stringify({ roles: sum.roles, coverage: sum.coverage })); console.log('Uložené do ' + opt.out) }
