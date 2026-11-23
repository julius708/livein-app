import { getViewer } from '@/lib/auth'
import { modulesFor } from '@/lib/modules'
import { moduleUrls } from '@/lib/home-data'
import AppsMenu from '@/components/AppsMenu'

/** Zoznam aplikácií podľa rolí prihláseného (rovnaký ako dlaždice na domove), s adresami z nastavení. */
export default async function AppsNav({ me, current = 'home' }) {
  if (!me) return null
  try {
    const { s } = await getViewer()
    const urls = await moduleUrls(s)
    const apps = [{ id: 'home', icon: '🏠', title: 'Domov', desc: 'Prehľad dňa, nástenka, čísla.', url: '/' }, ...modulesFor(me.roles).map((m) => ({ ...m, url: m.href || urls[m.id] || null })).filter((m) => m.url)]
    return <AppsMenu apps={apps} current={current} />
  } catch { return null }
}
