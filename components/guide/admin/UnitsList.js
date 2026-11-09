'use client'
import { useActionState, useState, useTransition } from 'react'
import { createUnitAction, syncAction, importCardsAction, saveSettingsAction, importGuestyBatchAction, recomputeAction, issueAllAction } from '@/app/sprievodca/actions'

const ST = { draft: 'Rozpracované', review: 'Na kontrolu', ready: 'Pripravené', active: 'Aktívne (štítok vydaný)', inactive: 'Neaktívne' }
export default function UnitsList({ units = [], listings = [], settings = {}, isAdmin = false, baseUrl }) {
  const [f, setF] = useState('all'); const [q, setQ] = useState(''); const [busy, start] = useTransition(); const [msg, setMsg] = useState('')
  const [imp, impAct, impPending] = useActionState(importCardsAction, null)
  const [st, setAct, setPending] = useActionState(saveSettingsAction, null)
  const [pick, setPick] = useState('')
  const [prog, setProg] = useState(null)
  const rows = units.filter((u) => f === 'all' || (f === 'incomplete' ? (u.score || 0) < 100 && !u.approved : u.status === f)).filter((u) => !q || `${u.name} ${u.address} ${u.public_code} ${u.listing_id}`.toLowerCase().includes(q.toLowerCase()))
  const without = listings.filter((l) => !units.some((u) => u.listing_id === l.guesty_id))
  const g = settings.general || {}, pilot = settings.pilot || {}
  return (
    <div className="sp-grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(300px,2fr)' }}>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Jednotky ({units.length})</h2><div className="sp-filters">{['all', 'incomplete', 'active', 'ready', 'review', 'draft'].map((k) => <button key={k} type="button" className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k === 'all' ? 'Všetky' : ST[k]} <small>{k === 'all' ? units.length : units.filter((u) => u.status === k).length}</small></button>)}</div></div>
        <input type="text" placeholder="Hľadať byt, adresu, kód" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '10px 0' }} />
        <table><thead><tr><th>Byt</th><th>Kód</th><th>Úplnosť</th><th>Stav</th><th>Štítok</th></tr></thead><tbody>
          {rows.map((u) => <tr key={u.listing_id}><td><a href={`/sprievodca/${u.listing_id}`}><b>{u.name || u.listing_id}</b></a><br /><small className="hint">{u.address || 'bez adresy'}{u.city ? ` · ${u.city}` : ''}</small></td><td><code>{u.public_code}</code></td><td title={(u.missing || []).join(', ')}><div className="sp-bar sm"><i style={{ width: `${u.score || 0}%` }} /></div><small className="hint">{u.score || 0} %{u.approved ? ' ✓' : ''}</small><br /><a className="hint" href={`${baseUrl}/g/${u.public_code}`} target="_blank" rel="noreferrer">otvoriť</a></td><td><span className={`sp-pill ${u.status}`}>{ST[u.status] || u.status}</span>{u.review_reason && <><br /><small className="err">{u.review_reason}</small></>}</td><td>{u.issue ? <a href={`/sprievodca/stitok/${u.issue.id}`}>v{u.issue.template_version} PDF</a> : '—'}</td></tr>)}
        </tbody></table>
        {rows.length === 0 && <p className="hint">Nič.</p>}
      </section>
      <div style={{ display: 'grid', gap: 14 }}>
        <section className="card">
          <h2>Nová jednotka</h2>
          <p className="hint">Kód sa pridelí raz a nikdy sa nemení. Listingy bez jednotky: {without.length}.</p>
          <div className="row"><select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}><option value="">Vyber listing…</option>{without.map((l) => <option key={l.guesty_id} value={l.guesty_id}>{l.name || l.title}{l.city ? ` · ${l.city}` : ''}</option>)}</select><button className="btn" disabled={busy || !pick} onClick={() => start(async () => { const r = await createUnitAction(pick); setMsg(r.ok ? `Vytvorené, kód ${r.code}` : r.error) })}>Vytvoriť</button></div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn line" disabled={busy} onClick={() => start(async () => { const r = await syncAction(); setMsg(r.ok ? `Synchronizované: ${r.created} nových z ${r.listings} listingov.` : r.error) })}>Vytvoriť pre všetky aktívne listingy</button><a className="btn line" href="/sprievodca/harok" target="_blank" rel="noreferrer">Skúšobný hárok (PDF)</a></div>
          {msg && <p className="okmsg">{msg}</p>}
        </section>
        <section className="card">
          <h2>Návrhy z Guesty</h2>
          <p className="hint">Pre každý byt stiahne pokyny k príchodu a odchodu, parkovanie, manuál, vybavenie a Wi-Fi z Guesty, vyčistí kódy a AI z toho urobí dvojjazyčné sekcie. Výsledok je návrh na kontrolu (stav „na kontrolu“). Nedoplnených: {units.filter((u) => !u.imported).length}.</p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => start(async () => { let total = 0; for (let i = 0; i < 60; i++) { const r = await importGuestyBatchAction(false); if (!r.ok) { setMsg(r.error); break } total += r.done; setProg(`${total} hotových, ${r.remaining} zostáva…`); if (!r.remaining || (!r.done && r.failed)) break } setProg(null); setMsg(`Import z Guesty dokončený: ${total} bytov.`); location.reload() })}>{busy ? 'Importujem…' : 'Importovať chýbajúce'}</button>
            <button className="btn line" disabled={busy} onClick={() => start(async () => { const r = await recomputeAction(); setMsg(r.ok ? `Úplnosť prepočítaná (${r.updated} zmien).` : r.error) })}>Prepočítať úplnosť</button>
          </div>
          {prog && <p className="hint">{prog}</p>}
        </section>
        <section className="card">
          <h2>Import kariet z Prílohy A</h2>
          <p className="hint">Lokálne: <code>node tools/guide/priloha-a.mjs priloha.docx &gt; karty.json</code>, obsah vložiť sem. Páruje sa podľa adresy; viac jednotiek na adrese ostáva na kontrolu a doplní sa ručne v detaile. Wi-Fi ide do chránenej tabuľky.</p>
          <form action={impAct} className="form">
            <textarea name="json" rows={4} placeholder='{"cards":[…]}' />
            <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="dry" defaultChecked /> Len skúška (nič neuloží)</label>
            <button className="btn" disabled={impPending}>{impPending ? 'Spracúvam…' : 'Spustiť'}</button>
            {imp && !imp.ok && <p className="err">{imp.error}</p>}
            {imp && imp.ok && <div><p className="okmsg">{imp.dry ? 'Skúška' : 'Import'}: kariet {imp.cards}, spárované {imp.matched}, na kontrolu {imp.review}, bez zhody {imp.unmatched}, uložené {imp.imported}.</p>{imp.reviewList.length > 0 && <ul className="hint" style={{ paddingLeft: 18 }}>{imp.reviewList.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>}
          </form>
        </section>
        <section className="card">
          <h2>Nastavenia pilotu</h2>
          {!isAdmin && <p className="hint">Mení len admin. Číslo podpory: {g.support_phone || '—'} ({g.support_phone_verified ? 'overené' : 'neoverené'}). Pilotné jednotky: {(pilot.units || []).length}.</p>}
          {isAdmin && <form action={setAct} className="form">
            <label>Overené číslo podpory<input type="text" name="support_phone" defaultValue={g.support_phone || ''} placeholder="+421 …" /></label>
            <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="support_phone_verified" defaultChecked={!!g.support_phone_verified} /> Číslo je overené (bez toho sa štítky nevydávajú)</label>
            <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="pilot_all" defaultChecked={!!pilot.all} /> Všetky byty: štítok sa vydá každému bytu so schváleným obsahom (denný beh aj tlačidlo nižšie)</label>
            <label>Pilotné jednotky (Guesty listing ID, každé na riadok – platí, keď nie sú zapnuté všetky byty)<textarea name="pilot_units" rows={3} defaultValue={(pilot.units || []).map((x) => (x && x.listing_id) || x).join('\n')} /></label>
            <div className="two"><label>Verzia šablóny štítku<input type="text" name="template_version" defaultValue={g.template_version || 1} /></label><label>Variant QR<select name="label_variant" defaultValue={g.label_variant || 'standard'}><option value="standard">štandardný kontrast (biela plocha pod QR)</option><option value="inverted">biele QR na zelenej</option></select></label></div>
            <label>Základná adresa odkazov<input type="url" name="base_url" defaultValue={g.base_url || 'https://app.live-in.international'} /></label>
            {st && !st.ok && <p className="err">{st.error}</p>}{st && st.ok && <p className="okmsg">Uložené.</p>}
            <button className="btn" disabled={setPending}>Uložiť</button>
          </form>}
          {isAdmin && <div className="row" style={{ marginTop: 10 }}><button className="btn o" disabled={busy} onClick={() => start(async () => { if (!confirm('Vydať štítky všetkým bytom so schváleným obsahom?')) return; const r = await issueAllAction(); setMsg(r.ok ? `Vydané ${r.issued} štítkov, na kontrolu ${r.review}, cieľ ${r.pilot_units} bytov${r.all ? ' (všetky)' : ''}.` : r.error) })}>Vydať štítky pre všetky pripravené</button></div>}
        </section>
      </div>
    </div>
  )
}
