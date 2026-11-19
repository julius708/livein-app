import ApplyForm from '@/components/upratovanie/ApplyForm'
import '../../upratovanie/upratovanie.css'

export const metadata = { title: 'Prihláška upratovačky', robots: { index: false, follow: false } }

export default function PrihlaskaPage() {
  return (
    <main className="up up-public">
      <header className="up-head"><div><img src="/logo.png" alt="LIVE-IN" height="36" /><h1>Chcem upratovať pre LIVE-IN</h1><p>Vyplň krátku prihlášku. Manažérka upratovania sa ti ozve. Údaje použijeme len na výber upratovačiek a plánovanie bytov podľa tvojej adresy.</p></div></header>
      <ApplyForm />
    </main>
  )
}
