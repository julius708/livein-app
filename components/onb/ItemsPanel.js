'use client'
import { useActionState, useTransition } from 'react'
import { generateItems, setItem, addItem, setRoomTier } from '@/app/zaradenie/[id]/dizajn/actions'

export const TIERS = { minimum: 'Nevyhnutné minimum', standard: 'Odporúčané (štandard LIVE-IN)', komplet: 'Kompletné podľa návrhu' }

const eur = (n) => (n == null ? '' : `${Math.round(Number(n))} €`)

function Row({ it, unitId }) {
  const [busy, start] = useTransition()
  const set = (k, v) => start(() => { const fd = new FormData(); fd.set('item_id', it.id); fd.set('unit_id', unitId); fd.set(k, v); return setItem(fd) })
  return (
    <li className={`it${it.present ? ' have' : ''}`}>
      <label className="chk2" title={it.present ? 'V byte už je' : 'Treba doplniť'}><input type="checkbox" checked={!!it.present} disabled={busy} onChange={(e) => set('present', e.target.checked ? 'true' : 'false')} /><span>{it.present ? 'je' : 'chýba'}</span></label>
      <input className="nm" defaultValue={it.name} disabled={busy} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== it.name) set('name', e.target.value.trim()) }} />
      <input className="q" type="number" min="1" defaultValue={it.qty} disabled={busy} aria-label="Počet" onBlur={(e) => { if (Number(e.target.value) !== it.qty) set('qty', e.target.value) }} />
      <span className="pr">{it.est_min != null || it.est_max != null ? `${eur(it.est_min)}${it.est_max != null ? ` – ${eur(it.est_max)}` : ''}` : ''}</span>
      {it.note && <span className="nt" title={it.note}>{it.note}</span>}
      <button type="button" className="mini" disabled={busy} onClick={() => set('hidden', 'true')}>skryť</button>
    </li>
  )
}

export default function ItemsPanel({ unit, room, items: all, hasDesign }) {
  const [st, act, pending] = useActionState(generateItems, null)
  const [ad, addAct, adding] = useActionState(addItem, null)
  const [sw, startSw] = useTransition()
  const tier = room.items_tier || 'standard'
  const hasTiers = all.some((i) => i.tier)
  // ručne pridané veci (bez verzie) sú vo všetkých troch verziách
  const items = all.filter((i) => !i.tier || i.tier === tier)
  const missing = items.filter((i) => !i.present)
  const cnt = (t) => all.filter((i) => (!i.tier || i.tier === t) && !i.present).length
  const sum = (k) => missing.reduce((a, i) => a + (i[k] != null ? Number(i[k]) * (i.qty || 1) : 0), 0)
  return (
    <div className="items">
      <div className="ihead">
        <h3>Zoznam vecí {items.length ? <small>({missing.length} chýba, {items.length - missing.length} v byte je)</small> : null}</h3>
        <form action={act}><input type="hidden" name="unit_id" value={unit.id} /><input type="hidden" name="room_id" value={room.id} /><button className="btn o" disabled={pending || !hasDesign} title={hasDesign ? '' : 'Najprv vyber návrh'}>{pending ? 'Claude pozerá návrh…' : items.length ? '🔁 Prepísať zoznam z návrhu' : '📝 Zoznam vecí z návrhu'}</button></form>
      </div>
      {st && !st.ok && <p className="msg err">{st.error}</p>}
      {hasTiers && (
        <label className="tier">Verzia zoznamu
          <select value={tier} disabled={sw} onChange={(e) => { const v = e.target.value; startSw(() => { const fd = new FormData(); fd.set('room_id', room.id); fd.set('unit_id', unit.id); fd.set('tier', v); return setRoomTier(fd) }) }}>
            {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v} · {cnt(k)} na doplnenie</option>)}
          </select>
        </label>
      )}
      {items.length > 0 && <ul className="ilist">{items.map((it) => <Row key={it.id} it={it} unitId={unit.id} />)}</ul>}
      {items.length > 0 && <p className="hint">Chýbajúce veci odhadom {Math.round(sum('est_min'))} až {Math.round(sum('est_max'))} €. Ceny sú odhad, overia sa pri nákupe (IKEA, JYSK, Möbelix, Sconto, XXXLutz, Kondela a e-shopy).</p>}
      <form action={addAct} className="iadd">
        <input type="hidden" name="unit_id" value={unit.id} /><input type="hidden" name="room_id" value={room.id} />
        <input name="name" placeholder="+ pridať vec ručne" maxLength={120} required /><input name="qty" type="number" min="1" defaultValue="1" aria-label="Počet" /><input name="est_max" type="number" min="0" placeholder="€" aria-label="Odhad ceny" />
        <button className="mini" disabled={adding}>pridať</button>{ad && !ad.ok && <span className="msg err">{ad.error}</span>}
      </form>
    </div>
  )
}
