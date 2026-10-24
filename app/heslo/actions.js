'use server'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'

export async function changePassword(prev, formData) {
  const { s, user } = await getViewer()
  if (!user) return { ok: false, error: 'Nie si prihlásený/á.' }
  const p1 = String(formData.get('p1') || '')
  const p2 = String(formData.get('p2') || '')
  if (p1.length < 8) return { ok: false, error: 'Heslo musí mať aspoň 8 znakov.' }
  if (p1 !== p2) return { ok: false, error: 'Heslá sa nezhodujú.' }
  const weak = ['livein', 'live-in', 'password', 'heslo', '12345678', 'livein123', 'live-in123']
  if (weak.includes(p1.toLowerCase())) return { ok: false, error: 'Toto heslo je príliš ľahké. Zvoľ iné.' }
  if (user.email && p1.toLowerCase().includes(user.email.split('@')[0].toLowerCase()) && user.email.split('@')[0].length > 3) return { ok: false, error: 'Heslo by nemalo obsahovať tvoj e-mail.' }

  const { error } = await s.auth.updateUser({ password: p1, data: { must_change_password: false } })
  if (error) {
    if (/same password|different from the old/i.test(error.message || '')) return { ok: false, error: 'Nové heslo musí byť iné ako to staré.' }
    if (/weak|should contain|at least/i.test(error.message || '')) return { ok: false, error: 'Heslo nespĺňa pravidlá: ' + error.message }
    return { ok: false, error: 'Zmena hesla zlyhala: ' + (error.message || 'neznáma chyba') }
  }
  redirect('/?heslo=ok')
}
