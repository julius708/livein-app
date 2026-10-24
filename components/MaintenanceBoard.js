'use client'
import { useActionState, useState } from 'react'
import { addIssue, closeIssue } from '@/app/maintenance/actions'

const fmt = (iso) => new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Bratislava' })

/**
 * Údržba: opravy z Asany (Damages Reporting) a ručné opravy z appky, pri každej byt a kedy je voľný
 * na opravu. „Hotovo“ úlohu v Asane uzavrie; ručnú opravu uzavrie v appke.
 */
const LIMIT = 5

export default function MaintenanceBoard({ issues = [], flats = [], asana = false }) {
  const [st, act, pending] = useActionState(addIssue, null)
  const [other, setOther] = useState(false)
  const [all, setAll] = useState(false)
  const shown = all ? issues : issues.slice(0, LIMIT)
  const hidden = issues.length - shown.length
  const nAsana = issues.filter((i) => i.source === 'asana').length
  return (
    <section className="card mt" aria-label="Údržba">
      <h2>🔧 Údržba</h2>
      <p className="mt-sub">Čo treba opraviť a kedy je byt voľný na opravu (podľa rezervácií v systéme, 14 dní dopredu). Opravy prichádzajú z Asany <a href="https://app.asana.com/0/1218054437943454/list" target="_blank" rel="noreferrer">Damages Reporting</a>{nAsana ? ` (${nAsana})` : ''} a z tohto zoznamu.</p>
      {!asana && <p className="hint">Asana zatiaľ nie je pripojená (chýba ASANA_TOKEN vo Verceli), zobrazujú sa len opravy zadané tu.</p>}
      {issues.length === 0 && <p className="hint">Žiadna otvorená oprava.</p>}
      <ul className="mt-l">
        {shown.map((i) => (
          <li key={`${i.source}-${i.id}`} className={i.priority === 'high' ? 'hi' : ''}>
            <span className="n">{i.priority === 'high' && <em className="pr">súrne</em>}{i.flat_name}{i.city ? <small> · {i.city}</small> : null}</span>
            <form action={closeIssue} onSubmit={(e) => { if (!window.confirm(`Označiť ako opravené?\n${i.flat_name}: ${i.text}`)) e.preventDefault() }}>
              <input type="hidden" name="id" value={i.id} /><input type="hidden" name="source" value={i.source} />
              <button className="done" title={i.source === 'asana' ? 'Uzavrie úlohu v Asane' : 'Označiť ako opravené'}>Hotovo ✓</button>
            </form>
            <span className="t">{i.text}</span>
            <span className={`d w-${i.window.kind}`}>{i.window.text}</span>
            <span className="by">
              {i.source === 'asana' ? <>Asana{i.section ? ` · ${i.section}` : ''}{i.guest ? ` · hosť ${i.guest}` : ''}{i.code ? ` · ${i.code}` : ''}{i.by ? ` · ${i.by}` : ''} · {fmt(i.created_at)}{i.url ? <> · <a href={i.url} target="_blank" rel="noreferrer">otvoriť v Asane</a></> : null}</> : <>{i.by} · {fmt(i.created_at)}</>}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <button type="button" className="mt-more" onClick={() => setAll(true)}>Zobraziť všetky opravy ({issues.length})</button>}
      {all && issues.length > LIMIT && <button type="button" className="mt-more" onClick={() => setAll(false)}>Zobraziť len prvých {LIMIT}</button>}
      <details className="mt-add">
        <summary>Pridať opravu (mimo Asany)</summary>
        <form action={act} className="mt-form">
          {!other ? (
            <select name="listing_id" required defaultValue="">
              <option value="" disabled>Vyber byt…</option>
              {flats.map((f) => <option key={f.id} value={f.id}>{f.name}{f.city ? ` (${f.city})` : ''}</option>)}
            </select>
          ) : (
            <input name="listing_name" maxLength={120} placeholder="Kde to je (napr. spoločná chodba Vajnorská)" required />
          )}
          <label className="sw"><input type="checkbox" checked={other} onChange={(e) => setOther(e.target.checked)} /> nie je to konkrétny byt</label>
          <textarea name="text" rows={2} maxLength={500} placeholder="Čo treba opraviť (napr. kvapká batéria v kúpeľni)" required />
          <label className="sw"><input type="checkbox" name="priority" value="high" /> súrne</label>
          <div className="row">
            <button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Pridať'}</button>
            {st && !st.ok && <span className="msg err">{st.error}</span>}
            {st && st.ok && <span className="msg ok">Pridané.</span>}
          </div>
        </form>
      </details>
      <style>{`.mt-sub{color:#6b6866;font-size:14px;margin:4px 0}.mt-l{list-style:none;margin:8px 0 0;padding:0}.mt-l li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:10px 0;border-bottom:1px solid #eceae6;align-items:start}.mt-l li.hi{background:#FFF3E8;margin:0 -8px;padding:10px 8px;border-radius:10px}.mt-l .n{font-weight:700;color:#363433}.mt-l .n small{font-weight:500;color:#6b6866}.mt-l .pr{font-style:normal;background:#F46D16;color:#fff;border-radius:99px;padding:1px 8px;font-size:11px;margin-right:6px;vertical-align:middle}.mt-l .t{grid-column:1/-1;font-size:15px;color:#1d2b24;white-space:pre-wrap}.mt-l .d{grid-column:1/-1;font-size:13px;font-weight:600}.mt-l .w-now{color:#1a7f3c}.mt-l .w-soon{color:#B8470A}.mt-l .w-busy{color:#6b6866}.mt-l .w-none{color:#b33;font-weight:500}.mt-l .by{grid-column:1/-1;font-size:12px;color:#8a8784}.mt-l .by a{color:#F46D16}.mt-l .done{background:#fff;border:1px solid #cfd6cc;border-radius:99px;padding:4px 10px;font-size:13px;font-weight:600;color:#173E2C;cursor:pointer}.mt-l .done:hover{background:#E8ECE4}.mt-more{margin-top:10px;background:none;border:0;padding:0;color:#F46D16;font-weight:700;font-size:14px;cursor:pointer}.mt-more:hover{text-decoration:underline}.mt-add{margin-top:12px}.mt-add summary{cursor:pointer;font-weight:700;font-size:14px;color:#173E2C}.mt-form{display:grid;gap:8px;margin-top:10px;max-width:560px}.mt-form select,.mt-form input,.mt-form textarea{width:100%;font-size:15px;padding:10px 12px;border-radius:12px;border:1px solid #DCE2D6;font-family:inherit;background:#fff}.mt-form .sw{font-size:13px;color:#6b6866;display:flex;gap:6px;align-items:center}.mt-form .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.mt a{color:#F46D16}`}</style>
    </section>
  )
}
