'use client'
import { useActionState } from 'react'
import { reviewDoc } from '@/app/kb/dokumenty/actions'

export default function DocReview({ doc }) {
  const [st, act, pending] = useActionState(reviewDoc, null)
  const d = (v) => (v ? String(v).slice(0, 10) : '')
  return (
    <form action={act} className="sopform">
      <input type="hidden" name="path" value={doc.path} />
      <div className="g2">
        <div><label>Stav</label><select className="f" name="status" defaultValue={doc.status || 'schvalene'}><option value="navrh">Návrh</option><option value="schvalene">Schválené</option><option value="zastarane">Zastarané</option></select></div>
        <div><label>Témy (čiarkou)</label><input className="f" name="tags" defaultValue={(doc.tags || []).join(', ')} /></div>
        <div><label>Posledná kontrola</label><input className="f" type="date" name="reviewed_at" defaultValue={d(doc.reviewed_at)} /></div>
        <div><label>Ďalšia kontrola</label><input className="f" type="date" name="next_review_at" defaultValue={d(doc.next_review_at)} /></div>
      </div>
      <div className="actions"><button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť'}</button>{st && !st.ok && <span className="msg err">{st.error}</span>}{st && st.ok && <span className="msg ok">Uložené.</span>}</div>
    </form>
  )
}
