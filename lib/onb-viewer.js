import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'

const ALLOWED = ['admin', 'operations', 'onboarding']
/** Prihlásený člen tímu s rolou admin, operations alebo onboarding. Údaje o majiteľovi vidia len admin a operations. */
export async function requireOnboarding() {
  const v = await getViewer()
  if (!v.user) redirect('/login?next=/zaradenie')
  const roles = (v.me && v.me.roles) || []
  const can = roles.some((r) => ALLOWED.includes(r))
  const canOwner = roles.some((r) => r === 'admin' || r === 'operations')
  return { ...v, can, canOwner }
}
export { fmtD, STATUS, TYPES, ZONES } from '@/lib/onb-const'
