'use client'
import { useActionState } from 'react'
import { addLesson } from '@/app/kb/poucenia/actions'

export default function LessonForm() {
  const [st, act, pending] = useActionState(addLesson, null)
  return (
    <form action={act} className="sopform" key={st?.n || 'f'}>
      <div><label>Čo sa stalo</label><textarea className="f" name="what" rows={3} style={{ minHeight: 90, fontFamily: 'inherit' }} required maxLength={2000} placeholder="napr. hosť nemal v správe kód od keysafe, čakal 40 minút" /></div>
      <div><label>Čo zmeniť</label><textarea className="f" name="change" rows={2} style={{ minHeight: 70, fontFamily: 'inherit' }} maxLength={2000} placeholder="napr. doplniť kontrolu správy 24 h pred príchodom do SOP check-in" /></div>
      <div><label>Zdroj (incident, agent, kolega)</label><input className="f" name="source" maxLength={200} /></div>
      <div className="actions"><button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Pridať poučenie'}</button>{st && !st.ok && <span className="msg err">{st.error}</span>}{st && st.ok && <span className="msg ok">Zapísané.</span>}</div>
    </form>
  )
}
