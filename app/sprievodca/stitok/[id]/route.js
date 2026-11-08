import { getViewer } from '@/lib/auth'
import { canGuide } from '@/lib/guide/core'
export const dynamic = 'force-dynamic'

/** Stiahnutie vydaného PDF štítku (len tím). */
export async function GET(request, { params }) {
  const { id } = await params
  const v = await getViewer()
  if (!v.user || v.blocked || !canGuide(v.me)) return new Response('unauthorized', { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('not found', { status: 404 })
  const { data } = await v.s.from('guide_label_issues').select('pdf,listing_id,template_version').eq('id', id).maybeSingle()
  if (!data || !data.pdf) return new Response('not found', { status: 404 })
  const bytes = Buffer.from(String(data.pdf).replace(/^\\x/, ''), 'hex')
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="livein-stitok-${data.listing_id}-v${data.template_version}.pdf"`, 'cache-control': 'private, no-store' } })
}
