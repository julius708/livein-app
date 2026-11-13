import { getViewer } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Pilot from './Pilot'

export default async function MaintenancePilotPage() {
  const { me } = await getViewer()
  if (!me) redirect('/')
  return <Pilot />
}
