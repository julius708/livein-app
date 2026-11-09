'use client'
import { useState } from 'react'

const KEYS = [['apartment', '🏠', 'Byt a vybavenie'], ['appliances', '🔌', 'Spotrebiče a ako na to'], ['heating', '🌡️', 'Kúrenie a voda'], ['trash', '🗑️', 'Odpad'], ['house_rules', '📋', 'Pravidlá domu'], ['neighborhood', '🗺️', 'Okolie a doprava'], ['important', '⚠️', 'Dôležité informácie'], ['other', '•', 'Iné']]
const TITLES = { apartment: { sk: 'Byt a vybavenie', en: 'Apartment and amenities' }, appliances: { sk: 'Spotrebiče a ako na to', en: 'Appliances and how-to' }, heating: { sk: 'Kúrenie a voda', en: 'Heating and water' }, trash: { sk: 'Odpad', en: 'Trash' }, house_rules: { sk: 'Pravidlá domu', en: 'House rules' }, neighborhood: { sk: 'Okolie a doprava', en: 'Neighbourhood and transport' }, important: { sk: 'Dôležité informácie', en: 'Important information' }, other: { sk: 'Iné', en: 'Other' } }
const empty = (key = 'house_rules') => ({ key, icon: (KEYS.find((k) => k[0] === key) || KEYS[7])[1], title: TITLES[key] || { sk: '', en: '' }, items: [{ title: { sk: '', en: '' }, body: { sk: '', en: '' } }] })

/** Editor rozklikávacích sekcií karty: sekcia = téma, položka = nadpis + text (SK/EN). Polia sa posielajú ako sec_<i>_… v tom istom formulári. */
export default function Sections({ value = [] }) {
  const [secs, setSecs] = useState(() => (Array.isArray(value) && value.length ? value : []).map((s) => ({ ...s, items: (s.items || []).length ? s.items : empty().items })))
  const up = (i, patch) => setSecs(secs.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const upItem = (i, j, patch) => up(i, { items: secs[i].items.map((it, k) => (k === j ? { ...it, ...patch } : it)) })
  return (
    <div className="sp-secs">
      <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Rozklikávacie sekcie ({secs.length})</h3><div className="row"><select id="newsec" defaultValue="house_rules">{KEYS.map(([k, ic, n]) => <option key={k} value={k}>{ic} {n}</option>)}</select><button type="button" className="btn line" onClick={() => setSecs([...secs, empty(document.getElementById('newsec').value)])}>+ Sekcia</button></div></div>
      <p className="hint">Hosť vidí každú sekciu ako rozklik a v nej položky (nadpis → text). Bez kódov a hesiel. Prázdne položky sa neuložia.</p>
      {secs.map((s, i) => (
        <details key={i} className="sp-sec" open={i < 2}>
          <summary><span>{s.icon || '•'}</span> <b>{(s.title && s.title.sk) || s.key}</b> <small className="hint">{(s.items || []).length} položiek</small><span className="sp-sec-x" role="button" onClick={(e) => { e.preventDefault(); if (confirm('Odstrániť sekciu?')) setSecs(secs.filter((_, k) => k !== i)) }}>✕</span></summary>
          <input type="hidden" name={`sec_${i}_key`} value={s.key} /><input type="hidden" name={`sec_${i}_icon`} value={s.icon || ''} />
          <div className="two"><label>Nadpis (SK)<input type="text" name={`sec_${i}_title_sk`} value={(s.title && s.title.sk) || ''} onChange={(e) => up(i, { title: { ...(s.title || {}), sk: e.target.value } })} /></label><label>Nadpis (EN)<input type="text" name={`sec_${i}_title_en`} value={(s.title && s.title.en) || ''} onChange={(e) => up(i, { title: { ...(s.title || {}), en: e.target.value } })} /></label></div>
          {(s.items || []).map((it, j) => (
            <div key={j} className="sp-item">
              <div className="two"><label>Položka (SK)<input type="text" name={`sec_${i}_${j}_title_sk`} value={(it.title && it.title.sk) || ''} onChange={(e) => upItem(i, j, { title: { ...(it.title || {}), sk: e.target.value } })} placeholder="napr. Fajčenie" /></label><label>Item (EN)<input type="text" name={`sec_${i}_${j}_title_en`} value={(it.title && it.title.en) || ''} onChange={(e) => upItem(i, j, { title: { ...(it.title || {}), en: e.target.value } })} placeholder="e.g. Smoking" /></label></div>
              <div className="two"><label>Text (SK)<textarea name={`sec_${i}_${j}_body_sk`} rows={2} value={(it.body && it.body.sk) || ''} onChange={(e) => upItem(i, j, { body: { ...(it.body || {}), sk: e.target.value } })} /></label><label>Text (EN)<textarea name={`sec_${i}_${j}_body_en`} rows={2} value={(it.body && it.body.en) || ''} onChange={(e) => upItem(i, j, { body: { ...(it.body || {}), en: e.target.value } })} /></label></div>
              <button type="button" className="btn line small" onClick={() => up(i, { items: s.items.filter((_, k) => k !== j) })}>Odstrániť položku</button>
            </div>))}
          <button type="button" className="btn line" onClick={() => up(i, { items: [...(s.items || []), { title: { sk: '', en: '' }, body: { sk: '', en: '' } }] })}>+ Položka</button>
        </details>))}
    </div>
  )
}
