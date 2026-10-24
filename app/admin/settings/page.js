import { getViewer } from '@/lib/auth'
import { LINKABLE } from '@/lib/modules'
import SettingsForm from '@/components/SettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nastavenia' }

export default async function SettingsPage() {
  const { s } = await getViewer()
  const { data: cfg } = await s.from('config').select('key,value').in('key', ['module_urls', 'auth'])
  const map = {}
  for (const r of cfg || []) map[r.key] = r.value || {}
  return <SettingsForm modules={LINKABLE} urls={map.module_urls || {}} auth={map.auth || {}} />
}
