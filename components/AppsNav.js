import { sb } from '@/lib/supabase'
import { modulesFor } from '@/lib/modules'
import AppsMenu from '@/components/AppsMenu'

/** Zoznam aplikácií podľa rolí prihláseného (rovnaký ako dlaždice na domove), s adresami z nastavení. */
export default async function AppsNav({ me, current = 'home' }) {
  if (!me) return null
  try {
    const s = await sb()
    const { data: cfg } = await s.from('config').select('value').eq('key', 'module_urls').maybeSingle()
    const urls = (cfg && cfg.value) || {}
    const apps = [{ id: 'home', icon: '🏠', title: 'Domov', desc: 'Prehľad dňa, nástenka, čísla.', url: '/' }, ...modulesFor(me.roles).map((m) => ({ ...m, url: m.href || urls[m.id] || null })).filter((m) => m.url)]
    return <AppsMenu apps={apps} current={current} />
  } catch { return null }
}
