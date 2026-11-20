import ApplyForm from '@/components/upratovanie/ApplyForm'
import ProfileForm from '@/components/upratovanie/ProfileForm'
import { inviteInfo } from './actions'
import '../../upratovanie/upratovanie.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prihláška upratovačky', robots: { index: false, follow: false } }

export default async function PrihlaskaPage({ searchParams }) {
  const sp = (await searchParams) || {}
  const token = typeof sp.t === 'string' ? sp.t : ''
  const info = token ? await inviteInfo(token) : null
  if (token && !info) {
    return (
      <main className="up up-public">
        <header className="up-head"><div><img src="/logo.png" alt="LIVE-IN" height="36" /><h1>Tento odkaz už nie je platný</h1><p>Údaje sa z neho dajú vyplniť len jedenkrát. Ak potrebuješ nový odkaz, požiadaj manažérku upratovania. Ak si sa ešte neprihlásila, vyplň <a href="/uprat/prihlaska">prihlášku</a>.</p></div></header>
      </main>
    )
  }
  if (info) {
    const first = String(info.name || '').split(/\s+/)[0]
    return (
      <main className="up up-public">
        <header className="up-head"><div><img src="/logo.png" alt="LIVE-IN" height="36" /><h1>Ahoj{first ? ' ' + first : ''}, vyplň svoje údaje</h1><p>Stačí telefón, adresa bydliska a dni, kedy môžeš pracovať. Podľa adresy a dní ti appka priradí byty v blízkosti. Ostatné nastavenia (koľko bytov zvládaš, cenu) vyplní manažér.</p></div></header>
        <ProfileForm token={token} />
      </main>
    )
  }
  return (
    <main className="up up-public">
      <header className="up-head"><div><img src="/logo.png" alt="LIVE-IN" height="36" /><h1>Chcem upratovať pre LIVE-IN</h1><p>Vyplň krátku prihlášku. Manažérka upratovania sa ti ozve. Údaje použijeme len na výber upratovačiek a plánovanie bytov podľa tvojej adresy.</p></div></header>
      <ApplyForm />
    </main>
  )
}
