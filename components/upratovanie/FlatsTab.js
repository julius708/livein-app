'use client'
import { useState } from 'react'
import { saveFlatAction } from '@/app/upratovanie/actions'
import { centsToInput, fmtEur } from '@/lib/cl-core'
import { useRun, Msg, Field, Pill } from './ui'

export default function FlatsTab({ data, demo }) {
  const [q, setQ] = useState('')
  const list = Object.values(data.flats).filter((f) => !q || `${f.listing_name} ${f.address} ${f.city}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => String(a.listing_name).localeCompare(String(b.listing_name), 'sk'))
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Byty: vstup, ďalší checklist, čas a cena</h2>
        <p className="up-hint">Adresa, súradnice a vstup do bytu sa preberajú zo Sprievodcu bytom, upratovačka má rovnaký vstup ako hosť (nič sa nevypisuje znova). Tu môžeš doplniť len body checklistu pre tento byt, odhad času, pevnú cenu za upratanie a nepovinný doplnok pre upratovačky. Vstup vidí iba upratovačka, ktorej je byt priradený.</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt…" aria-label="Hľadať byt" />
      </section>
      {list.slice(0, 80).map((f) => <Flat key={f.listing_id} f={f} demo={demo} />)}
      {list.length > 80 && <p className="up-hint">Zobrazených prvých 80 z {list.length}. Spresni hľadanie.</p>}
    </div>
  )
}

function Flat({ f, demo }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ access_note: f.access_note || '', extra: (f.extra_checklist || []).join('\n'), est: f.est_minutes || 90, pay: centsToInput(f.pay_cents) })
  const { pending, msg, run } = useRun()
  return (
    <section className="up-panel">
      <button type="button" className="up-person-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{f.listing_name}</b><small>{f.address || 'bez adresy'}{f.city ? ', ' + f.city : ''}</small>
        {f.access_note && <Pill>má doplnok</Pill>}
        {f.pay_cents != null && <Pill>{fmtEur(f.pay_cents)}</Pill>}
        {f.lat == null && <Pill tone="prob">bez súradníc</Pill>}
      </button>
      {open && (
        <div className="up-form">
          <Field label="Doplnok pre upratovačky (nepovinné)" hint="Len ak upratovačka potrebuje niečo navyše oproti vstupu pre hosťa, napr. kde nechať kľúč alebo kam vyniesť odpad." wide><textarea rows="3" maxLength="2000" value={v.access_note} onChange={(e) => setV({ ...v, access_note: e.target.value })} /></Field>
          <Field label="Ďalší checklist len pre tento byt" hint="Každý bod na nový riadok." wide><textarea rows="3" value={v.extra} onChange={(e) => setV({ ...v, extra: e.target.value })} /></Field>
          <Field label="Odhad času (minúty)"><input type="number" min="10" max="600" value={v.est} onChange={(e) => setV({ ...v, est: e.target.value })} /></Field>
          <Field label="Pevná cena za upratanie (€)" hint="Prázdne = podľa sadzby upratovačky."><input inputMode="decimal" value={v.pay} onChange={(e) => setV({ ...v, pay: e.target.value })} placeholder="napr. 35" /></Field>
          <div className="up-row"><button className="btn" disabled={pending || demo} onClick={() => run(() => saveFlatAction({ listing_id: f.listing_id, access_note: v.access_note, extra_checklist: v.extra, est_minutes: v.est, pay: v.pay }), { ok: 'Uložené.' })}>Uložiť</button></div>
          <Msg msg={msg} />
        </div>
      )}
    </section>
  )
}
