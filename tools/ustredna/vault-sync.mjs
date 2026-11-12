#!/usr/bin/env node
// Pošle do ústredne index Obsidian trezoru (názvy, cesty, štítky, prepojenia, čas zmeny; NIE text poznámok). Bez závislostí.
//
//   node tools/ustredna/vault-sync.mjs --vault "<cesta k trezoru>" [--name "Live-in International"] --env <súbor s HQ_URL a HQ_TOKEN>
//   node tools/ustredna/vault-sync.mjs --vault "<cesta>" --stats          len vypíše počty, nič neposiela
//   node tools/ustredna/vault-sync.mjs --vault "<cesta>" --out index.json uloží index do súboru
import fs from 'node:fs'
import path from 'node:path'
import { scanVault, gzIndex } from '../../lib/hq-vault-fs.js'
import { packIndex, vaultSummary } from '../../lib/hq-vault.js'

const args = process.argv.slice(2), opt = {}
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'
const die = (m) => { console.error(m); process.exit(1) }
if (opt.env) for (const line of fs.readFileSync(opt.env, 'utf8').split('\n')) { const m = /^\s*(HQ_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '') }
const root = opt.vault || process.env.HQ_VAULT_PATH || die('Chýba --vault <cesta k trezoru>.')
if (!fs.existsSync(root)) die('Trezor na tejto ceste neexistuje.')
const ix = scanVault(root, { name: opt.name || path.basename(root) })
const sum = vaultSummary(ix)
console.log(`Trezor „${ix.name}“: ${sum.notes} poznámok, ${sum.links} prepojení, ${sum.unresolved} odkazov na neexistujúce poznámky.`)
console.log('Priečinky: ' + sum.groups.map((g) => `${g.name} ${g.count}`).join(', '))
if (opt.stats) process.exit(0)
if (opt.out) { fs.writeFileSync(opt.out, JSON.stringify(packIndex(ix))); console.log('Index uložený do ' + opt.out); process.exit(0) }
if (opt.gz) { fs.writeFileSync(opt.gz, gzIndex(ix)); console.log('Zbalený index uložený do ' + opt.gz); process.exit(0) }
const url = (process.env.HQ_URL || '').replace(/\/+$/, ''), token = process.env.HQ_TOKEN || ''
if (!url || !token) die('Chýba HQ_URL alebo HQ_TOKEN. Index NEBOL odoslaný.')
let r
try { r = await fetch(url + '/api/hq/vault', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(packIndex(ix)), redirect: 'manual' }) }
catch (e) { die(`Ústredňa na ${url} neodpovedá (${e.cause && e.cause.code ? e.cause.code : e.message}). Index NEBOL odoslaný.`) }
const j = await r.json().catch(() => null)
if (!j || !j.ok) die(`Odmietnuté (${r.status}): ${(j && j.error) || 'neočakávaná odpoveď'}. Index NEBOL uložený.`)
console.log(`ULOŽENÉ: ${j.notes} poznámok, ${j.links} prepojení, ako ${j.actorId}.`)
