'use client'
import { useEffect, useMemo, useState } from 'react'
import { startTaskAction, toggleItemAction, addPhotoAction, removePhotoAction, reportProblemAction, finishTaskAction, saveMyProfileAction, geocodeMyAddressAction, alertAction } from '@/app/uprat/actions'
import { browserClient } from '@/lib/browser'
import { dayLabelLong, addDays, weekDays, taskView, STATUS_LABEL, PHOTO_KIND_LABEL, progress, WEEKDAYS_SHORT, payrollSummary, fmtEur } from '@/lib/cl-core'
import { useRun, Msg, Field, Pill, WorkDaysPicker } from './ui'
import Board from './Board'
import { orderStops, routeStats, travelMinutes, fmtDuration, googleRouteUrl, daySupplies, dayWorkMinutes } from '@/lib/cl-route'
import { ALERT_LABEL, ALERT_ICON } from '@/lib/cl-notify'

const TABS = [['today', 'Dnes'], ['week', 'Týždeň'], ['schedule', 'Môj rozvrh'], ['board', 'Nástenka'], ['me', 'Ja']]

export default function Cleaner({ me, tasks, flats, entry = {}, contacts = [], pushKey = '', items, photos, posts, settings, today, open, demo }) {
  const [tab, setTab] = useState('today')
  const [openId, setOpenId] = useState(open)
  const task = openId ? tasks.find((t) => t.id === openId) : null
  const pick = (id) => { setOpenId(id); try { history.replaceState(null, '', id ? `?u=${id}` : '?') } catch {} ; if (typeof window !== 'undefined') window.scrollTo({ top: 0 }) }
  if (task) return <TaskScreen key={task.id} task={task} flat={flats[task.listing_id] || {}} entry={entry[task.listing_id] || null} contacts={contacts} items={items.filter((i) => i.task_id === task.id)} photos={photos.filter((p) => p.task_id === task.id)} rules={settings.rules || {}} demo={demo} onBack={() => pick(null)} />
  return (
    <div className="up-wrap">
      <OfflineBanner />
      <header className="up-head"><div><h1>Ahoj, {String(me.name || '').split(' ')[0]}</h1><p>Tvoj plán upratovania. Byty a hostia sú z Práčovne.</p></div><Contacts contacts={contacts} /></header>
      <NewAssigned tasks={tasks} today={today} onOpen={() => setTab('today')} />
      {me.instructions ? <section className="up-panel"><h2>Inštrukcie od manažérky</h2><p className="up-text">{me.instructions}</p></section> : null}
      <nav className="up-tabs" aria-label="Sekcie">{TABS.map(([k, l]) => <button key={k} type="button" className={'up-tabbtn' + (tab === k ? ' on' : '')} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === 'today' && <DayList me={me} tasks={tasks.filter((t) => t.date <= addDays(today, 1) && !(t.status === 'done' && t.date < today))} flats={flats} today={today} onOpen={pick} empty="Dnes ani zajtra nemáš nič priradené." />}
      {tab === 'week' && <Week tasks={tasks} flats={flats} today={today} onOpen={pick} />}
      {tab === 'schedule' && <Schedule me={me} today={today} demo={demo} />}
      {tab === 'board' && <Board posts={posts} isManager={false} demo={demo} />}
      {tab === 'me' && <Profile me={me} tasks={tasks} flats={flats} demo={demo} pushKey={pushKey} />}
    </div>
  )
}

function Card({ t, flat, today, onOpen, n = null }) {
  const v = taskView(t)
  const late = t.date < today && t.status !== 'done'
  return (
    <button type="button" className={'up-card s-' + t.status + (late ? ' late' : '')} onClick={() => onOpen(t.id)}>
      <span className="up-card-top"><b>{n ? <span className="up-n">{n}</span> : null}{t.listing_name}</b><span>{t.alert_kind && <Pill tone="prob">{ALERT_ICON[t.alert_kind]} nahlásené</Pill>} <Pill tone={t.status}>{STATUS_LABEL[t.status]}</Pill></span></span>
      <span className="up-card-meta">{v.people != null ? `👥 ${v.people} hostí` : ''}{v.capsuleCount ? ` · ☕ ${v.capsuleCount} kapsúl` : ''}{flat.est_minutes ? ` · ~${flat.est_minutes} min` : ''}</span>
      {flat.address && <span className="up-card-meta">📍 {flat.address}{flat.city ? ', ' + flat.city : ''}</span>}
      {late && <span className="up-card-meta warn">Z minulého dňa, nie je dokončené</span>}
    </button>
  )
}

function DayList({ me, tasks, flats, today, onOpen, empty }) {
  const days = [...new Set(tasks.map((t) => t.date))].sort()
  if (!days.length) return <section className="up-panel"><p className="up-hint">{empty}</p></section>
  return <>{days.map((d) => {
    const list = tasks.filter((t) => t.date === d)
    const stop = (t) => ({ ...(flats[t.listing_id] || {}), id: t.id, name: t.listing_name })
    const order = orderStops(me, list.map(stop))
    const sorted = order.map((o) => list.find((t) => t.id === o.id))
    return (
      <section key={d} className="up-panel"><h2>{dayLabelLong(d, today)}</h2>
        <DaySummary me={me} tasks={list} flats={flats} order={order} />
        <div className="up-cards">{sorted.map((t, i) => <Card key={t.id} t={t} flat={flats[t.listing_id] || {}} today={today} onOpen={onOpen} n={list.length > 1 ? i + 1 : null} />)}</div>
      </section>
    )
  })}</>
}

/** Prehľad dňa: koľko bytov, odhad práce a cesty, odkaz na trasu v mape a čo si zobrať (kapsule, bielizeň). */
function DaySummary({ me, tasks, flats, order }) {
  const sup = daySupplies(tasks)
  const work = dayWorkMinutes(tasks, flats)
  const st = routeStats(me, order, { back: true })
  const url = googleRouteUrl(me, order)
  const [open, setOpen] = useState(false)
  return (
    <div className="up-day">
      <p className="up-meta"><b>{tasks.length === 1 ? '1 byt' : `${tasks.length} ${tasks.length < 5 ? 'byty' : 'bytov'}`}</b> · práca ~{fmtDuration(work)}{tasks.length > 1 && st.km > 0 ? ` · cesta ~${String(st.km).replace('.', ',')} km (asi ${fmtDuration(travelMinutes(st.km))})` : ''}</p>
      <div className="up-row">
        {url && tasks.length > 0 && <a className="btn o" href={url} target="_blank" rel="noopener noreferrer">🧭 {tasks.length > 1 ? 'Trasa dňa v mape' : 'Navigovať'}</a>}
        {(sup.capsules.length > 0 || sup.linen.length > 0) && <button type="button" className="btn o" aria-expanded={open} onClick={() => setOpen(!open)}>🎒 Čo si zobrať</button>}
      </div>
      {open && (
        <div className="up-bring">
          {sup.capsules.length > 0 && <div><b>Kapsule do kávovaru</b><ul>{sup.capsules.map((c) => <li key={c.label}>{c.label}: <b>{c.n}</b></li>)}</ul></div>}
          {sup.linen.length > 0 && <div><b>Bielizeň podľa kariet z Práčovne</b><ul>{sup.linen.map((c) => <li key={c.label}>{c.label}: <b>{c.n}</b></li>)}</ul></div>}
          <small>Súčet za všetky byty dňa. Pri každom byte je zoznam zvlášť.</small>
        </div>
      )}
    </div>
  )
}

/** Telefón na manažérov: zavolať jedným ťuknutím. */
function Contacts({ contacts }) {
  const withPhone = contacts.filter((c) => c.phone)
  if (!withPhone.length) return null
  return <div className="up-contacts">{withPhone.slice(0, 3).map((c) => <a key={c.name} className="btn o" href={`tel:${String(c.phone).replace(/[^\d+]/g, '')}`}>📞 {String(c.name).split(' ')[0]}</a>)}</div>
}

/** Pásik „máš nové upratovania“: nové od posledného odkliknutia na tomto zariadení. */
function NewAssigned({ tasks, today, onOpen }) {
  const [seen, setSeen] = useState(null)
  useEffect(() => { try { setSeen(localStorage.getItem('up_seen') || '') } catch { setSeen('') } }, [])
  if (seen === null) return null
  const fresh = tasks.filter((t) => t.assigned_at && t.status === 'todo' && t.date >= today && (!seen || t.assigned_at > seen))
  if (!fresh.length) return null
  const ok = () => { try { localStorage.setItem('up_seen', new Date().toISOString()) } catch {} ; setSeen(new Date().toISOString()) }
  return <div className="up-banner new" role="status"><b>🆕 {fresh.length === 1 ? 'Máš 1 nové upratovanie' : `Máš ${fresh.length} nových upratovaní`}</b> <span>{fresh.slice(0, 3).map((t) => t.listing_name).join(', ')}{fresh.length > 3 ? '…' : ''}</span> <button type="button" className="btn o" onClick={() => { ok(); onOpen() }}>Rozumiem</button></div>
}

/** Upozornenie, keď zariadenie stratí pripojenie: zmeny sa neuložia, kým sa nevráti signál. */
function OfflineBanner() {
  const [off, setOff] = useState(false)
  useEffect(() => {
    const u = () => setOff(!navigator.onLine)
    u(); window.addEventListener('online', u); window.addEventListener('offline', u)
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u) }
  }, [])
  return off ? <p className="up-banner off" role="alert">Nemáš pripojenie na internet. Fajky a fotky sa neuložia, kým sa nevráti signál.</p> : null
}

function Week({ tasks, flats, today, onOpen }) {
  const days = useMemo(() => weekDays(today).concat(weekDays(addDays(today, 7))), [today])
  const by = (d) => tasks.filter((t) => t.date === d)
  return <>{days.map((d) => { const l = by(d); return <section key={d} className="up-panel"><h2>{dayLabelLong(d, today)} <small className="up-hint">{l.length ? `${l.length} ${l.length === 1 ? 'byt' : l.length < 5 ? 'byty' : 'bytov'}` : 'voľno'}</small></h2>{l.length > 0 && <div className="up-cards">{l.map((t) => <Card key={t.id} t={t} flat={flats[t.listing_id] || {}} today={today} onOpen={onOpen} />)}</div>}</section> })}</>
}

/** Fotka sa pred nahraním zmenší (max 1600 px, JPEG), aby sa nahrala aj na slabom signáli. */
async function resizeImage(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', quality))
}

function PhotoSection({ task, kind, photos, canAdd, demo }) {
  const { pending, msg, run } = useRun()
  const mine = photos.filter((p) => p.kind === kind)
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    run(async () => {
      let blob
      try { blob = await resizeImage(file) } catch { return { ok: false, error: 'Fotku sa nepodarilo načítať.' } }
      const path = `${task.id}/${crypto.randomUUID()}.jpg`
      const up = await browserClient().storage.from('cleaning-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (up.error) return { ok: false, error: 'Fotku sa nepodarilo nahrať. Skontroluj pripojenie a skús znova.' }
      return addPhotoAction(task.id, kind, path, '')
    })
  }
  return (
    <div className="up-photosec">
      <div className="up-row"><b>{PHOTO_KIND_LABEL[kind]} ({mine.length})</b>
        {canAdd && <label className={'btn o' + (demo ? ' dis' : '')}>📷 Pridať fotku<input type="file" accept="image/*" capture="environment" hidden disabled={pending || demo} onChange={onFile} /></label>}
        {pending && <small>Nahrávam…</small>}</div>
      {mine.length > 0 && <div className="up-photos">{mine.map((p) => <figure key={p.id}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={PHOTO_KIND_LABEL[p.kind]} loading="lazy" /></a> : <div className="up-noimg">bez náhľadu</div>}{canAdd && <button className="up-link" disabled={demo} onClick={() => run(() => removePhotoAction(p.id))}>odstrániť</button>}</figure>)}</div>}
      <Msg msg={msg} />
    </div>
  )
}

function TaskScreen({ task, flat, entry, contacts = [], items, photos, rules, demo, onBack }) {
  const v = taskView(task)
  const { pending, msg, run } = useRun()
  const [note, setNote] = useState(task.cleaner_note || '')
  const [problem, setProblem] = useState('')
  const [local, setLocal] = useState({})
  const started = task.status === 'in_progress' || task.status === 'done'
  const active = task.status === 'in_progress'
  const list = items.map((i) => (i.id in local ? { ...i, done: local[i.id] } : i))
  const pr = progress(list)
  const need = Number(rules.min_after_photos) || 0
  const toggle = (i) => { const next = !i.done; setLocal((l) => ({ ...l, [i.id]: next })); run(async () => { const r = await toggleItemAction(i.id, next); if (!r.ok) setLocal((l) => ({ ...l, [i.id]: i.done })); return r }) }
  const addr = flat.address ? flat.address + (flat.city ? ', ' + flat.city : '') : ''
  const hasGeo = flat.lat != null && flat.lng != null
  const q = hasGeo ? `${flat.lat},${flat.lng}` : encodeURIComponent(addr)
  const gmaps = addr || hasGeo ? `https://www.google.com/maps/search/?api=1&query=${q}` : null
  const amaps = addr || hasGeo ? (hasGeo ? `https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(flat.listing_name || 'Byt')}` : `https://maps.apple.com/?q=${q}`) : null
  return (
    <div className="up-wrap">
      <div className="up-row"><button className="btn o" onClick={onBack}>← Späť</button><Pill tone={task.status}>{STATUS_LABEL[task.status]}</Pill></div>
      <section className="up-panel">
        <h1>{task.listing_name}</h1>
        <p className="up-meta">{dayLabelLong(task.date)}{flat.address ? ` · 📍 ${flat.address}${flat.city ? ', ' + flat.city : ''}` : ''}</p>
        {gmaps && <div className="up-row"><a className="btn o" href={gmaps} target="_blank" rel="noopener noreferrer">🗺 Google Mapy</a><a className="btn o" href={amaps} target="_blank" rel="noopener noreferrer">🗺 Apple Mapy</a></div>}
        {!gmaps && <p className="up-hint">Byt nemá v systéme adresu, opýtaj sa manažéra.</p>}
        <div className="up-tags">{v.people != null && <Pill>👥 {v.people} hostí</Pill>}{v.capsules.map((c, i) => <Pill key={i}>☕ {c.type} × {c.n}</Pill>)}{flat.est_minutes ? <Pill>~{flat.est_minutes} min</Pill> : null}</div>
        {v.note && <p className="up-meta">📝 Z Práčovne: {v.note}</p>}
      </section>
      <section className="up-panel up-access">
        <h2>Ako sa dostať do bytu</h2>
        {entry && entry.arrival ? <p className="up-text">{entry.arrival}</p> : <p className="up-text">Vstup je rovnaký ako pre hosťa (Sprievodca bytom). Ak ho tu nevidíš, opýtaj sa manažérky.</p>}
        {entry && entry.note && <p className="up-text">{entry.note}</p>}
        {entry && entry.parking && <><h3 className="up-sub">Parkovanie</h3><p className="up-text">{entry.parking}</p></>}
        {flat.access_note && <><h3 className="up-sub">Doplnok pre upratovačky</h3><p className="up-text">{flat.access_note}</p></>}
      </section>

      {(v.linen.length > 0 || v.capsules.length > 0) && (
        <section className="up-panel"><h2>Bielizeň a výbava</h2>
          {v.linen.length > 0 && <ul className="up-items">{v.linen.map((l, i) => <li key={i}>{l.label}: <b>{l.n}</b></li>)}</ul>}
          {v.capsules.length > 0 && <p className="up-meta">☕ Kapsule: {v.capsules.map((c) => `${c.type} × ${c.n}`).join(', ')}</p>}
        </section>
      )}

      {task.status !== 'done' && task.status !== 'cancelled' && <AlertBox task={task} contacts={contacts} demo={demo} />}

      {task.status === 'todo' && (
        <section className="up-panel"><button className="btn up-big" disabled={pending || demo} onClick={() => run(() => startTaskAction(task.id))}>{pending ? 'Chvíľu…' : '📍 Som v byte, začínam'}</button><Msg msg={msg} /></section>
      )}

      {started && (<>
        <section className="up-panel">
          <h2>Checklist ({pr.done} z {pr.n})</h2>
          <div className="up-bar" aria-hidden="true"><i style={{ width: pr.pct + '%' }} /></div>
          <ul className="up-check-list">{list.map((i) => <li key={i.id}><label className={'up-tick' + (i.done ? ' done' : '')}><input type="checkbox" checked={i.done} disabled={!active || demo} onChange={() => toggle(i)} /><span>{i.label}</span></label></li>)}</ul>
        </section>
        <section className="up-panel"><h2>Fotky</h2>
          <PhotoSection task={task} kind="before" photos={photos} canAdd={active} demo={demo} />
          <PhotoSection task={task} kind="after" photos={photos} canAdd={active || task.status === 'done'} demo={demo} />
          <PhotoSection task={task} kind="issue" photos={photos} canAdd={active || task.status === 'done'} demo={demo} />
          {need > 0 && active && <p className="up-hint">Pred dokončením pridaj aspoň {need} {need === 1 ? 'fotku' : 'fotky'} „Po“.</p>}
        </section>
        <section className="up-panel">
          <h2>Poznámka</h2>
          <textarea rows="3" maxLength="500" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Čo si našla, čo chýba, čo treba vedieť…" aria-label="Poznámka" disabled={!active || demo} />
          {active && (
            <div className="up-row"><input aria-label="Nahlásiť problém" maxLength="500" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Nahlásiť problém (škoda, porucha, chýba tovar)…" />
              <button className="btn o" disabled={pending || demo || problem.trim().length < 2} onClick={() => run(() => reportProblemAction(task.id, problem), { ok: 'Problém je nahlásený manažérke.', then: () => setProblem('') })}>Nahlásiť</button></div>
          )}
          {task.problem_text && <p className="up-alert">Nahlásené: {task.problem_text}</p>}
          <Msg msg={msg} />
        </section>
        {active && <section className="up-panel"><button className="btn up-big" disabled={pending || demo} onClick={() => run(() => finishTaskAction(task.id, note), { ok: 'Hotovo. Práčovňa vidí, že je upratané.' })}>{pending ? 'Chvíľu…' : '✅ Hotovo, odchádzam'}</button><p className="up-hint">Ak nemáš odfajknuté všetko, napíš do poznámky prečo.</p></section>}
        {task.status === 'done' && <section className="up-panel"><h2>Hotovo ✅</h2><p className="up-hint">Upratovanie je dokončené a Práčovňa to vidí. Ak treba niečo doplniť, pridaj fotku alebo napíš manažérke na nástenku.</p></section>}
      </>)}
    </div>
  )
}

function Profile({ me, tasks, flats, demo, pushKey }) {
  const [f, setF] = useState({ phone: me.phone || '', address: me.address || '', city: me.city || '' })
  const { pending, msg, run } = useRun()
  const sum = payrollSummary(tasks, [me], flats).list[0]
  const rate = me.pay_type === 'hourly' ? (me.hourly_rate_cents ? `${fmtEur(me.hourly_rate_cents)} za hodinu` : null) : (me.task_rate_cents ? `${fmtEur(me.task_rate_cents)} za upratovanie` : null)
  return (
    <div className="up-wrap">
      <PushCard pushKey={pushKey} />
      <section className="up-panel">
        <h2>Moje údaje</h2>
        <p className="up-hint">Vypĺňaš len osobné údaje. Podľa adresy ti appka priraďuje byty v blízkosti. Adresu vidí manažérka upratovania.</p>
        <div className="up-form">
          <Field label="Telefón"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Adresa bydliska" wide><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Mesto / mestská časť"><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <div className="up-geo"><span>{me.lat != null ? '📍 Adresa je nájdená na mape.' : 'Adresa ešte nie je nájdená na mape, appka nevie počítať vzdialenosť.'}</span>
            <button type="button" className="btn o" disabled={pending || demo || f.address.trim().length < 4} onClick={() => run(() => geocodeMyAddressAction(f.address, f.city), { ok: 'Adresa nájdená na mape a uložená.' })}>Nájsť adresu na mape</button>
            <small>Adresa sa pošle do mapovej služby OpenStreetMap len na nájdenie súradníc.</small></div>
          <div className="up-row"><button className="btn" disabled={pending || demo} onClick={() => run(() => saveMyProfileAction(f), { ok: 'Uložené.' })}>Uložiť</button></div>
          <Msg msg={msg} />
        </div>
      </section>
      <section className="up-panel">
        <h2>Moje nastavenie od manažérky</h2>
        <p className="up-meta">Bytov za deň najviac: <b>{me.max_per_day}</b>{me.max_per_week > 0 ? <> · za týždeň: <b>{me.max_per_week}</b></> : null}{me.max_distance_km > 0 ? <> · najďalej: <b>{me.max_distance_km} km</b></> : null}</p>
        {rate && <p className="up-meta">Sadzba: <b>{rate}</b></p>}
        {sum && <p className="up-meta">Za posledné dva týždne hotové: <b>{sum.done}</b> {sum.done === 1 ? 'upratovanie' : 'upratovaní'} · {fmtEur(sum.doneCents)} <small>(orientačne, nie výplatná páska)</small></p>}
        <p className="up-hint">Limity a ceny nastavuje manažér, ty ich nemeníš. Pracovné a voľné dni si nastavíš v záložke „Môj rozvrh“.</p>
      </section>
    </div>
  )
}

/** Môj rozvrh: v ktoré dni upratovačka pracuje a jednotlivé voľné dni (dovolenka, lekár). Plánovač jej v iné dni byty nepriradí. */
function Schedule({ me, today, demo }) {
  const [days, setDays] = useState(me.work_days && me.work_days.length ? me.work_days : [1, 2, 3, 4, 5])
  const [off, setOff] = useState((me.days_off || []).filter((d) => d >= today).sort())
  const [add, setAdd] = useState('')
  const { pending, msg, run } = useRun()
  const addOff = () => { if (add && add >= today && !off.includes(add)) setOff([...off, add].sort()); setAdd('') }
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Môj rozvrh</h2>
        <p className="up-hint">Zaškrtni dni, kedy môžeš pracovať, a pridaj dni, kedy mať voľno (dovolenka, lekár). Appka ti v iné dni byty nepriradí. Zmenu manažér uvidí hneď.</p>
        <div className="up-form">
          <WorkDaysPicker value={days} onChange={setDays} label="Pracovné dni v týždni" />
          <div className="up-f wide"><span>Voľné dni</span>
            {off.length ? <ul className="up-items">{off.map((d) => <li key={d}>{d.split('-').reverse().map((x, i) => (i < 2 ? Number(x) : x)).join('. ')} <button type="button" className="up-link" onClick={() => setOff(off.filter((x) => x !== d))}>odstrániť</button></li>)}</ul> : <small>Žiadne naplánované voľno.</small>}
            <div className="up-row"><input type="date" min={today} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Pridať voľný deň" /><button type="button" className="btn o" disabled={!add} onClick={addOff}>Pridať voľno</button></div>
          </div>
          <div className="up-row"><button className="btn" disabled={pending || demo || days.length === 0} onClick={() => run(() => saveMyProfileAction({ work_days: days, days_off: off }), { ok: 'Rozvrh je uložený.' })}>Uložiť rozvrh</button></div>
          <Msg msg={msg} />
        </div>
      </section>
    </div>
  )
}

/** Niečo nejde? Jedným ťuknutím dá upratovačka vedieť manažérovi (push alebo e-mail): meškám, potrebujem pomoc, chýba tovar, nemôžem prísť. */
function AlertBox({ task, contacts, demo }) {
  const [kind, setKind] = useState(null)
  const [text, setText] = useState('')
  const { pending, msg, run } = useRun()
  const phone = (contacts.find((c) => c.phone) || {}).phone
  return (
    <section className="up-panel">
      <h2>Niečo nejde?</h2>
      {task.alert_kind && <p className="up-alert">{ALERT_ICON[task.alert_kind]} Manažér už vie: {ALERT_LABEL[task.alert_kind]}{task.alert_text ? ` (${task.alert_text})` : ''}</p>}
      <div className="up-seg" role="group" aria-label="Druh upozornenia">{Object.entries(ALERT_LABEL).map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{ALERT_ICON[k]} {l}</button>)}</div>
      {kind && (
        <div className="up-row">
          <input aria-label="Poznámka k upozorneniu" maxLength="300" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'late' ? 'Koľko minút meškáš?' : kind === 'supplies' ? 'Čo chýba?' : 'Stručne čo sa deje (nepovinné)'} />
          <button className="btn" disabled={pending || demo} onClick={() => run(() => alertAction(task.id, kind, text), { ok: 'Manažér dostal upozornenie.', then: () => { setKind(null); setText('') } })}>Poslať manažérovi</button>
        </div>
      )}
      {phone && <a className="btn o" href={`tel:${String(phone).replace(/[^\d+]/g, '')}`}>📞 Zavolať manažérovi</a>}
      <Msg msg={msg} />
    </section>
  )
}

const urlB64ToU8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(b); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) }

/** Upozornenia na telefón: zapnutie push na tomto zariadení (nové upratovania, večerná pripomienka). Bez zapnutia príde e-mail. */
function PushCard({ pushKey }) {
  const [st, setSt] = useState('unknown')
  useEffect(() => {
    if (!pushKey || !('serviceWorker' in navigator) || !('PushManager' in window)) { setSt('unsupported'); return }
    navigator.serviceWorker.register('/sw.js').then(async (reg) => { const s = await reg.pushManager.getSubscription(); setSt(s ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off') }).catch(() => setSt('unsupported'))
  }, [pushKey])
  const enable = async () => {
    try {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') { setSt('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(pushKey) })
      const j = sub.toJSON()
      const r = await fetch('/api/push/subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) })
      setSt(r.ok ? 'on' : 'off')
    } catch { setSt('off') }
  }
  return (
    <section className="up-panel">
      <h2>Upozornenia</h2>
      {st === 'on' && <p className="up-meta">🔔 Zapnuté na tomto zariadení: dostaneš upozornenie na nové upratovania a večer pripomienku na zajtra.</p>}
      {st === 'off' && <><p className="up-hint">Zapni si upozornenia, aby ti nič neušlo: nové upratovania a večerná pripomienka na zajtra.</p><button type="button" className="btn" onClick={enable}>🔔 Zapnúť upozornenia</button></>}
      {st === 'denied' && <p className="up-hint">Upozornenia sú v tomto zariadení zakázané. Povoľ ich v nastaveniach prehliadača alebo telefónu.</p>}
      {(st === 'unsupported' || st === 'unknown') && <p className="up-hint">Na tomto zariadení upozornenia v appke nejdú, nové upratovania a pripomienky ti prídu e-mailom. Na iPhone najprv pridaj appku na plochu (Zdieľať → Pridať na plochu).</p>}
    </section>
  )
}
