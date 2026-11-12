#!/usr/bin/env node
// Spoločný nástroj vykonávateľov (Codex, Claude Code) pre LIVE-IN ústredňu. Bez závislostí, bez modelových volaní.
// Identitu určuje server podľa tokenu; tento nástroj ju nevie zmeniť. Návod: docs/ustredna/README.md.
//
//   HQ_URL=http://localhost:3210 HQ_TOKEN=<token agenta> node tools/ustredna/hq.mjs <príkaz> [voľby]
//   alebo --env <súbor s riadkami HQ_URL=…, HQ_TOKEN=…>
//
//   queue                                   moje úlohy a cudzie výsledky na kontrolu
//   show <taskId>                           detail a história
//   assign  --to <actorId> --summary … --next … [--case …] [--task …] [--ref kind:id[=url]]
//   accept|step|block <taskId> --summary … --next …
//   result  <taskId> --summary … --next … --file <cesta>[=uri] [--file …] --version <v> | --evidence uri,version,digest
//   verify  <taskId> --summary … --next …   overí POSLEDNÚ verziu výsledku; odtlačky si najprv pozri cez `show`
//           --event <eventId> --digest <sha256> [--digest …]
//   digest  <cesta>                         sha256 súboru
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const cmd = argv.shift()
const pos = [], opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'; (opt[k] = opt[k] || []).push(v) } else pos.push(a)
}
const one = (k) => (opt[k] ? opt[k][opt[k].length - 1] : undefined)
if (one('env')) for (const line of fs.readFileSync(one('env'), 'utf8').split('\n')) { const m = /^\s*(HQ_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '') }
const URL_ = (process.env.HQ_URL || '').replace(/\/+$/, ''), TOKEN = process.env.HQ_TOKEN || ''
const die = (m) => { console.error(m); process.exit(1) }
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function call(method, p, body) {
  if (!URL_ || !TOKEN) die('Chýba HQ_URL alebo HQ_TOKEN (premenné prostredia alebo --env súbor).')
  let r
  try { r = await fetch(URL_ + p, { method, headers: { Authorization: 'Bearer ' + TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' }) }
  catch (e) { die(`Ústredňa na ${URL_} neodpovedá (${e.cause && e.cause.code ? e.cause.code : e.message}). Udalosť NEBOLA zapísaná.`) }
  const j = await r.json().catch(() => null)
  if (!j) die(`Neočakávaná odpoveď (${r.status}). Udalosť NEBOLA zapísaná.`)
  if (!j.ok) die(`Odmietnuté (${r.status}${j.code ? ' ' + j.code : ''}): ${j.error}`)
  return j
}
const line = (t) => `${t.taskId}  [${t.status} #${t.sequence}]  ${t.title}\n    komu: ${t.assigneeId} · ďalší krok: ${t.nextAction}`
function common() {
  const summary = one('summary'), nextAction = one('next')
  if (!summary || !nextAction) die('Treba --summary a --next (kto a čo má urobiť ďalej).')
  const refs = (opt.ref || []).map((x) => { const [head, url] = x.split('='); const i = head.indexOf(':'); return { kind: head.slice(0, i), id: head.slice(i + 1), ...(url ? { url } : {}) } })
  return { summary, nextAction, ...(refs.length ? { refs } : {}), idempotencyKey: one('key') || randomUUID(), ...(one('seq') ? { sequence: Number(one('seq')) } : {}) }
}
async function send(body) {
  const j = await call('POST', '/api/hq/events', body)
  console.log(`${j.duplicate ? 'UŽ ZAPÍSANÉ (duplicita)' : 'ZAPÍSANÉ'}: ${j.taskId} · ${j.status || ''} #${j.sequence || ''} · udalosť ${j.eventId} · ako ${j.actorId}`)
}

if (cmd === 'digest') { console.log(sha(pos[0] || die('Chýba cesta.'))) }
else if (cmd === 'queue') {
  const j = await call('GET', '/api/hq/tasks' + (one('all') ? '?all=1' : ''))
  console.log(`Vykonávateľ: ${j.actorId}\n\nMoje úlohy (${j.mine.length}):`); j.mine.forEach((t) => console.log(line(t)))
  console.log(`\nVýsledky na nezávislú kontrolu (${j.toVerify.length}):`); j.toVerify.forEach((t) => console.log(line(t)))
  if (j.all) { console.log(`\nVšetky (${j.all.length}):`); j.all.forEach((t) => console.log(line(t))) }
} else if (cmd === 'show') {
  const j = await call('GET', '/api/hq/tasks/' + encodeURIComponent(pos[0] || die('Chýba taskId.')))
  if (one('json')) console.log(JSON.stringify(j.task, null, 2))
  else {
    const t = j.task
    console.log(line(t) + `\n    prípad: ${t.caseId} · zadal: ${t.assignedBy}`)
    for (const r of t.refs) console.log(`    odkaz ${r.kind}: ${r.url || r.id}`)
    for (const e of t.history) { console.log(`\n  #${e.sequence} ${e.status} · ${e.actorId} · ${e.receivedAt} · ${e.eventId}\n     ${e.summary}\n     ďalší krok: ${e.nextAction}`); for (const x of e.evidence) console.log(`     dôkaz v${x.version}: ${x.uri}\n       sha256 ${x.digest}`) }
  }
} else if (cmd === 'assign') {
  await send({ op: 'assign', ...common(), assigneeId: one('to') || die('Chýba --to <actorId>.'), ...(one('case') ? { caseId: one('case') } : {}), ...(one('task') ? { taskId: one('task') } : {}) })
} else if (['accept', 'step', 'block'].includes(cmd)) {
  await send({ op: cmd, taskId: pos[0] || die('Chýba taskId.'), ...common() })
} else if (cmd === 'result') {
  const evidence = []
  for (const f of opt.file || []) { const [file, uri] = f.split('='); evidence.push({ uri: uri || 'artifact:' + encodeURIComponent(path.basename(file)), version: one('version') || die('Pri --file treba --version.'), digest: sha(file) }) }
  for (const e of opt.evidence || []) { const [uri, version, digest] = e.split(','); evidence.push({ uri, version, digest }) }
  if (!evidence.length) die('Výsledok potrebuje dôkaz: --file <cesta> --version <v> alebo --evidence uri,version,digest.')
  await send({ op: 'result', taskId: pos[0] || die('Chýba taskId.'), ...common(), evidence })
} else if (cmd === 'verify') {
  if (!one('event') || !opt.digest) die('Overenie musí uviesť, čo si skontroloval: --event <eventId výsledku> --digest <sha256> (z `show`).')
  await send({ op: 'verify', taskId: pos[0] || die('Chýba taskId.'), ...common(), checkedEventId: one('event'), checkedDigests: opt.digest })
} else die('Príkazy: queue | show | assign | accept | step | block | result | verify | digest. Návod: docs/ustredna/README.md')
