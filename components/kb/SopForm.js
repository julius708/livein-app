'use client'
import { useActionState } from 'react'
import { saveSop } from '@/app/kb/sop/actions'

export default function SopForm({ sop, isAdmin, me }) {
  const [st, act, pending] = useActionState(saveSop, { isNew: !sop })
  const d = (v) => (v ? String(v).slice(0, 10) : '')
  return (
    <form action={act} className="sopform">
      {sop && <input type="hidden" name="slug" value={sop.slug} />}
      <div><label>Názov</label><input className="f" name="title" defaultValue={sop?.title || ''} required maxLength={160} /></div>
      <div className="g2">
        <div><label>Stav</label>
          <select className="f" name="status" defaultValue={sop?.status || 'navrh'}>
            <option value="navrh">Návrh</option>{isAdmin && <option value="schvalene">Schválené</option>}<option value="zastarane">Zastarané</option>
          </select></div>
        <div><label>Vlastník</label><input className="f" name="owner" defaultValue={sop?.owner || me?.name || ''} maxLength={80} /></div>
        <div><label>Posledná kontrola</label><input className="f" type="date" name="reviewed_at" defaultValue={d(sop?.reviewed_at)} /></div>
        <div><label>Ďalšia kontrola</label><input className="f" type="date" name="next_review_at" defaultValue={d(sop?.next_review_at)} /></div>
        <div><label>Témy (čiarkou)</label><input className="f" name="tags" defaultValue={(sop?.tags || []).join(', ')} placeholder="check-in, platby, kúrenie" /></div>
        <div><label>Mesto (ak platí len pre jedno)</label><input className="f" name="city" defaultValue={sop?.city || ''} placeholder="Bratislava / Košice" /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--muted)' }}><input type="checkbox" name="todo" defaultChecked={!!sop?.todo} /> Bude doplnené (časť postupu ešte chýba)</label>
      <div><label>Text (Markdown: # nadpis, - odrážka, **tučné**, [OVERIŤ], [DOPLNIŤ])</label><textarea className="f" name="body" defaultValue={sop?.body_md || ''} /></div>
      <div><label>Poznámka k zmene (uloží sa do histórie verzií)</label><input className="f" name="note" placeholder="čo sa zmenilo a prečo" maxLength={240} /></div>
      <div className="actions">
        <button className="btn" disabled={pending}>{pending ? 'Ukladám…' : sop ? 'Uložiť zmenu' : 'Založiť SOP'}</button>
        {st && !st.ok && st.error && <span className="msg err">{st.error}</span>}
        {st && st.ok && <span className="msg ok">Uložené.</span>}
      </div>
    </form>
  )
}
