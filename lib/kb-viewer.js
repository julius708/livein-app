import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'

/** Prihlásený člen tímu (app_users). Bez prihlásenia ideme na prihlásenie, bez prístupu na domov. */
export async function requireTeam() {
  const v = await getViewer()
  if (!v.user) redirect('/login?next=/kb')
  if (v.blocked) redirect('/')
  return v
}
export const fmtD = (d) => (d ? new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '')
export const STATUS = { navrh: 'Návrh', schvalene: 'Schválené', zastarane: 'Zastarané', otvorene: 'Otvorené', rozhodnute: 'Rozhodnuté' }
export function reviewState(next) {
  if (!next) return null
  const days = Math.round((Date.parse(next) - Date.now()) / 864e5)
  if (days < 0) return { cls: 'late', text: `kontrola mešká ${-days} d.` }
  if (days <= 14) return { cls: 'soon', text: `kontrola o ${days} d.` }
  return { cls: 'ok', text: `ďalšia kontrola ${fmtD(next)}` }
}
