'use client'
import { useActionState } from 'react'
import { updateUnit } from '@/app/zaradenie/[id]/actions'
import { STATUS } from '@/lib/onb-const'

export default function UnitForm({ unit, members, canOwner }) {
  const [st, act, pending] = useActionState(updateUnit, null)
  const o = unit.owner_info || {}
  return (
    <form action={act} className="big">
      <input type="hidden" name="id" value={unit.id} />
      <div className="g2">
        <div><label>Stav</label><select className="f" name="status" defaultValue={unit.status}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label>Zodpovedná osoba</label><select className="f" name="responsible" defaultValue={unit.responsible || ''}><option value="">—</option>{[...new Set([unit.responsible, ...members.map((m) => m.name)].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div><label>Odhadované spustenie</label><input className="f" type="date" name="planned_launch" defaultValue={unit.planned_launch || ''} /></div>
        <div><label>Poschodie</label><input className="f" name="floor" defaultValue={unit.floor || ''} /></div>
      </div>
      <div className="g3">
        <div><label>m²</label><input className="f" name="sqm" type="number" step="0.5" defaultValue={unit.sqm ?? ''} /></div>
        <div><label>Spálne</label><input className="f" name="bedrooms" type="number" defaultValue={unit.bedrooms ?? ''} /></div>
        <div><label>Kapacita</label><input className="f" name="capacity" type="number" defaultValue={unit.capacity ?? ''} /></div>
      </div>
      {canOwner && (
        <div className="owner"><small>Údaje o majiteľovi (len admin a operations)</small>
          <div className="g2" style={{ marginTop: 8 }}>
            <div><label>Meno</label><input className="f" name="owner_name" defaultValue={o.name || ''} /></div>
            <div><label>Telefón</label><input className="f" name="owner_phone" defaultValue={o.phone || ''} /></div>
            <div><label>E-mail</label><input className="f" name="owner_email" defaultValue={o.email || ''} /></div>
            <div><label>Poznámka</label><input className="f" name="owner_note" defaultValue={o.note || ''} /></div>
          </div>
        </div>
      )}
      <div><button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť'}</button>{st && !st.ok && <span className="msg err">{st.error}</span>}{st && st.ok && <span className="msg ok">Uložené.</span>}</div>
    </form>
  )
}
