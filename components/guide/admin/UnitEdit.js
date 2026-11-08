'use client'
import { useActionState, useState, useTransition } from 'react'
import { saveCardAction, saveWifiAction, issueLabelAction } from '@/app/sprievodca/actions'

const J = ({ name, label, v, rows = 2 }) => <div className="two"><label>{label} (SK)<textarea name={`${name}_sk`} rows={rows} defaultValue={(v && v.sk) || ''} /></label><label>{label} (EN)<textarea name={`${name}_en`} rows={rows} defaultValue={(v && v.en) || ''} /></label></div>
export default function UnitEdit({ unit, card = {}, wifi, issues = [], feedback = [], stats = {}, baseUrl, settings = {} }) {
  const [st, act, pending] = useActionState(saveCardAction, null)
  const [ws, wact, wpending] = useActionState(saveWifiAction, null)
  const [busy, start] = useTransition(); const [msg, setMsg] = useState(null)
  const g = settings.general || {}
  return (
    <div className="sp">
      <div className="sp-head"><div><a href="/sprievodca" className="hint">← Jednotky</a><h1>{unit.name || unit.listing_id}</h1><p className="row"><code>{unit.public_code}</code><span className={`sp-pill ${unit.status}`}>{unit.status}</span><a href={`${baseUrl}/g/${unit.public_code}`} target="_blank" rel="noreferrer">sprievodca ↗</a><a href={`${baseUrl}/g/${unit.public_code}/recenzia`} target="_blank" rel="noreferrer">recenzia ↗</a><small className="hint">Guesty {unit.listing_id}</small></p></div></div>
      {msg && <p className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</p>}
      <div className="sp-grid">
        <section className="card">
          <h2>Karta bytu (schválený obsah pre hostí)</h2>
          <p className="hint">Bez kódov a hesiel. Zmena obsahu nemení QR odkaz ani kód.</p>
          <form action={act} className="form">
            <input type="hidden" name="listing_id" value={unit.listing_id} />
            <label>Adresa (na štítok aj pre taxikára)<input type="text" name="address" defaultValue={card.address || unit.address || ''} /></label>
            <J name="address_note" label="Poznámka k adrese (poschodie, vchod)" v={card.address_note} rows={1} />
            <div className="two"><label>Odkaz na navigáciu (nepovinné)<input type="url" name="map_url" defaultValue={card.map_url || ''} placeholder="https://maps.app.goo.gl/…" /></label><label>Súradnice lat, lng (nepovinné)<div className="row"><input type="text" name="lat" defaultValue={card.lat ?? ''} placeholder="48.14" style={{ flex: 1 }} /><input type="text" name="lng" defaultValue={card.lng ?? ''} placeholder="17.10" style={{ flex: 1 }} /></div></label></div>
            <J name="parking" label="Parkovanie" v={card.parking} />
            <J name="arrival" label="Príchod (bez kódov)" v={card.arrival} />
            <J name="rules_override" label="Výnimka z pravidiel (prázdne = spoločné pravidlá)" v={card.rules_override} />
            <div className="two"><label>Čas odchodu<input type="text" name="checkout_time" defaultValue={card.checkout_time || ''} placeholder="10:00" /></label></div>
            <J name="checkout" label="Pokyny k odchodu" v={card.checkout} />
            <J name="help" label="Text pri kontakte na pomoc" v={card.help} rows={1} />
            <h3>Jednotka</h3>
            <div className="two"><label>Google Business Profile (odkaz na recenziu)<input type="url" name="gbp_url" defaultValue={unit.gbp_url || ''} placeholder="https://g.page/r/…/review" /></label><label>Číslo podpory (prebije spoločné)<input type="text" name="support_phone" defaultValue={unit.support_phone || ''} placeholder={g.support_phone || '+421 …'} /></label></div>
            <label>Stav<select name="status" defaultValue={unit.status}><option value="draft">rozpracované</option><option value="review">na kontrolu</option><option value="ready">pripravené</option><option value="active">aktívne</option><option value="inactive">neaktívne (sprievodca nedostupný)</option></select></label>
            <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="approved" defaultChecked={!!card.approved} /> Obsah schválený</label>
            {st && !st.ok && <p className="err">{st.error}</p>}{st && st.ok && <p className="okmsg">Uložené.</p>}
            <button className="btn" disabled={pending}>Uložiť kartu</button>
          </form>
        </section>
        <div style={{ display: 'grid', gap: 14 }}>
          <section className="card">
            <h2>Wi-Fi (chránené)</h2>
            <p className="hint">{wifi ? `Sieť ${wifi.ssid}, heslo uložené (${wifi.updated_at ? new Date(wifi.updated_at).toLocaleDateString('sk-SK') : ''}). Heslo sa nezobrazuje; nové sa zadá raz tu.` : 'Wi-Fi ešte nie je zadané.'} Hosť ho dostane až po overení rezervácie v Guesty.</p>
            <form action={wact} className="form"><input type="hidden" name="listing_id" value={unit.listing_id} /><div className="two"><label>Názov siete<input type="text" name="ssid" defaultValue={wifi ? wifi.ssid : ''} /></label><label>Heslo<input type="password" name="password" autoComplete="new-password" /></label></div>{ws && !ws.ok && <p className="err">{ws.error}</p>}{ws && ws.ok && <p className="okmsg">Uložené.</p>}<button className="btn line" disabled={wpending}>Uložiť Wi-Fi</button></form>
            <p className="hint" style={{ marginTop: 8 }}>Posledných 7 dní: {stats.success || 0} úspešných, {stats.fail || 0} neúspešných, {stats.limited || 0} zablokovaných limitom. Logujeme len výsledok a čas.</p>
          </section>
          <section className="card">
            <h2>Štítok</h2>
            <p className="hint">Vydá sa len so všetkými podmienkami (overené Guesty ID, adresa, kód, overené číslo podpory, funkčné oba odkazy, schválený Google odkaz). Opakovanie nevydá duplikát.</p>
            {issues.length > 0 && <table><thead><tr><th>Verzia</th><th>Vydané</th><th>Oznámené</th><th></th></tr></thead><tbody>{issues.map((i) => <tr key={i.id}><td>v{i.template_version} · {i.variant}</td><td>{new Date(i.issued_at).toLocaleString('sk-SK')}<br /><small className="hint">{i.issued_by}</small></td><td>{i.notified_at ? new Date(i.notified_at).toLocaleString('sk-SK') : '—'}</td><td><a className="btn line" href={`/sprievodca/stitok/${i.id}`}>PDF</a></td></tr>)}</tbody></table>}
            <div className="row" style={{ marginTop: 8 }}><button className="btn o" disabled={busy} onClick={() => start(async () => { const r = await issueLabelAction(unit.listing_id); setMsg(r.ok ? { ok: true, text: r.duplicate ? 'Štítok pre túto verziu už existuje (bez duplikátu).' : 'Štítok vydaný, tím dostal oznámenie.' } : { ok: false, text: r.reasons ? 'Na kontrolu: ' + r.reasons.join('; ') : r.error }) })}>Vydať štítok</button></div>
          </section>
          <section className="card">
            <h2>Súkromná spätná väzba ({feedback.length})</h2>
            {feedback.length === 0 && <p className="hint">Zatiaľ žiadna.</p>}
            {feedback.map((f) => <p key={f.id}><b>{f.rating ? '★'.repeat(f.rating) : ''}</b> {f.text}<br /><small className="hint">{new Date(f.created_at).toLocaleString('sk-SK')}{f.contact ? ` · ${f.contact}` : ''}</small></p>)}
          </section>
        </div>
      </div>
    </div>
  )
}
