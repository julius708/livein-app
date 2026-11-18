import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import PriceCalc from '@/components/PriceCalc'
import { addDaysIso, parseInitial } from '@/lib/price-calc'
import { APARTMENTS, PRICE_DATA_DATE } from '@/lib/price-calc-data'
import './kalkulacka.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kalkulačka ceny' }

/** Dnešný dátum v Bratislave (YYYY-MM-DD). */
function todayBratislava() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Kalkulačka ceny pre celý tím: koľko stojí byt na noc alebo na viac nocí, keď hosť pýta cenu. */
export default async function Kalkulacka({ searchParams }) {
  const { user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  const today = todayBratislava()
  const initial = parseInitial(APARTMENTS, (await searchParams) || {}, today)
  // predvolený pobyt: najbližší piatok na 3 noci (ako v pôvodnej kalkulačke)
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay()
  const checkIn = addDaysIso(today, (5 - dow + 7) % 7 || 7)
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="kalkulacka" hideFooter>
      <PriceCalc apartments={APARTMENTS} dataDate={PRICE_DATA_DATE} today={today} defaultCheckIn={checkIn} defaultCheckOut={addDaysIso(checkIn, 3)} initial={initial} />
    </Shell>
  )
}
