import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getViewer } from '@/lib/auth'
import NoAccess from '@/components/NoAccess'
import HqApp from '@/components/ustredna/HqApp'
import { actorFromViewer } from '@/lib/hq-core'
import { storeForViewer, localMode } from '@/lib/hq-server'
import { hqDashboard } from '@/lib/hq-data'
import { hqLive } from '@/lib/hq-live'
import './ustredna.css'

export const dynamic = 'force-dynamic'
// Vlastný manifest: po „Pridať na plochu“ na telefóne vznikne samostatná ikona Ústredňa, ktorá sa otvára priamo tu.
export const metadata = { title: 'Ústredňa', manifest: '/ustredna.webmanifest', appleWebApp: { capable: true, title: 'Ústredňa', statusBarStyle: 'black-translucent' } }

export default async function HqPage() {
  const v = await getViewer()
  if (!v.user) redirect('/login?next=/ustredna')
  if (v.blocked) return <NoAccess email={v.user.email} />
  const actor = actorFromViewer(v)
  if (!actor) return <main className="wrap"><section className="card"><h2>Ústredňa je zatiaľ len pre vedenie</h2><p>Ak ju potrebuješ, napíš Júliusovi.</p><p><Link href="/">Späť na domov</Link></p></section></main>
  // Živé údaje z existujúcich modulov appky sa vždy čítajú cez prihláseného používateľa (jeho práva v databáze), aj keď register beží lokálne.
  const live = await hqLive(v.s).catch((e) => { console.error('[hq] live', String(e && e.message).slice(0, 160)); return null })
  const data = await hqDashboard(storeForViewer(v), { actor, local: localMode(), live })
  return <HqApp data={data} canWrite />
}
