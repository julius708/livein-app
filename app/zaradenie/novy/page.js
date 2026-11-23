import OnbShell from '@/components/onb/OnbShell'
import NewUnitForm from '@/components/onb/NewUnitForm'
import { requireOnboarding } from '@/lib/onb-viewer'
import { projectMembers, asanaConfigured } from '@/lib/onb-asana'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nový byt' }

export default async function NewUnit() {
  const { s, me, can, canOwner } = await requireOnboarding()
  if (!can) return <OnbShell me={me}><p className="msg err" style={{ marginTop: 20 }}>Zaradenie bytov je pre roly admin, operations a onboarding.</p></OnbShell>
  const [{ data: templates }, members] = await Promise.all([s.rpc('onb_templates'), projectMembers()])
  return (
    <OnbShell me={me} active="novy" intro={{ eyebrow: 'Krok za krokom', title: 'Nový byt', text: 'Zadaj adresu, appka doplní mesto, PSČ a zónu. Po uložení vznikne kópia šablóny v Asane.' }}>
      {!asanaConfigured() && <p className="msg info">Asana nie je pripojená (chýba ASANA_TOKEN vo Verceli): byt sa uloží v appke, do Asany sa dá vytvoriť neskôr.</p>}
      <section className="card"><NewUnitForm templates={templates || []} members={members} canOwner={canOwner} me={me} /></section>
    </OnbShell>
  )
}
