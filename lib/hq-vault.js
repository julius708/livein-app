// Ústredňa – Obsidian: z Markdown poznámok poskladá index (názvy, štítky, prepojenia) pre mapu a vyhľadávanie. Čistý modul bez importov,
// použiteľný na serveri, v prehliadači aj v synchronizačnom skripte. Do indexu NEJDE text poznámok: len názov, cesta, štítky, odkazy, čas zmeny a počet slov.
// Obsah ostáva v Obsidiane; z ústredne sa poznámka otvára odkazom obsidian://.

export const VAULT_VERSION = 1
export const VAULT_LIMITS = { notes: 5000, path: 400, title: 200, tags: 20, tag: 60, links: 400 }

const stripMd = (p) => String(p).replace(/\.md$/i, '')
const base = (p) => stripMd(p).split('/').pop()
const norm = (s) => String(s).normalize('NFC').toLowerCase().trim()

/** Jedna poznámka → názov, štítky a odkazy (wikilinky aj relatívne .md odkazy). Kód a frontmatter sa pri hľadaní odkazov vynechajú. */
export function parseNote(relPath, text = '') {
  let body = String(text), fmTags = []
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body)
  if (fm) {
    body = body.slice(fm[0].length)
    const inline = /^tags:\s*\[(.*?)\]\s*$/m.exec(fm[1]), single = /^tags:\s*([^\[\n][^\n]*)$/m.exec(fm[1]), list = /^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m.exec(fm[1])
    if (inline) fmTags = inline[1].split(',')
    else if (list) fmTags = list[1].split('\n').map((l) => l.replace(/^\s*-\s*/, ''))
    else if (single) fmTags = single[1].split(/[,\s]+/)
  }
  const noFence = body.replace(/```[\s\S]*?```/g, ' '), prose = noFence.replace(/`[^`\n]*`/g, ' ')
  const h1 = /^#\s+(.+?)\s*#*\s*$/m.exec(noFence)
  // nadpis: bez značiek zvýraznenia; názov súboru: podčiarkovníky ako medzery (2026-10-19_Codex_ranne → 2026-10-19 Codex ranne)
  const title = (h1 ? h1[1].replace(/[*`]|\b_{1,2}|_{1,2}\b/g, '') : base(relPath).replace(/_+/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, VAULT_LIMITS.title) || base(relPath)
  const links = new Set()
  for (const m of prose.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    const target = m[1].split('|')[0].split('#')[0].split('^')[0].trim()
    if (!target) continue
    if (/\.[a-z0-9]{2,5}$/i.test(target) && !/\.md$/i.test(target)) continue   // obrázky, PDF a iné prílohy nie sú poznámky
    links.add(stripMd(target))
  }
  for (const m of prose.matchAll(/\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/gi)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue
    let t = m[1]; try { t = decodeURIComponent(t) } catch {}
    const dir = relPath.split('/').slice(0, -1), parts = [...dir]
    for (const seg of t.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.' && seg) parts.push(seg) }
    links.add(stripMd(parts.join('/')))
  }
  const tags = new Set(fmTags.map((t) => t.replace(/^#/, '').replace(/['"]/g, '').trim()).filter(Boolean))
  for (const m of prose.matchAll(/(?:^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu)) {
    const t = m[1].replace(/\/+$/, '')
    if (t && !(/^[0-9a-f]{3,8}$/i.test(t) && /\d/.test(t)) && !/^[0-9a-f]{6}$/i.test(t)) tags.add(t)   // farby ako #F46D16 nie sú štítky
  }
  const words = (prose.match(/[\p{L}\p{N}]+/gu) || []).length
  return { path: relPath, title, tags: [...tags].slice(0, VAULT_LIMITS.tags).map((t) => t.slice(0, VAULT_LIMITS.tag)), links: [...links].slice(0, VAULT_LIMITS.links), words }
}

/**
 * Index trezoru: odkazy sa rozlíšia ako v Obsidiane (presná cesta, inak názov súboru; pri zhode názvov vyhráva najkratšia cesta).
 * Nevyriešené odkazy (na neexistujúcu poznámku) sa len spočítajú.
 */
export function buildIndex(parsed = [], { name = 'Trezor', syncedAt = new Date().toISOString() } = {}) {
  const notes = parsed.slice(0, VAULT_LIMITS.notes).map((n) => ({ path: n.path, title: n.title, mtime: n.mtime || null, words: n.words || 0, tags: n.tags || [], out: [] }))
  const byPath = new Map(), byBase = new Map()
  notes.forEach((n, i) => {
    byPath.set(norm(stripMd(n.path)), i)
    const b = norm(base(n.path)); if (!byBase.has(b)) byBase.set(b, [])
    byBase.get(b).push(i)
  })
  for (const list of byBase.values()) list.sort((a, b) => notes[a].path.length - notes[b].path.length)
  let unresolved = 0, linkCount = 0
  parsed.slice(0, VAULT_LIMITS.notes).forEach((n, i) => {
    const out = new Set()
    for (const raw of n.links || []) {
      const t = norm(raw)
      let j = byPath.get(t)
      if (j == null && t.includes('/')) { for (const [p, k] of byPath) if (p.endsWith('/' + t)) { j = k; break } }
      if (j == null) { const c = byBase.get(norm(base(raw))); if (c) j = c[0] }
      if (j == null) { unresolved++; continue }
      if (j !== i) out.add(j)
    }
    notes[i].out = [...out]; linkCount += out.size
  })
  return { v: VAULT_VERSION, name, syncedAt, notes, stats: { notes: notes.length, links: linkCount, unresolved } }
}

/** Úsporný zápis indexu (polia namiesto objektov) na prenos a uloženie. */
export const packIndex = (ix) => ({ v: ix.v, name: ix.name, syncedAt: ix.syncedAt, stats: ix.stats, n: ix.notes.map((n) => [n.path, n.title, n.mtime, n.words, n.out, n.tags]) })
export function unpackIndex(p) {
  if (!p || !Array.isArray(p.n)) return null
  return { v: p.v, name: p.name, syncedAt: p.syncedAt, stats: p.stats || { notes: p.n.length, links: 0, unresolved: 0 }, notes: p.n.map((a) => ({ path: a[0], title: a[1], mtime: a[2], words: a[3], out: a[4] || [], tags: a[5] || [] })) }
}

/** Kontrola a očistenie indexu prijatého zvonka (synchronizačný skript). Vracia čistý index alebo vyhodí chybu s dôvodom. */
export function sanitizeIndex(p) {
  const ix = unpackIndex(p)
  if (!ix) throw new Error('Index nemá očakávaný tvar.')
  if (ix.v !== VAULT_VERSION) throw new Error('Nepodporovaná verzia indexu.')
  if (ix.notes.length > VAULT_LIMITS.notes) throw new Error(`Najviac ${VAULT_LIMITS.notes} poznámok.`)
  const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max)
  const seen = new Set(), notes = []
  for (const n of ix.notes) {
    const path = str(n.path, VAULT_LIMITS.path)
    if (!path || !/\.md$/i.test(path) || path.startsWith('/') || path.split('/').includes('..') || seen.has(path)) throw new Error('Neplatná alebo opakovaná cesta poznámky.')
    seen.add(path)
    notes.push({ path, title: str(n.title, VAULT_LIMITS.title) || base(path), mtime: Number.isFinite(Date.parse(n.mtime)) ? new Date(n.mtime).toISOString() : null, words: Math.max(0, Math.min(1e7, Number(n.words) || 0)), tags: (Array.isArray(n.tags) ? n.tags : []).slice(0, VAULT_LIMITS.tags).map((t) => str(t, VAULT_LIMITS.tag)).filter(Boolean), out: [] })
  }
  let links = 0
  ix.notes.forEach((n, i) => { const out = [...new Set((Array.isArray(n.out) ? n.out : []).filter((j) => Number.isInteger(j) && j >= 0 && j < notes.length && j !== i))].slice(0, VAULT_LIMITS.links); notes[i].out = out; links += out.length })
  const syncedAt = Number.isFinite(Date.parse(ix.syncedAt)) ? new Date(ix.syncedAt).toISOString() : new Date().toISOString()
  return { v: VAULT_VERSION, name: str(ix.name, 120) || 'Trezor', syncedAt, notes, stats: { notes: notes.length, links, unresolved: Math.max(0, Number(ix.stats && ix.stats.unresolved) || 0) } }
}

const topFolder = (p) => (p.includes('/') ? p.split('/')[0] : '(koreň)')
/** Stručný prehľad pre obrazovku: počty, naposledy zmenené poznámky, najprepojenejšie uzly, veľkosť priečinkov. */
export function vaultSummary(ix) {
  if (!ix) return null
  const deg = ix.notes.map((n) => n.out.length)
  ix.notes.forEach((n) => n.out.forEach((j) => { deg[j]++ }))
  const order = ix.notes.map((n, i) => i)
  const groups = new Map()
  for (const n of ix.notes) groups.set(topFolder(n.path), (groups.get(topFolder(n.path)) || 0) + 1)
  return {
    name: ix.name, syncedAt: ix.syncedAt, notes: ix.stats.notes, links: ix.stats.links, unresolved: ix.stats.unresolved,
    lastChange: ix.notes.map((n) => n.mtime).filter(Boolean).sort().pop() || null,
    recent: [...order].filter((i) => ix.notes[i].mtime).sort((a, b) => String(ix.notes[b].mtime).localeCompare(String(ix.notes[a].mtime))).slice(0, 8).map((i) => ({ path: ix.notes[i].path, title: ix.notes[i].title, mtime: ix.notes[i].mtime })),
    hubs: [...order].sort((a, b) => deg[b] - deg[a]).slice(0, 8).filter((i) => deg[i] > 0).map((i) => ({ path: ix.notes[i].path, title: ix.notes[i].title, degree: deg[i] })),
    groups: [...groups].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  }
}

/** Graf pre mapu: poznámky + (voliteľne) priečinky ako uzly, aby aj neprepojené poznámky držali pri svojom priečinku. */
export function vaultGraph(ix, { folders = true } = {}) {
  const nodes = [], links = [], folderId = new Map()
  if (!ix) return { nodes, links }
  const add = (n) => { nodes.push(n); return nodes.length - 1 }
  ix.notes.forEach((n) => add({ id: 'n:' + n.path, kind: 'note', label: n.title, group: topFolder(n.path), path: n.path, mtime: n.mtime, words: n.words, tags: n.tags }))
  ix.notes.forEach((n, i) => n.out.forEach((j) => links.push([i, j, 1])))
  if (folders) {
    const ensure = (dir) => {
      if (folderId.has(dir)) return folderId.get(dir)
      const id = add({ id: 'f:' + dir, kind: 'folder', label: dir.split('/').pop() || ix.name, group: dir ? dir.split('/')[0] : '(koreň)', path: dir })
      folderId.set(dir, id)
      if (dir) links.push([id, ensure(dir.split('/').slice(0, -1).join('/')), 0])
      return id
    }
    ix.notes.forEach((n, i) => links.push([i, ensure(n.path.split('/').slice(0, -1).join('/')), 0]))
  }
  return { nodes, links }
}

export const obsidianUrl = (vault, path) => `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(stripMd(path))}`
/** Cesty, ktoré sa do indexu nikdy nedostanú (súkromné prístupy, staré nastavenia, skryté priečinky). */
export const VAULT_SKIP = /(^|\/)(\.[^/]+|node_modules|Pristupy_PRIVATE|_obsidian_nastavenia_stare|KB_snapshoty)(\/|$)|private|heslo|hesla|password|secret/i
