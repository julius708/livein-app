import { getViewer } from '@/lib/auth'
import { canBilling, exportSheets, exportFileName } from '@/lib/billing-core'
import { billingItems, billingListings } from '@/lib/billing-server'
import { buildXlsx } from '@/lib/xlsx-lite'

export const dynamic = 'force-dynamic'

/** GET /vyuctovanie/export?m=2026-10 → Vyuctovanie_oktober_2026.xlsx (hárky „Prehľad“ a „Položky po bytoch“). */
export async function GET(req) {
  const { s, user, me, blocked } = await getViewer()
  if (!user || blocked) return new Response('Prihlás sa.', { status: 401 })
  if (!canBilling(me)) return new Response('Bez oprávnenia.', { status: 403 })
  const m = new URL(req.url).searchParams.get('m') || ''
  if (!/^\d{4}-\d{2}$/.test(m)) return new Response('Chýba mesiac (m=RRRR-MM).', { status: 400 })
  const { data: period, error } = await s.from('billing_periods').select('id,month').eq('month', `${m}-01`).maybeSingle()
  if (error) { console.error('vyuctovanie export', error.message); return new Response('Chyba pri čítaní.', { status: 500 }) }
  if (!period) return new Response('Obdobie neexistuje.', { status: 404 })
  const [items, lists] = await Promise.all([billingItems(s, period.id), billingListings()])
  const buf = buildXlsx(exportSheets(period.month, items, lists))
  return new Response(buf, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${exportFileName(period.month)}"`,
    'Cache-Control': 'no-store',
  } })
}
