import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import PasswordForm from '@/components/PasswordForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Heslo' }

export default async function PasswordPage() {
  const { user, me, isAdmin, blocked, mustChange } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="password" locked={mustChange} hideFooter>
      <div className="card" style={{ maxWidth: 520, margin: '22px auto 0' }}>
        <h2>{mustChange ? 'Nastav si vlastné heslo' : 'Zmena hesla'}</h2>
        <p className="sub">{mustChange
          ? 'Prihlásil/a si sa dočasným heslom. Zvoľ si vlastné – aspoň 8 znakov. Potom ťa pustíme ďalej.'
          : 'Zvoľ si nové heslo – aspoň 8 znakov.'}</p>
        <PasswordForm />
      </div>
    </Shell>
  )
}
