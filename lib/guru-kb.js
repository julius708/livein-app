// Pravidelná aktualizácia znalostí Guru (cron /api/cron/guru-kb): Asana Portfolio & SOPs, karty Sprievodcu bytom,
// dokumentácia appiek z repozitára (docs/**.md) a automatická mapa databázy. Všetko ide do cs.kb_docs cez kb_import_docs,
// takže to nájde Guru (search_kb) aj Znalostná báza. Výstup je dáta, nie inštrukcie.
import fs from 'node:fs'
import path from 'node:path'

const two = (o, lang = 'sk') => (o && (o[lang] || o.en || o.sk)) || ''
const line = (label, v) => (v ? `${label}: ${v}` : '')

/** Jeden dokument KB pre byt zo Sprievodcu (adresa, časy, príchod, odchod, parkovanie, sekcie, Wi-Fi). Bez kódov – tie Sprievodca neobsahuje. */
export function guideDoc(unit, card = {}, wifi = null, base = 'https://app.live-in.international') {
  const secs = (Array.isArray(card.sections) ? card.sections : []).map((s) => `${two(s.title)}:\n` + (s.items || []).map((it) => `• ${two(it.title)}${two(it.body) ? ' – ' + two(it.body) : ''}`).join('\n')).join('\n\n')
  const body = [
    line('Byt', unit.name), line('Adresa', card.address || unit.address), line('Mesto', unit.city),
    line('Verejný sprievodca (QR)', unit.public_code ? `${base}/g/${unit.public_code}` : ''),
    line('Stav obsahu', `${unit.status || ''}${card.approved ? ', schválený' : ', neschválený návrh'}, úplnosť ${card.completeness ?? 0} %`),
    line('Príchod od', card.checkin_time), line('Odchod do', card.checkout_time),
    two(card.address_note) ? `Poznámka k adrese: ${two(card.address_note)}` : '',
    two(card.arrival) ? `Príchod (kroky):\n${two(card.arrival)}` : '', two(card.parking) ? `Parkovanie: ${two(card.parking)}` : '',
    two(card.checkout) ? `Odchod: ${two(card.checkout)}` : '', two(card.help) ? `Pomoc: ${two(card.help)}` : '',
    secs, wifi && wifi.ssid ? `Wi-Fi: sieť ${wifi.ssid}${wifi.password ? ', heslo ' + wifi.password : ''} (hosť ju dostane po overení pobytu)` : '',
    `(Zdroj: Sprievodca bytom v appke, ${base}/sprievodca/${unit.listing_id})`,
  ].filter(Boolean).join('\n')
  return { path: `guide/${unit.listing_id}`, title: `Sprievodca: ${unit.name || unit.listing_id}`, content: body, source: 'Sprievodca bytom (appka)', tags: ['sprievodca', 'byt', unit.city || ''].filter(Boolean), updated_at: card.updated_at || unit.updated_at || new Date().toISOString() }
}

/** Karty Sprievodcu pre všetky jednotky (admin klient). */
export async function guideDocs(s, base) {
  const [{ data: units }, { data: cards }, { data: wifi }] = await Promise.all([s.from('guide_units').select('listing_id,public_code,name,address,city,status,updated_at').neq('status', 'inactive'), s.from('guide_cards').select('*'), s.from('guide_wifi').select('listing_id,ssid,password')])
  const c = new Map((cards || []).map((x) => [x.listing_id, x])), w = new Map((wifi || []).map((x) => [x.listing_id, x]))
  return (units || []).map((u) => guideDoc(u, c.get(u.listing_id) || {}, w.get(u.listing_id) || null, base))
}

/** Dokumentácia appiek z repozitára: docs/**.md (README údržby, sprievodcu, zadania pre tím). */
export function appDocs(root = process.cwd()) {
  const dir = path.join(root, 'docs'); const out = []
  const walk = (d) => { for (const f of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.md')) { const rel = path.relative(dir, p).replace(/\\/g, '/'); const txt = fs.readFileSync(p, 'utf8'); const title = (txt.match(/^#\s+(.+)$/m) || [])[1] || rel; out.push({ path: `docs/${rel.replace(/\.md$/, '')}`, title: `Dokumentácia: ${title.slice(0, 160)}`, content: txt.slice(0, 60000) + `\n\n(Zdroj: repozitár livein-app, docs/${rel})`, source: 'Dokumentácia appiek (repozitár)', tags: ['dokumentacia', rel.split('/')[0]], updated_at: new Date().toISOString() }) } } }
  walk(dir)
  return out
}

const HIDE = new Set(['guesty_tokens', 'guesty_state', 'push_subscriptions', 'settings_history', 'config', 'app_state', 'webhook_events', 'sync_locks', 'crm_sync_queue', 'public.app_users', 'economics_snapshots', 'guru_turns', 'guru_facts', 'guru_daily_facts'])
/** Mapa databázy (tabuľky a stĺpce schémy public) – Guru ju nájde cez search_kb, keď sa pýta, kde sú dáta. */
export async function schemaDoc(s) {
  const { data, error } = await s.rpc('schema_map')
  if (error) throw new Error('schema: ' + error.message)
  const rows = (Array.isArray(data) ? data : []).filter((r) => !HIDE.has(r.table_name))
  const content = ['Tabuľky databázy LIVE-IN (schéma public), automaticky každých 6 hodín. Na čítanie cez nástroj sql (SELECT, max 200 riadkov).', '', ...rows.map((r) => `${r.table_name}: ${r.cols}`), '', '(Zdroj: information_schema, generuje cron guru-kb)'].join('\n')
  return { path: 'schema/public', title: 'Mapa databázy: tabuľky a stĺpce', content, source: 'Databáza (automaticky)', tags: ['schema', 'databaza'], updated_at: new Date().toISOString() }
}

/** Import jednej skupiny dokumentov (kb_import_docs kontroluje prefix cesty). */
export async function importDocs(s, docs, prefix) {
  let n = 0
  for (let i = 0; i < docs.length; i += 40) { const { data, error } = await s.rpc('kb_import_docs', { p_secret: process.env.KB_IMPORT_SECRET, p_docs: docs.slice(i, i + 40), p_prefix: prefix }); if (error) throw new Error(prefix + ': ' + error.message); n += data || 0 }
  return n
}
