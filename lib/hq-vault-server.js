// Ústredňa – Obsidian na serveri: odkiaľ sa index trezoru berie a kam sa ukladá.
// Lokálne (mimo produkcie, s HQ_VAULT_PATH) sa trezor číta priamo z disku, takže mapa je vždy aktuálna.
// V produkcii sa číta posledný index, ktorý poslal synchronizačný skript (tabuľka hq_vault); server k súborom na počítači prístup nemá.
import 'server-only'
import { scanVault, gzIndex, ungzIndex } from './hq-vault-fs.js'
import { sanitizeIndex, packIndex } from './hq-vault.js'

const MISSING = /relation .* does not exist|schema cache|could not find the table/i
const VAULT_NAME = process.env.HQ_VAULT_NAME || 'Live-in International'
let cache = { at: 0, ix: null }

export const vaultLocal = () => process.env.NODE_ENV !== 'production' && !!process.env.HQ_VAULT_PATH

/** Vráti { index, source: 'disk'|'sync', error? }. Chýbajúca tabuľka alebo prázdny stav nie je chyba: index je null. */
export async function loadVault(s) {
  if (vaultLocal()) {
    if (!cache.ix || Date.now() - cache.at > 30e3) cache = { at: Date.now(), ix: scanVault(process.env.HQ_VAULT_PATH, { name: VAULT_NAME }) }
    return { index: cache.ix, source: 'disk' }
  }
  const r = await s.from('hq_vault').select('name,synced_at,synced_by,index_gz').eq('key', 'team').maybeSingle()
  if (r.error) return MISSING.test(r.error.message || '') ? { index: null, source: 'sync' } : { index: null, source: 'sync', error: r.error.message }
  if (!r.data || !r.data.index_gz) return { index: null, source: 'sync' }
  try { return { index: ungzIndex(r.data.index_gz), source: 'sync', syncedBy: r.data.synced_by } } catch { return { index: null, source: 'sync', error: 'Uložený index sa nedá prečítať.' } }
}

/** Uloží index prijatý od synchronizačného skriptu (po očistení). Predošlý index sa nahradí. */
export async function saveVault(s, raw, { actorId, now = new Date().toISOString() } = {}) {
  const ix = sanitizeIndex(raw)
  const row = { key: 'team', name: ix.name, note_count: ix.stats.notes, link_count: ix.stats.links, synced_at: ix.syncedAt, synced_by: actorId || null, index_gz: gzIndex(ix), updated_at: now }
  const ex = await s.from('hq_vault').select('key').eq('key', 'team').maybeSingle()
  if (ex.error) throw new Error('trezor: ' + ex.error.message)
  const w = ex.data ? await s.from('hq_vault').update(row).eq('key', 'team') : await s.from('hq_vault').insert(row)
  if (w.error) throw new Error('trezor: ' + w.error.message)
  return { notes: ix.stats.notes, links: ix.stats.links }
}
export { packIndex }
