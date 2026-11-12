import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getViewer } from '@/lib/auth'
import NoAccess from '@/components/NoAccess'
import HqApp from '@/components/ustredna/HqApp'
import { actorFromViewer } from '@/lib/hq-core'
import { storeForViewer, localMode } from '@/lib/hq-server'
import { hqDashboard } from '@/lib/hq-data'
import './ustredna.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ústredňa' }

export default async function HqPage() {
  const v = await getViewer()
  if (!v.user) redirect('/login?next=/ustredna')
  if (v.blocked) return <NoAccess email={v.user.email} />
  const actor = actorFromViewer(v)
  if (!actor) return <main className="wrap"><section className="card"><h2>Ústredňa je zatiaľ len pre vedenie</h2><p>Ak ju potrebuješ, napíš Júliusovi.</p><p><Link href="/">Späť na domov</Link></p></section></main>
  const data = await hqDashboard(storeForViewer(v), { actor, local: localMode() })
  return <HqApp data={data} canWrite />
}
