// Ústredňa – agenti: z uloženého výpisu Slacku (#ai-tim) vytiahne len dôkazy: kto sa podpísal, cez čo bola správa poslaná a kedy.
// Text správ, mená ani e-maily odosielateľov sa neukladajú. Podpis roly na začiatku správy je tvrdenie odosielateľa, nie overená identita:
// roly píšu cez účty ľudí. Bez importov z Node, dá sa testovať samostatne.
import { roleOf, NAMED_ROLES } from './hq-agents.js'

const TZ = { CET: '+01:00', CEST: '+02:00', UTC: '+00:00', GMT: '+00:00' }
// výpis kanála: „=== Message from Meno <e-mail> (U…) at 2026-11-13 10:17:21 CET ===“
const HEAD = /^=== Message from .*\((U[A-Z0-9]+)\) at (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([A-Z]{3,4}) ===\s*$/
// výpis vlákna: „From: Meno <e-mail> (U…)“ a pod ním „Time: 2026-11-18 20:29:15 CET“
const FROM = /^From: .*\((?:ID: )?(U[A-Z0-9]+)\)\s*$/
const TIME = /^Time: (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([A-Z]{3,4})\s*$/
const TS = /^Message[ _]TS: (\d{9,11}\.\d{1,6})\s*$/i
const SENT = /^\*?Sent using\*?\s+(?:<@[^|>]+\|([^>]+)>|(\S.*?))\s*$/
const NOT_BODY = /^(=== THREAD|--- Reply \d+ of \d+ ---|Thread: \d+ repl|Channel: |Reactions: |Permalink: )/
const NAME = '[A-ZÁČĎÉÍĽŇÓŔŠŤÚÝŽ][a-záäčďéíľňóôŕšťúýž]{2,12}'

const when = (d, t, z) => (TZ[z] ? new Date(`${d}T${t}${TZ[z]}`).toISOString() : null)
const day = (iso) => { const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d}. ${m}.` }

/** Rozdelí uložený výpis na správy: { account, at, ts, via, first, mark }. `first` je prvý riadok tela (podpis), `mark` či správa obsahuje hľadané označenie. */
export function parseSlack(text, { marker = '' } = {}) {
  const out = []
  let cur = null
  const flush = () => { if (cur && (cur.ts || cur.at)) out.push(cur); cur = null }
  for (const line of String(text || '').split(/\r?\n/)) {
    let m
    if ((m = HEAD.exec(line))) { flush(); cur = { account: m[1], at: when(m[2], m[3], m[4]), ts: null, via: null, first: '', mark: false }; continue }
    if ((m = FROM.exec(line))) { flush(); cur = { account: m[1], at: null, ts: null, via: null, first: '', mark: false }; continue }
    if (!cur) continue
    if ((m = TIME.exec(line))) { if (!cur.at) cur.at = when(m[1], m[2], m[3]); continue }
    if ((m = TS.exec(line))) { cur.ts = m[1]; continue }
    if ((m = SENT.exec(line))) { cur.via = String(m[1] || m[2]).trim().slice(0, 24); continue }
    if (NOT_BODY.test(line)) continue
    if (!cur.first && line.trim()) cur.first = line.trim().slice(0, 160)
    if (marker && line.includes(marker)) cur.mark = true
  }
  flush()
  // čas zo značky správy je presný a nezávisí od časového pásma výpisu
  for (const x of out) if (x.ts) x.at = new Date(Number(x.ts) * 1000).toISOString()
  const seen = new Set()
  return out.filter((x) => x.at && !seen.has(x.ts || x.account + x.at) && seen.add(x.ts || x.account + x.at))
}

/** Podpis na začiatku správy: „[A23 Sage] …“ → { text: 'A23 Sage', role: 'A23' }; „[Grok Hub] …“ → rola GROK-HUB. */
export function signature(first) {
  const m = /^\*{0,2}\[([^\]]{1,40})\]/.exec(String(first || ''))
  return m ? { text: m[1].trim(), role: roleOf(m[1]) } : { text: '', role: null }
}

/**
 * Súhrn pre zberný skript: [{ role, runtime, last, count, name? }] + veta o pokrytí. S `marker` vráti aj `hits`: správy, ktoré označenie obsahujú.
 * Prostredie (runtime): pomenovaná rola má to, ktoré o sebe uvádza; inak podľa toho, cez čo bola správa poslaná (Claude, ChatGPT).
 */
export function summarizeSlack(text, { marker = '' } = {}) {
  const msgs = parseSlack(text, { marker })
  const by = new Map(), via = {}, hits = []
  let unsigned = 0, first = null, last = null
  for (const x of msgs) {
    if (!first || x.at < first) first = x.at
    if (!last || x.at > last) last = x.at
    via[x.via || 'bez označenia'] = (via[x.via || 'bez označenia'] || 0) + 1
    const sig = signature(x.first), named = sig.role && NAMED_ROLES[sig.role]
    const runtime = named ? named.runtime : x.via === 'Claude' ? 'Claude' : x.via === 'ChatGPT' ? 'GPT' : null
    if (x.mark) hits.push({ role: sig.role, signature: sig.text, via: x.via, account: x.account, at: x.at, ts: x.ts })
    if (!sig.role) { unsigned++; continue }
    const k = sig.role + '|' + (runtime || ''), e = by.get(k) || { role: sig.role, runtime, last: x.at, count: 0 }
    if (named) e.name = named.name
    else if (!e.name) { const nm = new RegExp('\\b' + sig.role + '\\]?\\s+(' + NAME + ')(?=\\s*[\\]|–—-])').exec(x.first.slice(0, 120)); if (nm) e.name = nm[1] }
    e.count++; if (x.at > e.last) e.last = x.at
    by.set(k, e)
  }
  const roles = [...by.values()].sort((a, b) => a.role.localeCompare(b.role, 'en', { numeric: true }))
  const sent = Object.entries(via).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k === 'bez označenia' ? k : 'cez ' + k}`).join(', ')
  const coverage = msgs.length ? `Slack #ai-tim: ${msgs.length} správ od ${day(first)} do ${day(last)} (${sent}). Podpis roly […] na začiatku správy je tvrdenie odosielateľa, nie overená identita.` : 'Slack #ai-tim: vo výpise nie je žiadna správa.'
  return { roles, coverage, stats: { messages: msgs.length, first, last, via, unsigned }, hits: hits.sort((a, b) => a.at.localeCompare(b.at)) }
}
