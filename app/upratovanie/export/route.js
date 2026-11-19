import { getViewer } from '@/lib/auth'
import { clContext, rpc } from '@/lib/cl-server'
import { isMonth, isRangeYmd, monthRange, rangeLabel, reportModel, reportSheets, reportFileName, rangeFileName } from '@/lib/cl-report'
import { buildXlsx } from '@/lib/xlsx-lite'
import { todayBa } from '@/lib/cl-core'

export const dynamic = 'force-dynamic'

/**
 * GET /upratovanie/export?m=2026-11 alebo ?from=2026-11-01&to=2026-11-15, voliteľne &cleaner=<e-mail upratovačky>.
 * Excel: súhrn (hodiny, suma, recenzie), úlohy (byt, čas, checklist, fotky, problémy, recenzia hosťa), podľa bytov. Len manažér a admin.
 */
export async function GET(req) {
  const v = await getViewer()
  if (!v.user || v.blocked) return new Response('Prihlás sa.', { status: 401 })
  const c = await clContext(v)
  if (c.demo) return new Response('Upratovanie ešte nie je spustené v databáze.', { status: 404 })
  if (!c.isManager) return new Response('Bez oprávnenia.', { status: 403 })
  const sp = new URL(req.url).searchParams
  const cleaner = (sp.get('cleaner') || '').trim().toLowerCase() || null
  let from, to, label, name
  if (sp.get('from') || sp.get('to')) {
    from = sp.get('from'); to = sp.get('to')
    if (!isRangeYmd(from, to)) return new Response('Neplatné obdobie (from, to ako RRRR-MM-DD, najviac 400 dní).', { status: 400 })
    label = rangeLabel(from, to)
  } else {
    const m = sp.get('m') || todayBa().slice(0, 7)
    if (!isMonth(m)) return new Response('Neplatný mesiac (m=RRRR-MM).', { status: 400 })
    ;({ from, to } = monthRange(m)); name = reportFileName(m)
  }
  const r = await rpc(v.s, 'cl_report_data', { p_from: from, p_to: to })
  if (!r.ok) return new Response(r.error || 'Chyba pri čítaní.', { status: 500 })
  const model = reportModel(r, from.slice(0, 7), { label, cleaner })
  const file = cleaner || !name ? rangeFileName(from, to, cleaner ? model.who : '') : name
  return new Response(buildXlsx(reportSheets(model)), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${file}"`,
    'Cache-Control': 'no-store',
  } })
}
