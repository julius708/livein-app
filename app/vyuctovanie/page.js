import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import Board from '@/components/vyuctovanie/Board'
import { canBilling } from '@/lib/billing-core'
import { billingPeriods, billingItems, priceList, billingListings } from '@/lib/billing-server'
import './vyuctovanie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vyúčtovanie majiteľom' }

export default async function VyuctovaniePage({ searchParams }) {
  const sp = (await searchParams) || {}
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/vyuctovanie')
  if (blocked) return <NoAccess email={user.email} />
  if (!canBilling(me)) return <Shell me={me} user={user} isAdmin={isAdmin} active="vyuctovanie" hideFooter><section className="card"><h2>Vyúčtovanie majiteľom je pre vedenie, asistentku a operácie</h2><p>Ak ho potrebuješ, napíš Júliusovi.</p></section></Shell>

  const periods = await billingPeriods(s)
  const m = /^\d{4}-\d{2}$/.test(String(sp.m || '')) ? `${sp.m}-01` : null
  const period = periods.find((p) => p.month === m) || periods[0] || null
  if (!period) return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="vyuctovanie" hideFooter>
      <div className="vy"><Board periods={[]} period={null} items={[]} prices={[]} lists={{ guesty: [], names: [] }} isAdmin={isAdmin} /></div>
    </Shell>
  )
  const [items, prices, lists] = await Promise.all([billingItems(s, period.id), priceList(s), billingListings()])
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="vyuctovanie" hideFooter>
      <div className="vy">
        <Board periods={periods} period={period} items={items} prices={prices} lists={lists} isAdmin={isAdmin} />
      </div>
    </Shell>
  )
}
