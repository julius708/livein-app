import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import AdminTabs from '@/components/AdminTabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Správa' }

export default async function AdminLayout({ children }) {
  const { user, me, isAdmin } = await getViewer()
  if (!user) redirect('/login')
  if (!isAdmin) redirect('/')
  return (
    <Shell me={me} user={user} isAdmin active="admin" hideFooter>
      <AdminTabs />
      {children}
    </Shell>
  )
}
