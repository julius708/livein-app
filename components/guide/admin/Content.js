'use client'
import { useActionState, useState } from 'react'
import { saveContentAction } from '@/app/sprievodca/actions'

const J = ({ name, label, v, rows = 2 }) => <div className="two"><label>{label} (SK)<textarea name={`${name}_sk`} rows={rows} defaultValue={(v && v.sk) || ''} /></label><label>{label} (EN)<textarea name={`${name}_en`} rows={rows} defaultValue={(v && v.en) || ''} /></label></div>
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
function Form({ kind, item }) {
  const [st, act, pending] = useActionState(saveContentAction, null)
  return (
    <form action={act} className="form" key={item ? item.id : 'new'}>
      <input type="hidden" name="kind" value={kind} />{item && <input type="hidden" name="id" value={item.id} />}
      {kind !== 'rule' ? <label>Mesto<input type="text" name="city" list="cities" defaultValue={(item && item.city) || ''} required /></label> : <label>Mesto (prázdne = spoločné pre všetky)<input type="text" name="city" list="cities" defaultValue={(item && item.city) || ''} /></label>}
      {kind !== 'rule' && <J name="title" label="Názov" v={item && item.title} rows={1} />}
      <J name="body" label={kind === 'rule' ? 'Pravidlo' : 'Text'} v={item && item.body} />
      {kind === 'tip' && <div className="two"><label>Kategória<input type="text" name="category" defaultValue={(item && item.category) || ''} placeholder="jedlo, káva, výlet" /></label><label>Odkaz<input type="url" name="url" defaultValue={(item && item.url) || ''} /></label></div>}
      {kind === 'event' && <><div className="two"><label>Začiatok<input type="datetime-local" name="starts_at" defaultValue={toLocal(item && item.starts_at)} /></label><label>Koniec (po ňom sa skryje)<input type="datetime-local" name="ends_at" defaultValue={toLocal(item && item.ends_at)} required /></label></div><div className="two"><label>Miesto<input type="text" name="place" defaultValue={(item && item.place) || ''} /></label><label>Odkaz<input type="url" name="url" defaultValue={(item && item.url) || ''} /></label></div></>}
      <div className="two"><label>Poradie<input type="text" name="sort" defaultValue={(item && item.sort) || 0} /></label>{item && <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="active" value="off" defaultChecked={item.active === false} /> Skryť</label>}</div>
      {st && !st.ok && <p className="err">{st.error}</p>}{st && st.ok && <p className="okmsg">Uložené.</p>}
      <button className="btn" disabled={pending}>{item ? 'Uložiť' : 'Pridať'}</button>
    </form>
  )
}
export default function Content({ rules = [], tips = [], events = [], cities = [] }) {
  const [edit, setEdit] = useState(null)
  const Block = ({ kind, title, items, render }) => (
    <section className="card"><h2>{title} ({items.length})</h2>
      {items.map((it) => <div key={it.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid #173e2c14', padding: '6px 0' }}><span style={{ opacity: it.active === false ? 0.5 : 1 }}>{render(it)}</span><button type="button" className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEdit({ kind, item: it })}>Upraviť</button></div>)}
      <h3>{edit && edit.kind === kind ? 'Upraviť' : 'Nové'}</h3>
      <Form kind={kind} item={edit && edit.kind === kind ? edit.item : null} />
      {edit && edit.kind === kind && <button type="button" className="btn line" style={{ marginTop: 6 }} onClick={() => setEdit(null)}>Nové namiesto úpravy</button>}
    </section>
  )
  return (
    <div className="sp-grid">
      <datalist id="cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      <Block kind="rule" title="Spoločné pravidlá bytu" items={rules} render={(r) => <><b>{r.city || 'všetky'}</b> · {(r.body && r.body.sk) || ''}</>} />
      <Block kind="tip" title="Tipy v okolí" items={tips} render={(t) => <><b>{t.city}</b> · {(t.title && t.title.sk) || ''}{t.category ? ` (${t.category})` : ''}</>} />
      <Block kind="event" title="Podujatia (skončené sa skryjú samy)" items={events} render={(e) => <><b>{e.city}</b> · {(e.title && e.title.sk) || ''} · do {e.ends_at ? new Date(e.ends_at).toLocaleDateString('sk-SK') : '?'}{e.ends_at && Date.parse(e.ends_at) < Date.now() ? ' (skončené)' : ''}</>} />
    </div>
  )
}
