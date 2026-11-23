import Link from 'next/link'
import { getViewer } from '@/lib/auth'
import { myMentions } from '@/lib/home-data'

/** Zvonček v hlavičke: koľko oznamov na nástenke je adresovaných mne a ešte som ich nevidel/a. */
export default async function MentionBadge() {
  try {
    const { s, user } = await getViewer()
    if (!user) return null
    const count = (await myMentions(s, user.email)).filter((m) => !m.seen_at).length
    if (!count) return null
    return <Link href="/#nastenka" className="li-bell" title={`${count} oznamov pre teba na nástenke`}>🔔<b>{count}</b></Link>
  } catch { return null }
}
