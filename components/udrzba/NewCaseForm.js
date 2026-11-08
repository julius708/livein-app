'use client'
import { useActionState, useMemo, useState } from 'react'
import { createCaseAction } from '@/app/udrzba/actions'
import { CATEGORIES, triage, SEVERITIES, ROLES } from '@/lib/maint'

/** Karta opravy: byt podľa stabilného ID (guesty_id), kategória, príznaky, foto, dopad na hosťa, hosť na mieste. Ukáže, kam triáž prípad pošle. */
export default function NewCaseForm({ flats = [], onCreated }) {
  const [st, act, pending] = useActionState(createCaseAction, null)
  const [cat, setCat] = useState(''); const [impact, setImpact] = useState('none'); const [present, setPresent] = useState(false); const [urgent, setUrgent] = useState(false); const [cosmetic, setCosmetic] = useState(false); const [flat, setFlat] = useState('')
  const t = useMemo(() => (cat ? triage({ category: cat, guest_impact: impact, guest_present: present, urgent, cosmetic }) : null), [cat, impact, present, urgent, cosmetic])
  const f = flats.find((x) => x.id === flat)
  if (st && st.ok) return <section className="card"><h2>✅ Prípad {st.ref} je založený</h2><p>Triáž: <b>{SEVERITIES[st.triage.severity].label}</b>, rieši <b>{ROLES[st.triage.role]}</b>{st.triage.profession ? ` (${st.triage.profession})` : ''}.</p><p className="row"><a className="btn" href={`/udrzba/${st.id}`}>Otvoriť prípad</a><a className="btn line" href="/udrzba">Ďalšie hlásenie</a></p></section>
  return (
    <section className="card">
      <h2>Nové hlásenie</h2>
      <form action={act} className="ud-form">
        <label>Byt
          <select name="listing_id" required value={flat} onChange={(e) => setFlat(e.target.value)}>
            <option value="">Vyber byt…</option>
            {flats.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ''}</option>)}
          </select>
        </label>
        <input type="hidden" name="listing_name" value={f ? f.name : ''} />
        <label>Kategória
          <select name="category" required value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Vyber…</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label>Príznaky (čo sa deje, od kedy, čo sa skúsilo)<textarea name="symptoms" required minLength={5} maxLength={2000} placeholder="napr. Z kotla nejde teplá voda od rána, hosť reštartoval, bez zmeny." /></label>
        <label>Fotky (odkazy, každý na nový riadok)<textarea name="photos" rows={2} placeholder="https://…" /></label>
        <label>Dopad na hosťa
          <select name="guest_impact" value={impact} onChange={(e) => setImpact(e.target.value)}>
            <option value="none">Bez dopadu</option><option value="limited">Obmedzený (dá sa bývať)</option><option value="blocking">Blokujúci (nedá sa plnohodnotne bývať)</option>
          </select>
        </label>
        <label className="chk"><input type="checkbox" name="guest_present" checked={present} onChange={(e) => setPresent(e.target.checked)} /> Hosť je práve v byte</label>
        <label className="chk"><input type="checkbox" name="cosmetic" checked={cosmetic} onChange={(e) => setCosmetic(e.target.checked)} /> Len kozmetika (nič nefunkčné)</label>
        <label className="chk"><input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgentná výnimka (ide službe ihneď)</label>
        {urgent && <label>Dôvod urgentu (eviduje sa)<input type="text" name="urgent_reason" required maxLength={300} /></label>}
        <label>Duplikát prípadu (ID, nepovinné)<input type="text" name="duplicate_of" placeholder="UUID pôvodného prípadu" /></label>
        {t && <p className="hint">Triáž: <span className={`ud-pill ${t.severity}`}>{SEVERITIES[t.severity].label}</span> · rieši <b>{ROLES[t.role]}</b>{t.profession ? ` · profesia ${t.profession}` : ''}{t.direct ? ' · dopyt pôjde priamo profesii' : ''} · termín do {t.hours} h</p>}
        {st && !st.ok && <p className="err">{st.error}</p>}
        <button className="btn o" disabled={pending}>{pending ? 'Ukladám…' : 'Založiť prípad'}</button>
      </form>
    </section>
  )
}
