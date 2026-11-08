'use client'
import { useActionState, useState } from 'react'
import { saveListingSettingsAction, savePilotSettingsAction } from '@/app/udrzba/actions'

const eur = (n) => `${Number(n || 0).toLocaleString('sk-SK')} €`
/** Nastavenia bytu (schvaľovateľ, limity, fakturačné pravidlá, služba) a pilotu (test režim, povolené adresy a čísla, poplatok, pripomienky, telefónia). */
export default function Settings({ flats = [], rows = [], settings = {}, isAdmin = false }) {
  const [st, act, pending] = useActionState(saveListingSettingsAction, null)
  const [ps, pact, ppending] = useActionState(savePilotSettingsAction, null)
  const [pick, setPick] = useState('')
  const cur = rows.find((r) => r.listing_id === pick) || {}
  const p = settings.pilot || {}, fee = settings.fee || {}, rem = settings.reminders || {}, tel = settings.telephony || {}, ret = settings.retention || {}
  return (
    <div className="ud-grid">
      <section className="card">
        <h2>Byty: schvaľovateľ a limity ({rows.length} nastavených)</h2>
        <form action={act} className="ud-form" key={pick}>
          <label>Byt<select name="listing_id" required value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Vyber byt…</option>{flats.map((f) => { const has = rows.some((r) => r.listing_id === f.id); return <option key={f.id} value={f.id}>{has ? '✓ ' : ''}{f.name}{f.city ? ` · ${f.city}` : ''}</option> })}</select></label>
          <div className="two"><label>Oprávnený schvaľovateľ<input type="text" name="approver_name" defaultValue={cur.approver_name || ''} /></label><label>E-mail schvaľovateľa<input type="email" name="approver_email" defaultValue={cur.approver_email || ''} /></label></div>
          <div className="two"><label>Telefón schvaľovateľa<input type="text" name="approver_phone" defaultValue={cur.approver_phone || ''} placeholder="+421…" /></label><label>Overenie pri hovore (nápoveda, bez kódov)<input type="text" name="verify_hint" defaultValue={cur.verify_hint || ''} placeholder="napr. meno + ulica bytu" /></label></div>
          <div className="two"><label>Bežný limit bez súhlasu €<input type="number" name="routine_limit" min={0} step="1" defaultValue={cur.routine_limit ?? 0} /></label><label>Havarijný limit €<input type="number" name="emergency_limit" min={0} step="1" defaultValue={cur.emergency_limit ?? 0} /></label></div>
          <div className="two"><label>Materiál fakturovať<select name="material_to" defaultValue={(cur.billing_rules || {}).material_to || 'owner'}><option value="owner">majiteľovi</option><option value="livein">LIVE-IN</option></select></label><label>Služba (e-mail, kam ísť pri urgente)<input type="email" name="duty_contact" defaultValue={cur.duty_contact || ''} /></label></div>
          <label>Fakturačné pravidlá<textarea name="billing_rules" rows={2} defaultValue={(cur.billing_rules || {}).note || ''} placeholder="napr. faktúry na s.r.o. majiteľa, materiál prefakturovať bez prirážky" /></label>
          {st && !st.ok && <p className="err">{st.error}</p>}{st && st.ok && <p className="okmsg">Uložené.</p>}
          <button className="btn" disabled={pending || !pick}>{pending ? 'Ukladám…' : 'Uložiť nastavenia bytu'}</button>
        </form>
        {rows.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>Byt</th><th>Schvaľovateľ</th><th>Limity</th></tr></thead><tbody>{rows.map((r) => <tr key={r.listing_id}><td>{flats.find((f) => f.id === r.listing_id)?.name || r.listing_id}</td><td>{r.approver_name} <small className="hint">{r.approver_email}</small></td><td>{eur(r.routine_limit)} / {eur(r.emergency_limit)}</td></tr>)}</tbody></table>}
      </section>
      <section className="card">
        <h2>Pilot a test režim</h2>
        {!isAdmin && <p className="hint">Mení len admin. Aktuálne: pilot {p.enabled ? 'zapnutý' : 'vypnutý'}, test režim {p.test_mode !== false ? 'áno' : 'nie'}, poskytovateľ {tel.provider || 'test'}.</p>}
        {isAdmin && <form action={pact} className="ud-form">
          <label className="chk"><input type="checkbox" name="enabled" defaultChecked={!!p.enabled} /> Pilot zapnutý (objednávky sa berú ako ostré; zapnúť až po akceptácii LIVE-IN)</label>
          <label className="chk"><input type="checkbox" name="test_mode" value="off" defaultChecked={p.test_mode === false} /> Vypnúť test režim (e-maily a hovory pôjdu komukoľvek, nielen povoleným)</label>
          <label>Povolené e-mailové adresy v test režime (čiarkou alebo riadkom)<textarea name="allowed_emails" rows={2} defaultValue={(p.allowed_emails || []).join('\n')} /></label>
          <label>Povolené telefónne čísla v test režime<textarea name="allowed_phones" rows={2} defaultValue={(p.allowed_phones || []).join('\n')} /></label>
          <label>Poznámka<input type="text" name="notes" defaultValue={p.notes || ''} /></label>
          <h3 style={{ margin: '8px 0 0' }}>Poplatok za bežnú opravu</h3>
          <div className="two"><label>Suma €<input type="number" name="fee_amount" min={0} defaultValue={fee.amount_eur ?? 45} /></label><label>Do minút<input type="number" name="fee_minutes" min={1} defaultValue={fee.max_minutes ?? 60} /></label></div>
          <label className="chk"><input type="checkbox" name="fee_enabled" defaultChecked={!!fee.enabled} /> Poplatok zapnutý</label>
          <label className="chk"><input type="checkbox" name="fee_terms" defaultChecked={!!fee.terms_approved} /> Podmienky s majiteľmi schválené (bez toho sa neúčtuje)</label>
          <h3 style={{ margin: '8px 0 0' }}>Pripomienky a opakovanie</h3>
          <div className="two"><label>Pripomienky majiteľovi po hodinách<input type="text" name="reminder_hours" defaultValue={(rem.owner_reminder_hours || [4, 24]).join(', ')} /></label><label>Eskalácia na službu po hodinách<input type="number" name="escalate_hours" min={1} defaultValue={rem.owner_escalate_hours ?? 48} /></label></div>
          <div className="two"><label>Záloha dodávateľa po hodinách<input type="number" name="backup_hours" min={1} defaultValue={rem.vendor_backup_hours ?? 24} /></label><label>Hovor: max pokusov<input type="number" name="call_attempts" min={1} defaultValue={(rem.call_retry || {}).max_attempts ?? 3} /></label></div>
          <label>Hovor: rozostup pokusov (minúty)<input type="text" name="call_spacing" defaultValue={((rem.call_retry || {}).spacing_minutes || [60, 240]).join(', ')} /></label>
          <h3 style={{ margin: '8px 0 0' }}>Telefónia a uchovávanie</h3>
          <div className="two"><label>Poskytovateľ<select name="provider" defaultValue={tel.provider || 'test'}><option value="test">test (nikdy nevolá)</option><option value="3cx">3CX + OpenAI Realtime</option><option value="twilio">Twilio</option></select></label><label>Verzia agenta<input type="text" name="agent_version" defaultValue={tel.agent_version || 'v0.1'} /></label></div>
          <label className="chk"><input type="checkbox" name="inbound_enabled" defaultChecked={!!tel.inbound_enabled} /> Prichádzajúce hovory cez AI (produkčná trasa až po testoch)</label>
          <div className="two"><label>Prepisy: dni uchovania<input type="number" name="transcripts_days" min={1} defaultValue={ret.transcripts_days ?? 90} /></label><label>Nahrávky: dni uchovania<input type="number" name="recordings_days" min={1} defaultValue={ret.recordings_days ?? 30} /></label></div>
          {ps && !ps.ok && <p className="err">{ps.error}</p>}{ps && ps.ok && <p className="okmsg">Uložené.</p>}
          <button className="btn" disabled={ppending}>{ppending ? 'Ukladám…' : 'Uložiť nastavenia pilotu'}</button>
        </form>}
      </section>
    </div>
  )
}
