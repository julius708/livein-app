import { getViewer } from '@/lib/auth'
import UsersAdmin from '@/components/UsersAdmin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ľudia a práva' }

export default async function UsersPage() {
  const { s, user } = await getViewer()
  const [{ data: users }, { data: logins }, { data: cities }, { data: authCfg }] = await Promise.all([
    s.from('app_users').select('*').order('name'),
    s.rpc('admin_user_logins'),
    s.rpc('known_cities'),
    s.from('config').select('value').eq('key', 'auth').maybeSingle(),
  ])
  const defaultPassword = (authCfg && authCfg.value && authCfg.value.default_password) || 'livein'
  const loginMap = {}
  for (const l of logins || []) loginMap[l.email] = { last: l.last_sign_in_at, providers: l.providers || [], mustChange: !!l.must_change }
  const listed = new Set((users || []).map((u) => u.email))
  const orphans = (logins || []).filter((l) => !listed.has(l.email)).sort((a, b) => String(b.last_sign_in_at || '').localeCompare(String(a.last_sign_in_at || '')))

  return (
    <UsersAdmin
      initial={users || []}
      logins={loginMap}
      cities={cities || []}
      orphans={orphans}
      myEmail={user.email.toLowerCase()}
      defaultPassword={defaultPassword}
    />
  )
}
