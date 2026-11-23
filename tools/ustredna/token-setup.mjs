#!/usr/bin/env node
// Pripraví tokeny agentov pre ústredňu. Spúšťa sa raz na počítači, kde agenti bežia.
// Tokeny vzniknú tu a uložia sa do súborov len pre tohto používateľa. Na server ide len ich odtlačok (sha256), nie token:
// kto pozná hodnotu na serveri, token z nej nezíska a odtlačok sám ako token neplatí (lib/hq-core.js, actorFromToken).
// Skript tokeny NEVYPISUJE a nikam ich neposiela. Hodnotu pre server (HQ_AGENT_TOKENS) uloží do súboru server-hodnota.json.
//
//   node tools/ustredna/token-setup.mjs                 vytvorí tokeny pre Codex a Claude Code
//   node tools/ustredna/token-setup.mjs --rotate        nahradí existujúce (staré prestanú platiť po nasadení novej hodnoty na serveri)
//   --dir <priečinok>   kam uložiť súbory (predvolene ~/.config/livein-ustredna)
//   --url <adresa>      adresa ústredne (predvolene https://app.live-in.international)
//   --clipboard         hodnotu pre server skopíruje aj do schránky
//   --open <adresa>     po skončení otvorí túto stránku v prehliadači (nastavenia premenných vo Verceli)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2), opt = {}
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2), v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'; opt[k] = v }
const die = (m) => { console.error(m); process.exit(1) }
const dir = path.resolve(String(opt.dir || path.join(os.homedir(), '.config', 'livein-ustredna')).replace(/^~(?=\/|$)/, os.homedir()))
const url = String(opt.url || 'https://app.live-in.international').replace(/\/+$/, '')
if (!/^https:\/\/[a-z0-9.-]+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) die('Adresa ústredne musí byť https://… (alebo http://localhost pri skúške).')

// aktér na serveri → súbor s jeho tokenom
const ACTORS = { 'agent:codex': 'codex.env', 'agent:claude-code': 'claude-code.env' }
const existing = Object.values(ACTORS).filter((f) => fs.existsSync(path.join(dir, f)))
if (existing.length && opt.rotate !== 'true') die(`V priečinku ${dir} už tokeny sú (${existing.join(', ')}). Nič som nezmenil. Ak ich chceš nahradiť, spusti znova s --rotate.`)

fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
try { fs.chmodSync(dir, 0o700) } catch { /* cudzí priečinok: práva súborov nižšie stačia */ }
const map = {}
for (const [actor, file] of Object.entries(ACTORS)) {
  const token = randomBytes(32).toString('base64url')
  map[actor] = 'sha256:' + createHash('sha256').update(token).digest('hex')   // na server ide len odtlačok
  const f = path.join(dir, file)
  fs.writeFileSync(f, `HQ_URL=${url}\nHQ_TOKEN=${token}\n`, { mode: 0o600 })
  fs.chmodSync(f, 0o600)
}
const value = JSON.stringify(map)
const out = path.join(dir, 'server-hodnota.json')
fs.writeFileSync(out, value + '\n', { mode: 0o600 }); fs.chmodSync(out, 0o600)
const clip = opt.clipboard === 'true' ? spawnSync('pbcopy', { input: value }) : null

console.log(`Tokeny sú pripravené v ${dir} (${Object.values(ACTORS).join(', ')}). Čítať ich vie len tvoj účet na tomto počítači.`)
console.log(`Hodnota pre server je v súbore ${out}${clip && clip.status === 0 ? ' a v schránke' : ''}. Obsahuje len odtlačky tokenov, nie tokeny.`)
console.log('')
console.log('Na serveri: Vercel → projekt appky → Settings → Environment Variables')
console.log('  Key: HQ_AGENT_TOKENS · Environment: Production · Value: obsah súboru server-hodnota.json')
console.log('  Hodnota začne platiť od najbližšieho nasadenia.')
console.log('')
console.log('Samotný token nikam nepíš: ani do Slacku, ani do chatu, ani do repozitára.')
if (opt.open && /^https:\/\/vercel\.com\//.test(opt.open)) spawnSync('open', [opt.open])
