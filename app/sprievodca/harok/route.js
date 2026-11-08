import { getViewer } from '@/lib/auth'
import { canGuide } from '@/lib/guide/core'
import { renderTestSheet } from '@/lib/guide/label'
import { settings, baseUrl } from '@/lib/guide/server'
export const dynamic = 'force-dynamic'

/** Skúšobný hárok A4 s oboma variantmi QR (ukážkové údaje označené UKÁŽKA). */
export async function GET() {
  const v = await getViewer()
  if (!v.user || v.blocked || !canGuide(v.me)) return new Response('unauthorized', { status: 401 })
  const g = await settings(v.s), base = await baseUrl(v.s)
  const bytes = await renderTestSheet({ address: 'Ukážková 12, 811 01 Bratislava', name: 'UKÁŽKA · Byt A', code: 'ABCDEFGH', supportPhone: g.general.support_phone || '+421 900 000 000', baseUrl: base, sample: true })
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="livein-skusobny-harok.pdf"', 'cache-control': 'private, no-store' } })
}
