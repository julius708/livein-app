#!/usr/bin/env node
// Pošle do ústredne prehľad dôkazov o agentoch: ktoré rozvrhy sú zapnuté a kde je posledný výstup každej roly.
// Číta len metadáta (názvy, stav, časy, počty súborov). Zadania agentov ani obsah súborov nečíta a neposiela. Bez závislostí.
//
//   node tools/ustredna/agents-sync.mjs \
//     --outputs "<Disk>/Live-in/Vystupy_agentov"      výstupy rolí na zdieľanom disku (Claude)
//     --codex ~/.codex                                automatizácie Codexu (GPT): názov, stav, rozvrh, posledný beh
//     --codex-out "<priečinok výstupov Codexu>"       pracovné priečinky rolí Codexu (GPT); dá sa opakovať
//     --codex-register "<REGISTER.json>"              náplň rolí
//     --claude "<súbor so zoznamom rutín Claude>"     uložená odpoveď zoznamu rutín (pripraví relácia Claude)
//     --slack "<slack.json>"                          [{ role, runtime: 'Claude'|'GPT'|null, last, count, name? }] z #ai-tim (pripraví relácia Claude)
//     --asks "<asks.json>"                            [{ role, at, text, context }] otázky rolí na vedenie (pripraví relácia Claude z hlásení)
//     --note "veta o pokrytí" (dá sa opakovať)
//     --stats | --out prehlad.json | --env <súbor s HQ_URL a HQ_TOKEN>
import fs from 'node:fs'
import os from 'node:os'
import { scanOutputs, scanCodex, readClaudeRoutines, readCodexRegister } from '../../lib/hq-agents-fs.js'
import { sanitizeAgents, buildAgents, AGENTS_VERSION } from '../../lib/hq-agents.js'

const args = process.argv.slice(2), opt = {}, notes = [], codexOut = []
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2), v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; if (k === 'note') notes.push(v); else if (k === 'codex-out') codexOut.push(v); else opt[k] = v }
const die = (m) => { console.error(m); process.exit(1) }
const home = (p) => String(p).replace(/^~(?=\/|$)/, os.homedir())
if (opt.env) for (const line of fs.readFileSync(opt.env, 'utf8').split('\n')) { const m = /^\s*(HQ_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '') }

const schedules = [], outputs = [], coverage = []
let roles = [], slack = [], asks = []
if (opt.codex) { const s = scanCodex(home(opt.codex)); schedules.push(...s); coverage.push(`GPT: ${s.length} automatizácií Codexu na tomto počítači (${s.filter((x) => x.active).length} zapnutých). Naplánované úlohy v cloude ChatGPT odtiaľto nevidno.`) }
if (opt.claude) { const c = readClaudeRoutines(home(opt.claude)); schedules.push(...c.schedules); coverage.push(`Claude: ${c.schedules.length} cloudových rutín (${c.schedules.filter((x) => x.active).length} zapnutých)${c.more ? '. Zoznam je orezaný na najnovšie; staršie rutiny existujú, ale v prehľade chýbajú' : ''}.`) }
if (opt.outputs) { const o = scanOutputs(home(opt.outputs), { runtime: 'Claude', where: 'Disk · Vystupy_agentov' }); outputs.push(...o); coverage.push(`Výstupy na zdieľanom disku (Vystupy_agentov): ${o.length} rolí.`) }
if (codexOut.length) { const o = codexOut.flatMap((d) => scanOutputs(home(d), { runtime: 'GPT', where: 'Codex · pracovný priečinok' })); outputs.push(...o); coverage.push(`Pracovné priečinky Codexu podľa roly: ${new Set(o.map((x) => x.role)).size}. Výstupy Codexu mimo priečinkov rolí sa nepočítajú.`) }
if (opt['codex-register']) roles = readCodexRegister(home(opt['codex-register']))
if (opt.slack) { const j = JSON.parse(fs.readFileSync(home(opt.slack), 'utf8')); slack = Array.isArray(j) ? j : j.roles || []; if (j.coverage) coverage.push(String(j.coverage)) }
// mená rolí: z podpisov v Slacku („[A21 Rio]“) a z názvov rozvrhov („A27 Mira – e-mailová agentúra“), ak ich register nemá
const named = (id, name) => { if (!id || !name) return; const r = roles.find((x) => x.id === id); if (!r) roles.push({ id, name }); else if (!r.name) r.name = name }
for (const m of slack) named(m.role, m.name)
for (const x of schedules) { const m = x.role && new RegExp('\\b' + x.role + '\\s+(\\p{Lu}\\p{Ll}{2,12})\\s+[–—-]\\s', 'u').exec(x.name); if (m && x.runtime === 'Claude') named(x.role, m[1]) }
if (opt.asks) asks = JSON.parse(fs.readFileSync(home(opt.asks), 'utf8'))
coverage.push(...notes)

const snap = sanitizeAgents({ v: AGENTS_VERSION, asOf: new Date().toISOString(), roles, schedules, outputs, slack, coverage, asks })
const view = buildAgents(snap, null)
const t = view.totals
console.log(`Roly: ${t.roles} · dodáva ${t.delivering} · podľa rozvrhu ${t.scheduled} · rozvrh bez výstupu ${t.idle} · ticho ${t.quiet} · len v registri ${t.registered}`)
console.log(`GPT: ${t.gpt.active}/${t.gpt.schedules} zapnutých automatizácií, ${t.gpt.roleSchedules} rolí s rozvrhom, ${t.gpt.delivering} dodáva · Claude: ${t.claude.active}/${t.claude.schedules} zapnutých rutín, ${t.claude.delivering} rolí dodáva`)
if (opt.stats) { for (const r of view.roles) console.log([r.id.padEnd(8), (r.state).padEnd(11), (r.last || '–').slice(0, 16), r.gpt ? 'GPT' + (r.gpt.active ? '*' : '') : '   ', r.claude ? 'Claude' + (r.claude.active ? '*' : '') : ''].join(' ')); process.exit(0) }
if (opt.out) { fs.writeFileSync(home(opt.out), JSON.stringify(snap)); console.log('Prehľad uložený do ' + opt.out); process.exit(0) }
const url = (process.env.HQ_URL || '').replace(/\/+$/, ''), token = process.env.HQ_TOKEN || ''
if (!url || !token) die('Chýba HQ_URL alebo HQ_TOKEN. Prehľad NEBOL odoslaný.')
let r
try { r = await fetch(url + '/api/hq/agents', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(snap), redirect: 'manual' }) }
catch (e) { die(`Ústredňa na ${url} neodpovedá (${e.cause && e.cause.code ? e.cause.code : e.message}). Prehľad NEBOL odoslaný.`) }
const j = await r.json().catch(() => null)
if (!j || !j.ok) die(`Odmietnuté (${r.status}): ${(j && j.error) || 'neočakávaná odpoveď'}. Prehľad NEBOL uložený.`)
console.log(`ULOŽENÉ: ${j.roles} rolí, ${j.schedules} rozvrhov, ako ${j.actorId}.`)
