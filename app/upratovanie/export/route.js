import { getViewer } from '@/lib/auth'
import { clContext, rpc } from '@/lib/cl-server'
import { isMonth, monthRange, reportModel, reportSheets, reportFileName } from '@/lib/cl-report'
import { buildXlsx } from '@/lib/xlsx-lite'
import { todayBa } from '@/lib/cl-core'

export const dynamic = 'force-dynamic'

/** GET /upratovanie/export?m=2026-11 → Upratovanie_november_2026.xlsx (hárky Súhrn, Úlohy, Podľa bytov). Len manažérka a admin. */
export async function GET(req) {
  const v = await getViewer()
  if (!v.user || v.blocked) return new Response('Prihlás sa.', { status: 401 })
  const c = await clContext(v)
  if (c.demo) return new Response('Upratovanie ešte nie je spustené v databáze.', { status: 404 })
  if (!c.isManager) return new Response('Bez oprávnenia.', { status: 403 })
  const m = new URL(req.url).searchParams.get('m') || todayBa().slice(0, 7)
  if (!isMonth(m)) return new Response('Neplatný mesiac (m=RRRR-MM).', { status: 400 })
  const { from, to } = monthRange(m)
  const r = await rpc(v.s, 'cl_report_data', { p_from: from, p_to: to })
  if (!r.ok) return new Response(r.error || 'Chyba pri čítaní.', { status: 500 })
  const buf = buildXlsx(reportSheets(reportModel(r, m)))
  return new Response(buf, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${reportFileName(m)}"`,
    'Cache-Control': 'no-store',
  } })
}
