import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { adminClientAsync } from '@/lib/supabase-admin'
import { ingestListing, matchProperty, notifyDigest, markMissing, loadSettings } from '@/lib/inv-store'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ITEMS = 200
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }

/**
 * Import a aktualizácia ponúk pre externých agentov. Autentifikácia: `Authorization: Bearer <INVEST_INGEST_SECRET>`.
 * Telo: { source_key, source_name?, complete?, items: [{ external_id, url, city, address, price, area_interior, rooms, checked_at, prov, … }] } (najviac 200 položiek).
 * Idempotentné: rovnaký zdroj + external_id aktualizuje ten istý záznam; duplicity naprieč portálmi sa zlúčia alebo navrhnú na zlúčenie.
 * `complete: true` = položky sú ÚPLNÝ prehľad aktívnych inzerátov zdroja; len vtedy sa chýbajúce (po 2 kontrolách) označia ako odstránené. Nikdy ako predané.
 */
export async function POST(request) {
  const secret = process.env.INVEST_INGEST_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'Import nie je nastavený (chýba INVEST_INGEST_SECRET).' }, { status: 503 })
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!given || !same(given, secret)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Telo musí byť JSON.' }, { status: 400 }) }
  const items = Array.isArray(body && body.items) ? body.items : null
  if (!items) return NextResponse.json({ ok: false, error: 'Chýba pole items.' }, { status: 400 })
  if (items.length > MAX_ITEMS) return NextResponse.json({ ok: false, error: `Najviac ${MAX_ITEMS} položiek v jednej požiadavke.` }, { status: 413 })
  const sourceKey = String(body.source_key || '').trim().toLowerCase().slice(0, 80)
  if (body.complete === true && !sourceKey) return NextResponse.json({ ok: false, error: 'Pri complete=true je povinný source_key.' }, { status: 400 })
  const s = await adminClientAsync()
  const settings = await loadSettings(s)
  const results = [], touched = new Set(), seen = []
  const sum = { created: 0, updated: 0, merged: 0, suggested: 0, invalid: 0, errors: 0 }
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { sum.invalid++; results.push({ status: 'invalid', error: 'Položka musí byť objekt.' }); continue }
    const rec = { ...raw, source_key: raw.source_key || sourceKey || undefined }
    try {
      const r = await ingestListing(s, rec, { settings, via: 'ingest' + (sourceKey ? ':' + sourceKey : ''), actor: 'ingest-api' })
      if (!r.ok) { sum.invalid++; results.push({ external_id: raw.external_id || null, status: 'invalid', error: r.error }); continue }
      touched.add(r.property_id); seen.push(String(raw.external_id || ''))
      const st = r.created ? 'created' : r.merged ? 'merged' : 'updated'
      sum[st === 'created' ? 'created' : st === 'merged' ? 'merged' : 'updated']++
      if (r.suggested) sum.suggested++
      results.push({ external_id: raw.external_id || null, status: st, property_id: r.property_id, price_changed: !!(r.price && r.price.changed), merge_suggested: !!r.suggested })
    } catch (e) { sum.errors++; console.error('[invest] ingest', String(e && e.message).slice(0, 120)); results.push({ external_id: raw.external_id || null, status: 'error', error: 'Položku sa nepodarilo uložiť.' }) }
  }
  let missing = null
  if (body.complete === true && sourceKey && sum.errors === 0) missing = await markMissing(s, sourceKey, seen, { complete: true, ok: true, threshold: settings.agent.missing_before_removed || 2 })
  for (const id of touched) { try { await matchProperty(s, id, { settings }) } catch (e) { console.error('[invest] match', String(e && e.message).slice(0, 120)) } }
  const dg = await notifyDigest(s).catch(() => ({ sent: 0 }))
  if (sourceKey) {
    const row = { key: sourceKey, name: String(body.source_name || sourceKey).slice(0, 80), kind: 'ingest', ...(sum.errors === 0 ? { last_ok_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 } : { last_error: 'Chyba pri ukladaní položiek', last_error_at: new Date().toISOString() }) }
    const ex = await s.from('inv_sources').select('key').eq('key', sourceKey).maybeSingle()
    if (ex.data) await s.from('inv_sources').update(row).eq('key', sourceKey); else await s.from('inv_sources').insert(row)
  }
  return NextResponse.json({ ok: sum.errors === 0, summary: sum, missing, notifications: dg.sent, items: results })
}
export async function GET() { return NextResponse.json({ ok: false, error: 'Použite POST s Authorization: Bearer. Dokumentácia: docs/investicie/README.md' }, { status: 405 }) }
