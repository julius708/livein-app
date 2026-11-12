// Ústredňa – agenti na serveri: kde je uložený prehľad dôkazov. Riadok `agents` v tabuľke hq_vault (rovnaké práva ako index trezoru); nová tabuľka netreba.
// Lokálne (mimo produkcie) sa dá čítať aj zo súboru HQ_AGENTS_FILE, aby náhľad nepotreboval databázu.
import 'server-only'
import fs from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { sanitizeAgents } from './hq-agents.js'

const MISSING = /relation .* does not exist|schema cache|could not find the table/i
const KEY = 'agents'

/** Vráti { snapshot, syncedBy?, error? }. Chýbajúca tabuľka alebo prázdny stav nie je chyba: snapshot je null. */
export async function loadAgents(s) {
  if (process.env.NODE_ENV !== 'production' && process.env.HQ_AGENTS_FILE) {
    try { return { snapshot: sanitizeAgents(JSON.parse(fs.readFileSync(process.env.HQ_AGENTS_FILE, 'utf8'))), syncedBy: 'súbor na tomto počítači' } } catch (e) { return { snapshot: null, error: String(e && e.message).slice(0, 160) } }
  }
  if (!s) return { snapshot: null }
  const r = await s.from('hq_vault').select('synced_by,index_gz').eq('key', KEY).maybeSingle()
  if (r.error) return MISSING.test(r.error.message || '') ? { snapshot: null } : { snapshot: null, error: r.error.message }
  if (!r.data || !r.data.index_gz) return { snapshot: null }
  try { return { snapshot: sanitizeAgents(JSON.parse(gunzipSync(Buffer.from(String(r.data.index_gz), 'base64')).toString('utf8'))), syncedBy: r.data.synced_by } } catch { return { snapshot: null, error: 'Uložený prehľad agentov sa nedá prečítať.' } }
}

/** Uloží prehľad prijatý od zberného skriptu (po očistení). Predošlý sa nahradí. */
export async function saveAgents(s, raw, { actorId, now = new Date().toISOString() } = {}) {
  const snap = sanitizeAgents(raw)
  const row = { key: KEY, name: 'Prehľad agentov', note_count: snap.roles.length, link_count: snap.schedules.length, synced_at: snap.asOf, synced_by: actorId || null, index_gz: gzipSync(Buffer.from(JSON.stringify(snap))).toString('base64'), updated_at: now }
  const ex = await s.from('hq_vault').select('key').eq('key', KEY).maybeSingle()
  if (ex.error) throw new Error('agenti: ' + ex.error.message)
  const w = ex.data ? await s.from('hq_vault').update(row).eq('key', KEY) : await s.from('hq_vault').insert(row)
  if (w.error) throw new Error('agenti: ' + w.error.message)
  return { roles: snap.roles.length, schedules: snap.schedules.length }
}
