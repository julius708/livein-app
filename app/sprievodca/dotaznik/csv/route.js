import { getViewer } from '@/lib/auth'
import { canGuide } from '@/lib/guide/core'
import { QUESTIONS } from '@/lib/guide/survey'
export const dynamic = 'force-dynamic'

/** Export odpovedí pre marketing (CSV). E-mail len pri súhlase. */
export async function GET() {
  const v = await getViewer()
  if (!v.user || v.blocked || !canGuide(v.me)) return new Response('unauthorized', { status: 401 })
  const { data } = await v.s.from('guide_surveys').select('created_at,listing_id,city,lang,answers,email,email_consent').order('created_at', { ascending: false }).limit(20000)
  const esc = (x) => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`
  const head = ['created_at', 'listing_id', 'city', 'lang', ...QUESTIONS.map((q) => q.id), 'email', 'consent']
  const lines = [head.join(';')]
  for (const r of data || []) lines.push([r.created_at, r.listing_id, r.city, r.lang, ...QUESTIONS.map((q) => { const a = r.answers && r.answers[q.id]; return Array.isArray(a) ? a.join('|') : a }), r.email_consent ? r.email : '', r.email_consent ? 'yes' : 'no'].map(esc).join(';'))
  return new Response('﻿' + lines.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="livein-dotaznik-hosti.csv"', 'cache-control': 'private, no-store' } })
}
