'use client'
import { useState, useTransition } from 'react'
import { submitQuoteAction } from '@/app/p/actions'

const eur = (n) => `${Number(n || 0).toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €`
/** Verejný formulár dodávateľa: ponuka (položky, DPH, výjazd, diagnostika, materiál, termín, platnosť, prílohy), výmena ako variant, neopraviteľnosť, alebo odmietnutie. */
export default function VendorQuoteForm({ token, req }) {
  const [busy, start] = useTransition(); const [done, setDone] = useState(null); const [err, setErr] = useState('')
  const [kind, setKind] = useState('repair'); const [items, setItems] = useState([{ name: '', qty: 1, price: '' }]); const [f, setF] = useState({ vat_mode: 'without_vat', callout: '', diagnostics: '', material: '', eta: '', valid_until: '', note: '', attachments: '', not_repairable: '', replacement_reason: '', replacement_model: '', replacement_price: '', replacement_installation: '', replacement_disposal: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const sub = Number(f.callout || 0) + Number(f.diagnostics || 0) + Number(f.material || 0) + items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0) + (kind === 'replacement' ? Number(f.replacement_price || 0) + Number(f.replacement_installation || 0) + Number(f.replacement_disposal || 0) : 0)
  const send = (decline) => start(async () => {
    setErr('')
    const r = await submitQuoteAction(token, decline ? { decline: true, reason: f.note } : { ...f, kind, items: items.filter((i) => i.name), attachments: f.attachments.split(/\s+/).filter((u) => /^https?:\/\//.test(u)).map((url) => ({ url, name: url.split('/').pop() })) })
    if (r.ok) setDone(r); else setErr(r.error)
  })
  if (done) return <section className="card"><h2>{done.declined ? 'Ďakujeme, dopyt sme uzavreli.' : 'Ďakujeme, ponuku sme prijali.'}</h2><p>{done.declined ? 'Oslovíme iného dodávateľa.' : `Ponuka ${eur(done.quote.total)} je u LIVE-IN. Ozveme sa po rozhodnutí majiteľa.`}</p></section>
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      <h2>Vaša ponuka</h2>
      <div className="row"><label className="chk"><input type="radio" checked={kind === 'repair'} onChange={() => setKind('repair')} /> Oprava</label><label className="chk"><input type="radio" checked={kind === 'replacement'} onChange={() => setKind('replacement')} /> Výmena (samostatný variant)</label></div>
      <b>Položky</b>
      {items.map((it, i) => <div key={i} className="row"><input type="text" placeholder="Položka" value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ flex: '2 1 160px' }} /><input type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} style={{ flex: '0 1 70px' }} /><input type="number" min={0} step="0.01" placeholder="€ / ks" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} style={{ flex: '1 1 90px' }} /></div>)}
      <button type="button" className="btn line" onClick={() => setItems([...items, { name: '', qty: 1, price: '' }])}>+ položka</button>
      <div className="two"><label>Výjazd €<input type="number" min={0} step="0.01" value={f.callout} onChange={set('callout')} /></label><label>Diagnostika €<input type="number" min={0} step="0.01" value={f.diagnostics} onChange={set('diagnostics')} /></label></div>
      <div className="two"><label>Materiál €<input type="number" min={0} step="0.01" value={f.material} onChange={set('material')} /></label><label>DPH<select value={f.vat_mode} onChange={set('vat_mode')}><option value="without_vat">ceny bez DPH (platca)</option><option value="with_vat">ceny s DPH</option><option value="not_vat_payer">nie som platca DPH</option></select></label></div>
      {kind === 'replacement' && <div className="card" style={{ padding: 14, display: 'grid', gap: 8 }}><b>Výmena</b><label>Dôvod výmeny<input type="text" value={f.replacement_reason} onChange={set('replacement_reason')} /></label><label>Model / typ<input type="text" value={f.replacement_model} onChange={set('replacement_model')} /></label><div className="two"><label>Cena zariadenia €<input type="number" min={0} step="0.01" value={f.replacement_price} onChange={set('replacement_price')} /></label><label>Montáž €<input type="number" min={0} step="0.01" value={f.replacement_installation} onChange={set('replacement_installation')} /></label></div><label>Odvoz starého €<input type="number" min={0} step="0.01" value={f.replacement_disposal} onChange={set('replacement_disposal')} /></label></div>}
      <div className="two"><label>Termín (kedy viete prísť)<input type="text" value={f.eta} onChange={set('eta')} placeholder="napr. zajtra 9–12" /></label><label>Ponuka platí do<input type="date" value={f.valid_until} onChange={set('valid_until')} /></label></div>
      <label>Prílohy (odkazy na PDF / fotky)<textarea rows={2} value={f.attachments} onChange={set('attachments')} /></label>
      <label>Poznámka<textarea rows={2} value={f.note} onChange={set('note')} /></label>
      <label>Ak sa to nedá opraviť: vaše zistenie<textarea rows={2} value={f.not_repairable} onChange={set('not_repairable')} placeholder="prázdne, ak je oprava možná" /></label>
      <p><b>Spolu {eur(sub)}</b> <small className="hint">({{ without_vat: 'bez DPH', with_vat: 's DPH', not_vat_payer: 'neplatca' }[f.vat_mode]})</small></p>
      {err && <p className="err">{err}</p>}
      <div className="row"><button className="btn o big" disabled={busy} onClick={() => send(false)}>{busy ? 'Odosielam…' : 'Odoslať ponuku'}</button><button className="btn line" disabled={busy} onClick={() => send(true)}>Nemôžem, odmietam dopyt</button></div>
    </section>
  )
}
