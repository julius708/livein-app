import KbShell from '@/components/kb/KbShell'
import SopForm from '@/components/kb/SopForm'
import { requireTeam } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nový SOP' }

export default async function NewSop() {
  const { me, isAdmin } = await requireTeam()
  return (
    <KbShell active="sop" intro={{ eyebrow: 'Postupy', title: 'Nový SOP', text: 'Vznikne ako návrh, schvaľuje admin.' }}>
      {isAdmin ? <section className="card"><SopForm isAdmin={isAdmin} me={me} /></section> : <p className="msg err">Nový SOP môže založiť len admin.</p>}
    </KbShell>
  )
}
