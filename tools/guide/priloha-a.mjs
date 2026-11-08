#!/usr/bin/env node
// Príloha A (docx) → JSON kariet pre import do Sprievodcu. Spustiť lokálne: node tools/guide/priloha-a.mjs priloha.docx > karty.json
// Výstup obsahuje Wi-Fi heslá a vstupné pokyny: nikdy ho necommitovať, po importe zmazať.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const file = process.argv[2]
if (!file) { console.error('Použitie: node tools/guide/priloha-a.mjs <priloha.docx>'); process.exit(1) }
let xml
try { xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8') } catch (e) { console.error('Nepodarilo sa prečítať docx (treba unzip):', e.message); process.exit(1) }
const paras = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
const head = /^(.{3,60}) \((Bratislava|Košice|Trnava|Nitra|Žilina|Prešov|Banská Bystrica|Trenčín|Piešťany)\)$/
const cardRe = /^(.*?)(?:Naposledy použité: (\S+))?(?: · správ: (\d+))?(?: · check-out: ([0-9:]+ ?[ap]m))?WiFi: (.*?) \/ (.*)$/
const cards = []; let cur = null, card = null
for (const l of paras) {
  const m = head.exec(l)
  if (m) { cur = { address_key: m[1], city: m[2] }; card = null; continue }
  if (!cur) continue
  if (l.includes('WiFi:')) { const c = cardRe.exec(l); if (c) { card = { address_key: cur.address_key, city: cur.city, address_full: c[1].trim(), last_used: c[2] || null, messages: Number(c[3] || 0), checkout: c[4] || null, wifi_ssid: c[5].trim(), wifi_pass: c[6].trim(), instructions: [] }; cards.push(card); continue } }
  if (card && l.trim()) card.instructions.push(l.trim())
}
for (const c of cards) c.instructions = c.instructions.join('\n')
process.stdout.write(JSON.stringify({ source: 'Príloha A', exported_at: new Date().toISOString(), cards }, null, 1))
console.error(`${cards.length} kariet z ${new Set(cards.map((c) => c.address_key)).size} adries`)
