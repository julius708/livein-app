'use client'
import { useState } from 'react'
import { PRE_CALL, OPENINGS, QUALIFY, FAQ, CLOSING, NEVER, FOLLOWUP, SCRIPT_VERSION } from '../../lib/call-script.js'

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Skript hovoru: compact = zbalený panel v CRM (Jeden naraz, detail), inak celá stránka. */
export default function CallScript({ compact = false }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(!compact)
  const n = norm(q)
  const hit = (...parts) => !n || parts.some((p) => norm(p).includes(n))
  const faq = FAQ.map((g) => ({ ...g, items: g.items.filter((i) => hit(i.q, i.a, g.g)) })).filter((g) => g.items.length)
  const body = (
    <div className="crm-cs-body">
      <input type="search" className="crm-cs-search" placeholder="Hľadať otázku: provízia, škody, Trnava, zmluva…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hľadať v skripte" />
      {!n && <>
        <details className="crm-cs-sec" open={!compact}><summary>Pred hovorom (30 sekúnd)</summary><ul>{PRE_CALL.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
        <details className="crm-cs-sec" open><summary>Úvod podľa pôvodu leadu</summary>{OPENINGS.map((o) => <div key={o.when} className="crm-cs-open"><b>{o.when}</b><p>{o.text}</p></div>)}</details>
        <details className="crm-cs-sec" open={!compact}><summary>Čo sa pýtame my (kvalifikácia)</summary><ol>{QUALIFY.map((x) => <li key={x.q}><b>{x.q}</b><small>{x.why}</small></li>)}</ol></details>
      </>}
      {faq.map((g) => <details key={g.g} className="crm-cs-sec" open={!!n || !compact}><summary>Klient sa pýta: {g.g} <span>{g.items.length}</span></summary>{g.items.map((i) => <div key={i.q} className="crm-cs-qa"><b>{i.q}</b><p>{i.a}</p></div>)}</details>)}
      {n && !faq.length && <p className="eko-fine">Nič také v skripte nie je. Opýtajte sa Guru alebo napíšte Júliusovi, otázku doplníme.</p>}
      {!n && <>
        <details className="crm-cs-sec" open={!compact}><summary>Ukončenie hovoru a zápis</summary><ul>{CLOSING.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
        <details className="crm-cs-sec" open={!compact}><summary>Keď nedvíha: postup</summary><ul>{FOLLOWUP.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
        <details className="crm-cs-sec never" open={!compact}><summary>Čo nesľubovať a kedy eskalovať</summary><ul>{NEVER.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
      </>}
      <p className="eko-fine">Skript verzia {SCRIPT_VERSION}. Fakty sú z webu live-in.international (Ceny, Otázky majiteľov, Postup). Chýba otázka? Napíšte Júliusovi, doplní sa pre všetkých.</p>
    </div>
  )
  if (!compact) return <section className="card crm-cs">{body}</section>
  return (
    <section className={'card crm-cs compact' + (open ? ' open' : '')}>
      <button type="button" className="crm-cs-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>📞 Skript hovoru: čo povedať a ako odpovedať na otázky <span>{open ? 'skryť ↑' : 'otvoriť ↓'}</span></button>
      {open && body}
    </section>
  )
}
