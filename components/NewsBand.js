import { sb } from '@/lib/supabase'
import NewsTicker from '@/components/NewsTicker'

/** Novinky o appkách za posledných 60 dní (tabuľka app_updates), zobrazené pod hlavičkou. */
export default async function NewsBand() {
  try {
    const s = await sb()
    const since = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data } = await s.from('app_updates').select('id,headline,text,app,url,created_at').eq('hidden', false).gte('created_at', since).order('created_at', { ascending: false }).limit(40)
    return <NewsTicker items={data || []} />
  } catch { return null }
}
