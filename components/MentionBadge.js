import Link from 'next/link'
import { getViewer } from '@/lib/auth'

/** Zvonček v hlavičke: koľko oznamov na nástenke je adresovaných mne a ešte som ich nevidel/a. */
export default async function MentionBadge() {
  try {
    const { s, user } = await getViewer()
    if (!user) return null
    const { count } = await s.from('board_note_mentions').select('note_id', { count: 'exact', head: true }).ilike('email', user.email).is('seen_at', null)
    if (!count) return null
    return <Link href="/#nastenka" className="li-bell" title={`${count} oznamov pre teba na nástenke`}>🔔<b>{count}</b></Link>
  } catch { return null }
}
