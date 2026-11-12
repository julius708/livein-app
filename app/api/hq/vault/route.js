import { NextResponse } from 'next/server'
import { resolveCaller } from '@/lib/hq-server'
import { loadVault, saveVault, packIndex } from '@/lib/hq-vault-server'
export const dynamic = 'force-dynamic'

/** Index Obsidian trezoru pre mapu a vyhľadávanie (prihlásený admin alebo agent). Neobsahuje text poznámok. */
export async function GET(request) {
  const c = await resolveCaller(request)
  if (c.error) return NextResponse.json({ ok: false, error: c.error }, { status: c.status })
  const v = await loadVault(c.viewer ? c.viewer.s : c.s)
  if (v.error) return NextResponse.json({ ok: false, error: 'Index trezoru sa nepodarilo načítať.' }, { status: 500 })
  return NextResponse.json({ ok: true, source: v.source, index: v.index ? packIndex(v.index) : null })
}

/**
 * Príjem indexu od synchronizačného skriptu (tools/ustredna/vault-sync.mjs). Autentifikácia ako pri /api/hq/events.
 * Posielať smie admin alebo agent so schopnosťou `work`. Telo: zbalený index (názvy, cesty, štítky, prepojenia); text poznámok sa neprijíma.
 */
export async function POST(request) {
  const c = await resolveCaller(request)
  if (c.error) return NextResponse.json({ ok: false, error: c.error }, { status: c.status })
  if (!(c.actor.capabilities || []).includes('work')) return NextResponse.json({ ok: false, error: 'Na synchronizáciu trezoru nemáš oprávnenie.' }, { status: 403 })
  const len = Number(request.headers.get('content-length') || 0)
  if (len > 3_000_000) return NextResponse.json({ ok: false, error: 'Index je príliš veľký.' }, { status: 413 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Telo musí byť JSON.' }, { status: 400 }) }
  try {
    const r = await saveVault(c.viewer ? c.viewer.s : c.s, body, { actorId: c.actor.id })
    return NextResponse.json({ ok: true, ...r, actorId: c.actor.id })
  } catch (e) {
    const msg = String((e && e.message) || e)
    if (/^trezor: /.test(msg)) { console.error('[hq] vault', msg.slice(0, 160)); return NextResponse.json({ ok: false, error: 'Index sa nepodarilo uložiť.' }, { status: 500 }) }
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 400 })
  }
}
