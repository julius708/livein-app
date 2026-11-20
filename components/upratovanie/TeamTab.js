'use client'
import { useState } from 'react'
import { saveStaffAction, geocodeStaffAction, decideApplicationAction, inviteMemberAction } from '@/app/upratovanie/actions'
import ApplyLink from './ApplyLink'
import { WEEKDAYS_SHORT, centsToInput, fmtEur } from '@/lib/cl-core'
import { useRun, Msg, Field, Pill } from './ui'

export default function TeamTab({ data, demo }) {
  const [add, setAdd] = useState({ name: '', email: '', phone: '' })
  const [res, setRes] = useState(null)
  const { pending, msg, run } = useRun()
  const people = [...data.staff].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'sk') : a.role === 'manager' ? -1 : 1))
  return (
    <div className="up-wrap">
      <section className="up-panel"><ApplyLink /></section>
      {data.applications.length > 0 && (
        <section className="up-panel">
          <h2>Nové prihlášky ({data.applications.length})</h2>
          <p className="up-hint">Prihlásiť sa môže ktokoľvek cez verejný formulár. Po schválení vznikne používateľ s rolou „Upratovanie a pranie“ a profil upratovačky; do appky sa prihlási e-mailom, heslo nepotrebuje.</p>
          {data.applications.map((a) => <Application key={a.id} a={a} demo={demo} />)}
        </section>
      )}
      <section className="up-panel">
        <h2>Tím upratovania</h2>
        <p className="up-hint">Každá upratovačka má vlastné nastavenia: koľko bytov jej appka priradí za deň a za týždeň, ako ďaleko, v ktorých lokalitách, aké dni pracuje, vlastné inštrukcie a cenu práce. Zmeny platia pre ďalšie priradenia.</p>
        {people.map((s) => <Person key={s.email} s={s} flats={data.flats} demo={demo} />)}
        <form className="up-add" onSubmit={(e) => { e.preventDefault(); if (add.email.trim()) run(() => inviteMemberAction(add), { then: (r) => { setRes(r); setAdd({ name: '', email: '', phone: '' }) } }) }}>
          <Field label="Meno"><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="meno a priezvisko" autoComplete="off" /></Field>
          <Field label="E-mail"><input type="email" required value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} placeholder="meno@firma.sk" autoComplete="off" /></Field>
          <Field label="Telefón"><input type="tel" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} autoComplete="off" /></Field>
          <button className="btn" disabled={pending || demo || !add.email.trim()}>Pridať člena</button>
        </form>
        <p className="up-hint">Ak už je v appke, zaradí sa do tímu hneď. Ak je nový, dostane e-mailom pozvánku s odkazom na vyplnenie údajov (telefón, adresa) a môžeš jej priraďovať byty ešte predtým, než ich vyplní.</p>
        {res && <p className="up-msg ok" role="status">{res.message}{res.link && <> <br /><b className="up-linkurl">{res.link}</b></>}</p>}
        <Msg msg={msg} />
      </section>
    </div>
  )
}

function Application({ a, demo }) {
  const { pending, msg, run } = useRun()
  return (
    <div className="up-app">
      <div><b>{a.name}</b><small>{a.phone} · {a.email}</small><small>📍 {a.address}{a.city ? ', ' + a.city : ''}</small>{a.note && <small>💬 {a.note}</small>}</div>
      <div className="up-row">
        <button className="btn" disabled={pending || demo} onClick={() => run(() => decideApplicationAction(a.id, true), { ok: 'Schválené. Do appky sa prihlási e-mailom (odkaz do schránky), heslo nepotrebuje.' })}>Schváliť</button>
        <button className="btn o" disabled={pending || demo} onClick={() => run(() => decideApplicationAction(a.id, false), { ok: 'Zamietnuté.' })}>Zamietnuť</button>
      </div>
      <Msg msg={msg} />
    </div>
  )
}

function Person({ s, flats, demo }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(() => ({
    phone: s.phone || '', address: s.address || '', city: s.city || '', lat: s.lat ?? '', lng: s.lng ?? '',
    max_per_day: s.max_per_day, max_per_week: s.max_per_week, max_distance_km: s.max_distance_km,
    work_days: s.work_days || [1, 2, 3, 4, 5, 6, 7], days_off: (s.days_off || []).join('\n'), preferred_localities: (s.preferred_localities || []).join(', '),
    excluded_listings: s.excluded_listings || [], instructions: s.instructions || '', note: s.note || '',
    pay_type: s.pay_type || 'per_task', hourly_rate: centsToInput(s.hourly_rate_cents || null), task_rate: centsToInput(s.task_rate_cents || null), active: s.active,
  }))
  const { pending, msg, run } = useRun()
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const toggleDay = (d) => set('work_days', f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d])
  const toggleFlat = (id) => set('excluded_listings', f.excluded_listings.includes(id) ? f.excluded_listings.filter((x) => x !== id) : [...f.excluded_listings, id])
  const save = () => run(() => saveStaffAction({ email: s.email, ...f, lat: f.lat === '' ? '' : Number(f.lat), lng: f.lng === '' ? '' : Number(f.lng), geo_source: f.lat !== '' && Number(f.lat) !== s.lat ? 'manual' : s.geo_source }), { ok: 'Uložené.' })
  const find = () => run(() => geocodeStaffAction(s.email, f.address, f.city), { ok: 'Adresa nájdená na mape a uložená.', then: (r) => { set('lat', r.lat); set('lng', r.lng) } })
  const payText = s.pay_type === 'hourly' ? `${fmtEur(s.hourly_rate_cents)} / hodina` : s.task_rate_cents ? `${fmtEur(s.task_rate_cents)} / upratovanie` : 'sadzba nie je nastavená'
  const flatList = Object.values(flats).sort((a, b) => String(a.listing_name).localeCompare(String(b.listing_name), 'sk'))
  return (
    <div className={'up-person' + (s.active ? '' : ' inactive')}>
      <button type="button" className="up-person-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{s.name}</b>
        <Pill tone={s.role === 'manager' ? 'info' : ''}>{s.role === 'manager' ? 'manažérka' : 'upratovačka'}</Pill>
        {!s.active && <Pill tone="prob">vypnutá</Pill>}
        {s.pending && <Pill tone="info">čaká na vyplnenie údajov</Pill>}
        {s.role === 'cleaner' && <small>max {s.max_per_day} bytov za deň{s.max_per_week > 0 ? `, ${s.max_per_week} za týždeň` : ''}{s.max_distance_km > 0 ? `, do ${s.max_distance_km} km` : ''} · pracuje {(s.work_days || []).length === 7 ? 'každý deň' : (s.work_days || []).map((d) => WEEKDAYS_SHORT[d - 1]).join(', ') || '—'} · {payText}{s.lat == null ? ' · bez adresy na mape' : ''}</small>}
      </button>
      {open && (
        <div className="up-form">
          <Field label="Telefón"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Adresa bydliska" wide><input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="ulica a číslo" /></Field>
          <Field label="Mesto / mestská časť"><input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <div className="up-geo">
            <button type="button" className="btn o" disabled={pending || demo || f.address.trim().length < 4} onClick={find}>Nájsť na mape</button>
            <span>{f.lat !== '' && f.lng !== '' ? `Súradnice: ${Number(f.lat).toFixed(4)}, ${Number(f.lng).toFixed(4)}${s.geo_source ? ` (${s.geo_source === 'geocoded' ? 'z mapy' : 'ručne'})` : ''}` : 'Bez súradníc appka nevie počítať vzdialenosť.'}</span>
            <small>Adresa sa pošle do mapovej služby OpenStreetMap, aby sa našli súradnice. Súradnice môžeš zadať aj ručne:</small>
            <div className="up-two"><input aria-label="Zemepisná šírka" inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="šírka 48.1" /><input aria-label="Zemepisná dĺžka" inputMode="decimal" value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="dĺžka 17.1" /></div>
          </div>
          {s.role === 'cleaner' && (<>
            <h3>Koľko jej appka priradí</h3>
            <Field label="Bytov za deň (max)" hint="Jedna zvládne dva, iná štyri."><input type="number" min="1" max="12" value={f.max_per_day} onChange={(e) => set('max_per_day', e.target.value)} /></Field>
            <Field label="Bytov za týždeň (max)" hint="0 = bez limitu"><input type="number" min="0" max="60" value={f.max_per_week} onChange={(e) => set('max_per_week', e.target.value)} /></Field>
            <Field label="Najďalej od bydliska (km)" hint="0 = bez limitu; vzdušnou čiarou"><input type="number" min="0" max="200" value={f.max_distance_km} onChange={(e) => set('max_distance_km', e.target.value)} /></Field>
            <Field label="Uprednostnené lokality" hint="oddeľ čiarkou, napr. Petržalka, Ružinov" wide><input value={f.preferred_localities} onChange={(e) => set('preferred_localities', e.target.value)} /></Field>
            <div className="up-f wide"><span>Pracovné dni</span><div className="up-days">{WEEKDAYS_SHORT.map((d, i) => <button type="button" key={d} aria-pressed={f.work_days.includes(i + 1)} className={f.work_days.includes(i + 1) ? 'on' : ''} onClick={() => toggleDay(i + 1)}>{d}</button>)}</div></div>
            <Field label="Voľné dni (dovolenka, lekár)" hint="každý dátum na nový riadok, RRRR-MM-DD" wide><textarea rows="2" value={f.days_off} onChange={(e) => set('days_off', e.target.value)} /></Field>
            <details className="up-f wide"><summary>Byty, ktoré jej appka automaticky nepriradí ({f.excluded_listings.length})</summary>
              <div className="up-checks">{flatList.map((fl) => <label key={fl.listing_id}><input type="checkbox" checked={f.excluded_listings.includes(fl.listing_id)} onChange={() => toggleFlat(fl.listing_id)} /> {fl.listing_name}</label>)}</div>
            </details>
            <Field label="Inštrukcie pre ňu" hint="Vidí ich vo svojej appke." wide><textarea rows="3" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="napr. len doobeda, nezvláda byty bez výťahu, vždy odfotiť kúpeľňu" /></Field>
            <h3>Cena práce</h3>
            <div className="up-f wide"><span>Ako sa platí</span>
              <div className="up-seg">
                <button type="button" className={f.pay_type === 'per_task' ? 'on' : ''} aria-pressed={f.pay_type === 'per_task'} onClick={() => set('pay_type', 'per_task')}>Za upratovanie</button>
                <button type="button" className={f.pay_type === 'hourly' ? 'on' : ''} aria-pressed={f.pay_type === 'hourly'} onClick={() => set('pay_type', 'hourly')}>Za hodinu</button>
              </div>
            </div>
            <Field label="Cena za jedno upratovanie (€)" hint="Cena bytu v správe bytov má prednosť."><input inputMode="decimal" value={f.task_rate} onChange={(e) => set('task_rate', e.target.value)} placeholder="napr. 30" /></Field>
            <Field label="Cena za hodinu (€)" hint="Hodiny sa počítajú od „som v byte“ po „hotovo“."><input inputMode="decimal" value={f.hourly_rate} onChange={(e) => set('hourly_rate', e.target.value)} placeholder="napr. 8,50" /></Field>
          </>)}
          <Field label="Interná poznámka" wide><textarea rows="2" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
          <label className="up-check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Aktívna (neaktívnej appka nič nepriraďuje)</label>
          <div className="up-row">
            <button className="btn" disabled={pending || demo} onClick={save}>Uložiť</button>
            {s.pending && <ResendButton s={s} demo={demo} />}
          </div>
          <Msg msg={msg} />
        </div>
      )}
    </div>
  )
}

function ResendButton({ s, demo }) {
  const { pending, msg, run } = useRun()
  const [link, setLink] = useState('')
  return (
    <span className="up-access">
      <button type="button" className="btn o" disabled={pending || demo} onClick={() => run(() => inviteMemberAction({ email: s.email, name: s.name, phone: '' }), { then: (r) => setLink(r.link || ''), ok: 'Pozvánka odoslaná znova.' })}>Poslať pozvánku znova</button>
      {link && <small className="up-linkurl">{link}</small>}
      <Msg msg={msg} />
    </span>
  )
}
