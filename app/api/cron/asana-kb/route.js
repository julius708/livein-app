import { createClient } from '@supabase/supabase-js'
import { buildKbDocs } from '@/lib/asana-kb'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Raz denne: projekt Portfolio & SOPs z Asany → znalostná báza (cs.kb_docs), aby z neho čerpal Guru aj vyhľadávanie v KB. */
export async function GET(req) {
  const u = new URL(req.url)
  const ok = process.env.CRON_SECRET && (req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (!process.env.ASANA_TOKEN || !process.env.KB_IMPORT_SECRET) return Response.json({ ok: false, error: 'chýba ASANA_TOKEN alebo KB_IMPORT_SECRET' }, { status: 500 })
  try {
    const docs = await buildKbDocs()
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    let written = 0
    for (let i = 0; i < docs.length; i += 40) {
      const { data, error } = await s.rpc('kb_import_docs', { p_secret: process.env.KB_IMPORT_SECRET, p_docs: docs.slice(i, i + 40), p_prefix: 'asana/portfolio/' })
      if (error) throw new Error(error.message)
      written += data || 0
    }
    return Response.json({ ok: true, docs: docs.length, written })
  } catch (e) { return Response.json({ ok: false, error: e.message }, { status: 500 }) }
}
