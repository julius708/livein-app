'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { TESTS, validAnswers, score, summary } from '@/lib/personality-tests'

/** Uloží výsledok testu: odpovede sa vyhodnotia na serveri, meno sa dosadí z prihláseného člena tímu. */
export async function saveResult(key, answers) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  if (!TESTS[key]) return { ok: false, error: 'Neznámy test.' }
  if (!validAnswers(key, answers)) return { ok: false, error: 'Odpovedz na všetky otázky.' }
  const sc = score(key, answers)
  const row = { user_id: user.id, email: user.email.toLowerCase(), name: me.name || user.email, test_key: key, scores: sc, summary: summary(key, sc), answers, shared: false }
  const { data, error } = await s.from('personality_results').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message || 'Uloženie zlyhalo.' }
  revalidatePath('/testy'); revalidatePath('/testy/' + key); revalidatePath('/testy/tim'); revalidatePath('/testy/admin')
  return { ok: true, id: data.id, scores: sc, summary: row.summary }
}

/** Zapne alebo vypne zdieľanie vlastného výsledku s tímom. */
export async function setShared(id, shared) {
  const { s, user, me } = await getViewer()
  if (!user || !me) return { ok: false, error: 'Nie si prihlásený/á.' }
  const { data, error } = await s.from('personality_results').update({ shared: !!shared }).eq('id', String(id)).eq('user_id', user.id).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || !data.length) return { ok: false, error: 'Výsledok sa nenašiel. Obnov stránku.' }
  revalidatePath('/testy'); revalidatePath('/testy/tim')
  return { ok: true }
}
