// Ústredňa – Obsidian: čítanie trezoru z disku (lokálny server a synchronizačný skript) a balenie indexu. Len Node; v prehliadači sa nepoužíva.
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { parseNote, buildIndex, packIndex, unpackIndex, VAULT_SKIP, VAULT_LIMITS } from './hq-vault.js'

const MAX_FILE = 1024 * 1024

/** Prejde trezor (bez symbolických odkazov, skrytých a súkromných priečinkov) a vráti index. Text poznámok sa číta len na extrakciu odkazov a hneď sa zahodí. */
export function scanVault(root, { name = path.basename(root), now = new Date() } = {}) {
  const parsed = []
  const walk = (dir, rel) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (parsed.length >= VAULT_LIMITS.notes) return
      const r = rel ? rel + '/' + e.name : e.name
      if (e.isSymbolicLink() || VAULT_SKIP.test(r)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full, r); continue }
      if (!e.isFile() || !/\.md$/i.test(e.name)) continue
      let st, text = ''
      try { st = fs.statSync(full); if (st.size <= MAX_FILE) text = fs.readFileSync(full, 'utf8') } catch { continue }
      parsed.push({ ...parseNote(r.normalize('NFC'), text), mtime: st.mtime.toISOString() })
    }
  }
  walk(root, '')
  return buildIndex(parsed, { name, syncedAt: now.toISOString() })
}

export const gzIndex = (ix) => gzipSync(Buffer.from(JSON.stringify(packIndex(ix)))).toString('base64')
export const ungzIndex = (b64) => unpackIndex(JSON.parse(gunzipSync(Buffer.from(String(b64), 'base64')).toString('utf8')))
