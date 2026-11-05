import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import CallScript from '@/components/crm/CallScript'
import '../crm.css'
import '../../ekonomika/ekonomika.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Skript hovoru · CRM' }

export default async function ScriptPage() {
  const { user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!(me.roles || []).includes('crm')) redirect('/crm')
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="crm" guruApp="crm" hideFooter>
      <div className="crm crm-detail">
        <section className="card crm-dhead"><div className="crm-dhead-main"><h1>Skript hovoru s majiteľom</h1><p className="crm-meta">Pomôcka pre každého, kto volá leadom: úvod podľa pôvodu, kvalifikačné otázky, odpovede na všetko, čo sa majitelia pýtajú, a čo nesľubovať. Ten istý skript je zbalený priamo pri leade v Jeden naraz aj v detaile leadu.</p><p><Link className="eko-link" href="/crm">← Späť na leady</Link></p></div></section>
        <CallScript />
      </div>
    </Shell>
  )
}
