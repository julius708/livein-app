'use client'
import { useActionState, useState } from 'react'
import { saveVendorAction } from '@/app/udrzba/actions'

const eur = (n) => (n == null ? '' : `${Number(n).toLocaleString('sk-SK')} €`)
/** Sieť technikov: profesia, lokalita, značky, dostupnosť, termín odpovede, cena výjazdu, primárny a záložný. */
export default function Vendors({ vendors = [] }) {
  const [st, act, pending] = useActionState(saveVendorAction, null)
  const [edit, setEdit] = useState(null)
  const v = edit || {}
  return (
    <div className="ud-grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(300px,2fr)' }}>
      <section className="card">
        <h2>Dodávatelia ({vendors.length})</h2>
        {vendors.length === 0 && <p className="hint">Zatiaľ nikto. Pridaj prvého vpravo.</p>}
        <table><thead><tr><th>Meno</th><th>Profesie</th><th>Lokalita</th><th>Odpoveď</th><th>Výjazd</th><th></th></tr></thead><tbody>
          {vendors.map((x) => <tr key={x.id} style={{ opacity: x.active ? 1 : 0.5 }}><td><b>{x.name}</b>{x.is_primary ? ' · primárny' : ''}{x.backup_of ? ` · záloha za ${vendors.find((y) => y.id === x.backup_of)?.name || '?'}` : ''}<br /><small className="hint">{x.email || 'bez e-mailu'}{x.phone ? ` · ${x.phone}` : ''}</small></td><td>{(x.professions || []).join(', ')}<br /><small className="hint">{(x.brands || []).join(', ')}</small></td><td>{x.locality}<br /><small className="hint">{x.availability}</small></td><td>{x.response_hours} h</td><td>{eur(x.callout_fee)}</td><td><button type="button" className="btn line" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEdit(x)}>Upraviť</button></td></tr>)}
        </tbody></table>
      </section>
      <section className="card">
        <h2>{edit ? `Upraviť: ${edit.name}` : 'Nový dodávateľ'}</h2>
        <form action={act} className="ud-form" key={edit ? edit.id : 'new'}>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <label>Meno / firma<input type="text" name="name" required defaultValue={v.name || ''} /></label>
          <label>Profesie (čiarkou: kúrenár, inštalatér…)<input type="text" name="professions" required defaultValue={(v.professions || []).join(', ')} /></label>
          <div className="two"><label>Lokalita<input type="text" name="locality" defaultValue={v.locality || ''} placeholder="Bratislava" /></label><label>Značky (čiarkou)<input type="text" name="brands" defaultValue={(v.brands || []).join(', ')} /></label></div>
          <label>Dostupnosť<input type="text" name="availability" defaultValue={v.availability || ''} placeholder="po–pia 8–17, víkend po dohode" /></label>
          <div className="two"><label>Termín odpovede (h)<input type="number" name="response_hours" min={1} defaultValue={v.response_hours || 24} /></label><label>Cena výjazdu €<input type="number" name="callout_fee" min={0} step="0.01" defaultValue={v.callout_fee ?? ''} /></label></div>
          <div className="two"><label>E-mail (na dopyty)<input type="email" name="email" defaultValue={v.email || ''} /></label><label>Telefón<input type="text" name="phone" defaultValue={v.phone || ''} /></label></div>
          <label>Záloha za<select name="backup_of" defaultValue={v.backup_of || ''}><option value="">— nie je záložný —</option>{vendors.filter((y) => y.id !== v.id).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <label className="chk"><input type="checkbox" name="is_primary" defaultChecked={!!v.is_primary} /> Primárny pre svoju profesiu</label>
          {edit && <label className="chk"><input type="checkbox" name="active" value="off" defaultChecked={v.active === false} /> Neaktívny (neponúkať v dopytoch)</label>}
          <label>Poznámka<textarea name="note" rows={2} defaultValue={v.note || ''} /></label>
          {st && !st.ok && <p className="err">{st.error}</p>}
          {st && st.ok && <p className="okmsg">Uložené.</p>}
          <div className="row"><button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť'}</button>{edit && <button type="button" className="btn line" onClick={() => setEdit(null)}>Nový</button>}</div>
        </form>
      </section>
    </div>
  )
}
