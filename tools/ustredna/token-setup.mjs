#!/usr/bin/env node
// Pripraví tokeny agentov pre ústredňu. Spúšťa ho človek na svojom počítači, raz.
// Tokeny vzniknú tu, uložia sa do súborov len pre tohto používateľa a hodnota pre server sa skopíruje do schránky.
// Skript tokeny NEVYPISUJE a nikam ich neposiela. Na server (Vercel → Environment Variables → HQ_AGENT_TOKENS) ich vloží človek.
//
//   node tools/ustredna/token-setup.mjs                 vytvorí tokeny pre Codex a Claude Code
//   node tools/ustredna/token-setup.mjs --rotate        nahradí existujúce (staré prestanú platiť po uložení novej hodnoty na serveri)
//   --dir <priečinok>   kam uložiť súbory (predvolene ~/.config/livein-ustredna)
//   --url <adresa>      adresa ústredne (predvolene https://app.live-in.international)
//   --no-clipboard      hodnotu pre server neskopíruje, uloží ju do súboru vercel-hodnota.txt v tom istom priečinku
//   --open <adresa>     po skončení otvorí túto stránku v prehliadači (nastavenia premenných vo Verceli)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
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
  map[actor] = token
  const f = path.join(dir, file)
  fs.writeFileSync(f, `HQ_URL=${url}\nHQ_TOKEN=${token}\n`, { mode: 0o600 })
  fs.chmodSync(f, 0o600)
}
const value = JSON.stringify(map)
let where
const clip = opt['no-clipboard'] === 'true' ? null : spawnSync('pbcopy', { input: value })
if (clip && clip.status === 0) where = 'je v schránke (Cmd+V)'
else { const f = path.join(dir, 'vercel-hodnota.txt'); fs.writeFileSync(f, value + '\n', { mode: 0o600 }); fs.chmodSync(f, 0o600); where = `je v súbore ${f} (po vložení na server ho zmaž)` }

console.log(`Tokeny sú pripravené v ${dir} (${Object.values(ACTORS).join(', ')}). Čítať ich vie len tvoj účet na tomto počítači.`)
console.log('')
console.log('Ostáva jeden krok, ktorý vieš urobiť len ty:')
console.log('  1. Vercel → projekt appky → Settings → Environment Variables → Add')
console.log('  2. Key: HQ_AGENT_TOKENS · Environment: Production')
console.log(`  3. Value: ${where}`)
console.log('  4. Save. Hodnota začne platiť od najbližšieho nasadenia.')
console.log('')
console.log('Token nikam nepíš: ani do Slacku, ani do chatu, ani do repozitára.')
if (opt.open && /^https:\/\/vercel\.com\//.test(opt.open)) spawnSync('open', [opt.open])
