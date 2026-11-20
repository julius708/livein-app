'use client'
import { useMemo, useState } from 'react'
import { taskDetailAction, addReviewAction, removeReviewAction } from '@/app/upratovanie/actions'
import { PHOTO_KIND_LABEL, STATUS_LABEL } from '@/lib/cl-core'
import { useRun, Msg, Field, Pill } from './ui'

const SRC = { airbnb: 'Airbnb', booking: 'Booking', google: 'Google', direct: 'Priamo', other: 'Iné' }
const dmy = (s) => (s ? String(s).slice(0, 10).split('-').reverse().map((x, i) => (i < 2 ? String(Number(x)) : x)).join('. ') : '')
const stars = (r) => '★'.repeat(Math.round(Number(r))) + '☆'.repeat(5 - Math.round(Number(r)))
const mins = (c) => (c && c.started_at && c.finished_at ? Math.max(0, Math.round((new Date(c.finished_at) - new Date(c.started_at)) / 60000)) : null)
export const isBad = (v) => (v.reviews || []).some((r) => Number(r.rating) <= 3 || (r.cleanliness != null && Number(r.cleanliness) <= 3)) || !!(v.cleaning && v.cleaning.problem)

/** Kvalita po každom hosťovi: príchod hosťa, upratovanie pred ním (kto, kedy, checklist, fotky, problémy) a recenzia. */
export default function QualityTab({ quality, flats, from, to, demo }) {
  const [q, setQ] = useState('')
  const [bad, setBad] = useState(false)
  const visits = useMemo(() => (quality.visits || []).filter((v) => (!q || `${v.flat} ${v.cleaning ? v.cleaning.cleaner : ''}`.toLowerCase().includes(q.toLowerCase())) && (!bad || isBad(v))), [quality, q, bad])
  const withRev = (quality.visits || []).flatMap((v) => v.reviews || [])
  const lowRev = withRev.filter((r) => Number(r.rating) <= 3).length
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Kvalita upratovania po hosťoch</h2>
        <p className="up-hint">Ku každému príchodu hosťa vidíš upratovanie pred ním: kto upratoval, kedy, odkliknutý checklist, fotky, problémy a recenziu hosťa. Pri zlej recenzii hneď vidíš, kto v ten deň v byte upratoval a čo je zaznamenané. Upratovanie sa páruje len od spustenia appky; staršie príchody ostanú bez upratovania.</p>
        <form method="get" className="up-row" aria-label="Obdobie">
          <input type="hidden" name="tab" value="quality" />
          <label className="up-f inline"><span>Príchody od</span><input type="date" name="from" defaultValue={from} required /></label>
          <label className="up-f inline"><span>do</span><input type="date" name="to" defaultValue={to} required /></label>
          <button className="btn o">Zobraziť</button>
        </form>
        <div className="up-row">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt alebo upratovačku…" aria-label="Hľadať" />
          <label className="up-check"><input type="checkbox" checked={bad} onChange={(e) => setBad(e.target.checked)} /> Len zlé (recenzia do 3 hviezd alebo nahlásený problém)</label>
        </div>
        <p className="up-meta">Príchodov: <b>{(quality.visits || []).length}</b> · s upratovaním: <b>{(quality.visits || []).filter((v) => v.cleaning).length}</b> · recenzií: <b>{withRev.length}</b>{lowRev ? <> · zlých: <b className="up-badtxt">{lowRev}</b></> : null}</p>
      </section>
      <AddReview flats={flats} demo={demo} />
      {demo && <section className="up-panel"><p className="up-hint">V ukážkovom režime nie sú údaje o hosťoch.</p></section>}
      {visits.slice(0, 150).map((v) => <Visit key={v.reservation} v={v} demo={demo} />)}
      {visits.length > 150 && <p className="up-hint">Zobrazených prvých 150 z {visits.length}. Zúž obdobie alebo hľadanie.</p>}
      {(quality.orphans || []).length > 0 && (
        <section className="up-panel"><h2>Recenzie bez rezervácie v zozname ({quality.orphans.length})</h2>
          {quality.orphans.map((o) => <div key={o.id} className="up-app"><b>{o.flat} · príchod {dmy(o.check_in)}</b><small>{stars(o.rating)} {SRC[o.source]} {o.text && `· ${o.text}`}</small>
            <small>{o.cleaning ? `Upratovala: ${o.cleaning.cleaner || '—'} (${dmy(o.cleaning.date)}, checklist ${o.cleaning.items_done}/${o.cleaning.items_total})` : 'Upratovanie sa nenašlo.'}</small></div>)}
        </section>
      )}
    </div>
  )
}

function Visit({ v, demo }) {
  const [open, setOpen] = useState(false)
  const [det, setDet] = useState(null)
  const { pending, msg, run } = useRun()
  const c = v.cleaning
  const m = mins(c)
  const badV = isBad(v)
  const load = () => { setOpen(!open); if (!open && c && !det && !demo) run(() => taskDetailAction(c.task_id), { then: (r) => setDet(r) }) }
  return (
    <section className={'up-panel up-review' + (badV ? ' prob' : '')}>
      <button type="button" className="up-person-head" aria-expanded={open} onClick={load}>
        <b>{v.flat}</b><small>príchod {dmy(v.check_in)}{v.check_out ? ` – ${dmy(v.check_out)}` : ''}{v.guests ? ` · ${v.guests} hostí` : ''}{v.source ? ` · ${v.source}` : ''}</small>
        {c ? <Pill tone={c.status === 'done' ? 'done' : ''}>Upratovala: {c.cleaner || '—'} · {dmy(c.date)}</Pill> : <Pill>upratovanie sa nenašlo</Pill>}
        {(v.reviews || []).map((r) => <Pill key={r.id} tone={Number(r.rating) <= 3 ? 'prob' : 'info'}>{stars(r.rating)}</Pill>)}
        {c && c.problem && <Pill tone="prob">⚠ problém</Pill>}
      </button>
      {open && (
        <div className="up-detail">
          {(v.reviews || []).map((r) => <ReviewLine key={r.id} r={r} demo={demo} />)}
          {c ? (
            <>
              <p className="up-meta">Upratovanie {dmy(c.date)}: <b>{STATUS_LABEL[c.status]}</b>{m != null ? ` · ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : ''} · checklist {c.items_done}/{c.items_total} · fotky pred {c.photos_before}, po {c.photos_after}{c.photos_issue ? `, problém ${c.photos_issue}` : ''}</p>
              {c.problem && <p className="up-alert">{c.problem}</p>}
              {c.note && <p className="up-meta">💬 {c.note}</p>}
              <Msg msg={msg} />
              {pending && <p className="up-hint">Načítavam…</p>}
              {det && (<>
                <ul className="up-items">{det.items.map((i) => <li key={i.id} className={i.done ? 'done' : ''}>{i.done ? '☑' : '☐'} {i.label}</li>)}</ul>
                {det.photos.length > 0 && <div className="up-photos">{det.photos.map((p) => p.url && <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={PHOTO_KIND_LABEL[p.kind]} loading="lazy" /><span>{PHOTO_KIND_LABEL[p.kind]}{p.note ? ': ' + p.note : ''}</span></a>)}</div>}
              </>)}
            </>
          ) : <p className="up-hint">K tomuto príchodu nie je zaznamenané upratovanie (najbližšie pred príchodom do 10 dní).</p>}
        </div>
      )}
    </section>
  )
}

function ReviewLine({ r, demo }) {
  const { pending, msg, run } = useRun()
  return (
    <div className="up-app"><b>{stars(r.rating)} {SRC[r.source] || ''}{r.cleanliness != null ? ` · čistota ${String(r.cleanliness).replace('.', ',')}` : ''}</b>{r.text && <small>{r.text}</small>}
      <button className="up-link" disabled={pending || demo} onClick={() => { if (confirm('Odstrániť túto recenziu?')) run(() => removeReviewAction(r.id)) }}>odstrániť recenziu</button><Msg msg={msg} /></div>
  )
}

function AddReview({ flats, demo }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ code: '', listing: '', check_in: '', rating: '', cleanliness: '', source: 'airbnb', text: '' })
  const { pending, msg, run } = useRun()
  const list = Object.values(flats).sort((a, b) => String(a.listing_name).localeCompare(String(b.listing_name), 'sk'))
  return (
    <section className="up-panel">
      <button type="button" className="up-person-head" aria-expanded={open} onClick={() => setOpen(!open)}><b>+ Zapísať recenziu hosťa</b><small>Stačí kód rezervácie, byt a dátum sa doplnia samy.</small></button>
      {open && (
        <div className="up-form">
          <Field label="Kód rezervácie" hint="Napr. z Guesty. Ak ho nemáš, vyplň byt a dátum príchodu."><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoComplete="off" /></Field>
          <Field label="Byt (len bez kódu)"><select value={f.listing} disabled={!!f.code.trim()} onChange={(e) => setF({ ...f, listing: e.target.value })}><option value="">—</option>{list.map((x) => <option key={x.listing_id} value={x.listing_id}>{x.listing_name}</option>)}</select></Field>
          <Field label="Dátum príchodu (len bez kódu)"><input type="date" value={f.check_in} disabled={!!f.code.trim()} onChange={(e) => setF({ ...f, check_in: e.target.value })} /></Field>
          <Field label="Hodnotenie (1–5)"><input inputMode="decimal" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} placeholder="napr. 4" /></Field>
          <Field label="Čistota (1–5, nepovinné)"><input inputMode="decimal" value={f.cleanliness} onChange={(e) => setF({ ...f, cleanliness: e.target.value })} /></Field>
          <Field label="Zdroj"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SRC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Text recenzie" wide><textarea rows="3" maxLength="2000" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
          <div className="up-row"><button className="btn" disabled={pending || demo || !f.rating} onClick={() => run(() => addReviewAction(f), { ok: 'Recenzia je zapísaná a spárovaná s upratovaním.', then: () => setF({ code: '', listing: '', check_in: '', rating: '', cleanliness: '', source: f.source, text: '' }) })}>Zapísať recenziu</button></div>
          <Msg msg={msg} />
        </div>
      )}
    </section>
  )
}
