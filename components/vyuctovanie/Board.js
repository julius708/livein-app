'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveItemAction, addItemAction, deleteItemAction, setAptFirmAction, newPeriodAction, setPeriodStatusAction, addLinenAction } from '@/app/vyuctovanie/actions'
import {
  buildGroups, billingStats, matchItem, autoStav, lineCents, counted, missingAmount, eurC, decStr, num, stavyFor, stavClass, isProbable,
  FIRMS, FIRM_FULL, FIRM_CODE, monthLabel, monthName, nextMonth, asanaUrl, LINEN, LINEN_PRESETS, linenRows, linenNeeds, KATS, NO_PART,
} from '@/lib/billing-core'

const GROUP_TITLE = { N: 'Nové byty (onboarding)', E: 'Existujúce byty', B: 'BEŽNÉ POLOŽKY NA BYTY', O: 'Nepriradené k bytu' }
const GROUP_HINT = { B: 'Cenník bežných položiek, ktoré sa pridávajú do bytov. Nie je to súčet, len ceny na fakturáciu.', O: 'Riadky bez bytu. Priraď ich k bytu v poli „Presunúť k inému bytu“.' }
const ksStr = (v) => (v === null || v === undefined || v === '' ? '' : String(Number(v)).replace('.', ','))
const plural = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`

/** Textové / číselné pole s lokálnou hodnotou: uloží sa po opustení poľa, nie po každom znaku. */
function Field({ value, onCommit, multiline = false, disabled = false, className = '', ...rest }) {
  const [d, setD] = useState(value ?? '')
  const focus = useRef(false)
  const ref = useRef(null)
  useEffect(() => { if (!focus.current) setD(value ?? '') }, [value])
  useEffect(() => { const el = ref.current; if (multiline && el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` } }, [d, multiline])
  const props = {
    ref, value: d, disabled, className, ...rest,
    onChange: (e) => setD(e.target.value),
    onFocus: () => { focus.current = true },
    onBlur: () => { focus.current = false; if (String(d) !== String(value ?? '')) onCommit(d) },
  }
  return multiline ? <textarea rows={1} {...props} /> : <input {...props} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}

function Row({ it, lists, stavy, ro, onSave, onDelete }) {
  const [move, setMove] = useState(false)
  const c = lineCents(it)
  const both = num(it.ks) != null && num(it.cena) != null
  const miss = missingAmount(it)
  const dim = !counted(it)
  const save = (patch) => onSave(it.id, patch)
  return (
    <div className={`vy-row${miss ? ' miss' : ''}${dim ? ' dim' : ''}`}>
      <div className="vy-main">
        <Field multiline disabled={ro} className="vy-pol" value={it.polozka} aria-label="Položka" onCommit={(v) => save({ polozka: v })} />
        {(move || !it.byt) && (
          <label className="vy-move">Presunúť k inému bytu
            <Field disabled={ro} list="vy-byty" value={it.byt} placeholder="názov bytu" onCommit={(v) => { save({ byt: v }); setMove(false) }} />
          </label>
        )}
      </div>
      <label className="vy-n">ks<Field disabled={ro} inputMode="decimal" value={ksStr(it.ks)} onCommit={(v) => save({ ks: v })} /></label>
      <label className="vy-n">cena<Field disabled={ro} inputMode="decimal" value={decStr(it.cena)} onCommit={(v) => save({ cena: v })} /></label>
      <div className="vy-n vy-sum">suma
        {both ? <b className={dim ? 'dim' : ''}>{eurC(c)}</b>
          : <Field disabled={ro} inputMode="decimal" value={decStr(it.suma)} placeholder={miss ? 'doplniť' : ''} onCommit={(v) => save(num(it.cena) == null ? { suma: v, cena: null } : { suma: v })} />}
      </div>
      <select disabled={ro} className={`vy-stav ${stavClass(it.stav)}`} value={it.stav} aria-label="Stav" onChange={(e) => save({ stav: e.target.value })}>
        {[...new Set([...stavy, it.stav])].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="vy-pz">Poznámka<Field multiline disabled={ro} value={it.pozn || ''} onCommit={(v) => save({ pozn: v })} /></label>
      <label className="vy-zi">Zistiť od<Field disabled={ro} value={it.zistit || ''} placeholder="koho / čo" onCommit={(v) => save({ zistit: v })} /></label>
      <div className="vy-act">
        {it.asana && <a href={asanaUrl(it.asana)} target="_blank" rel="noopener noreferrer">Asana</a>}
        {(it.foto || []).length > 0 && <span title="Fotky v Asane">📷 {it.foto.length}</span>}
        {!ro && it.byt && <button type="button" className="vy-ico" title="Presunúť k inému bytu" aria-label="Presunúť k inému bytu" onClick={() => setMove((m) => !m)}>⇄</button>}
        {!ro && <button type="button" className="vy-ico del" title="Zmazať riadok" aria-label="Zmazať riadok" onClick={() => onDelete(it)}>✕</button>}
      </div>
    </div>
  )
}

function Card({ card, open, toggle, lists, stavy, ro, firmValue, onFirm, onSave, onDelete, onAdd }) {
  const real = card.group !== 'B' && card.group !== 'O'
  const rows = (arr) => {
    let last = null
    return arr.map((it) => {
      const head = it.kat !== last ? <div key={`k${it.id}`} className="vy-kat">{it.kat || 'Bez kategórie'}</div> : null
      last = it.kat
      return [head, <Row key={it.id} it={it} lists={lists} stavy={stavy} ro={ro} onSave={onSave} onDelete={onDelete} />]
    })
  }
  return (
    <section className={`vy-card${open ? ' open' : ''}`}>
      <header className="vy-h">
        <button type="button" className="vy-t" aria-expanded={open} onClick={toggle}>
          <span className="vy-chev" aria-hidden="true">▸</span>
          <span className="vy-name">{card.name}</span>
          <span className="vy-meta">{plural(card.count, 'riadok', 'riadky', 'riadkov')}</span>
          {card.miss > 0 && <span className="vy-b warn">{card.miss}× bez sumy</span>}
          {card.patrik > 0 && <span className="vy-b pat">{card.patrik}× Patrik</span>}
          {card.zistit > 0 && <span className="vy-b red">{card.zistit}× zistiť</span>}
        </button>
        {real && (
          <select disabled={ro} className="vy-firm" value={firmValue} aria-label={`Firma pre ${card.name}`} onChange={(e) => onFirm(card.byt, e.target.value)}>
            <option value="">{`Auto: ${FIRM_FULL[card.firm] || FIRM_FULL.x}`}</option>
            {['I', 'M', 'S'].map((k) => <option key={k} value={k}>{FIRM_FULL[k]}</option>)}
          </select>
        )}
        {card.group !== 'B' && card.group !== 'O' ? <b className="vy-total">{eurC(card.sumC)}</b> : <span className="vy-total none">bez súčtu</span>}
      </header>
      {open && (
        <div className="vy-body">
          {GROUP_HINT[card.group] && <p className="vy-hint">{GROUP_HINT[card.group]}</p>}
          {card.subs ? card.subs.map((p) => (
            <div key={p.name} className="vy-part">
              <div className="vy-part-h"><span>{p.name}</span><b>{eurC(p.sumC)}</b></div>
              {rows(p.items)}
            </div>
          )) : rows(card.items)}
          {!ro && <div className="vy-add"><button type="button" className="btn" onClick={() => onAdd(card)}>+ Položka k tomuto bytu</button></div>}
        </div>
      )}
    </section>
  )
}

function Linen({ period, names, ro, onDone, onMsg }) {
  const [pending, start] = useTransition()
  const [byt, setByt] = useState('')
  const [cast, setCast] = useState('')
  const [preset, setPreset] = useState('4')
  const [bathrooms, setBathrooms] = useState(1)
  const [apartments, setApartments] = useState(1)
  const [owned, setOwned] = useState({})
  const beds = LINEN_PRESETS[preset].beds
  const calc = useMemo(() => linenRows({ beds, bathrooms, owned, apartments }), [beds, bathrooms, owned, apartments])
  const need = linenNeeds({ beds, bathrooms })
  const go = () => start(async () => {
    const r = await addLinenAction({ period_id: period.id, byt, cast, preset, bathrooms, owned, apartments })
    if (r && r.ok) { onMsg({ ok: `Pridané ${r.items.length} riadkov prádla, spolu ${eurC(r.totalC)}.` }); onDone(r.items) } else onMsg({ err: (r && r.error) || 'Nepodarilo sa.' })
  })
  return (
    <details className="vy-panel">
      <summary>🧺 Kalkulačka prádla pre nový byt</summary>
      <p className="vy-hint">Ceny Horeca s DPH po zľave. Spočíta sa podľa lôžok a kúpeľní; čo mal majiteľ vlastné, sa odpočíta. Riadky pribudnú do bytu ako „Nový byt – zariadenie“, suma OK.</p>
      <div className="vy-form">
        <label>Byt<input list="vy-byty" value={byt} onChange={(e) => setByt(e.target.value)} placeholder="názov bytu" disabled={ro} /></label>
        <label>Časť (voliteľné)<input value={cast} onChange={(e) => setCast(e.target.value)} placeholder="napr. 3. poschodie" disabled={ro} /></label>
        <label>Typ bytu<select value={preset} onChange={(e) => setPreset(e.target.value)} disabled={ro}>{Object.entries(LINEN_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label>Kúpeľne<input type="number" min={0} max={10} value={bathrooms} onChange={(e) => setBathrooms(Number(e.target.value))} disabled={ro} /></label>
        <label>Počet rovnakých bytov<input type="number" min={1} max={20} value={apartments} onChange={(e) => setApartments(Number(e.target.value))} disabled={ro} /></label>
      </div>
      <details className="vy-own"><summary>Čo mal majiteľ vlastné (na jeden byt)</summary>
        <div className="vy-form">{LINEN.map((l) => (
          <label key={l.id}>{l.name} <small>(treba {need[l.id]})</small>
            <input type="number" min={0} max={99} value={owned[l.id] ?? ''} placeholder="0" onChange={(e) => setOwned({ ...owned, [l.id]: e.target.value === '' ? 0 : Number(e.target.value) })} disabled={ro} />
          </label>
        ))}</div>
      </details>
      <div className="vy-calc">
        <span>Na jeden byt <b>{eurC(calc.perApartmentC)}</b></span>
        <span>Spolu <b>{eurC(calc.totalC)}</b> <small>({calc.rows.length} riadkov)</small></span>
        <button type="button" className="btn" disabled={ro || pending || !byt.trim() || !calc.rows.length} onClick={go}>{pending ? 'Pridávam…' : 'Pridať do vyúčtovania'}</button>
      </div>
    </details>
  )
}

function Empty() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState('')
  return (
    <section className="card">
      <h2>Vyúčtovanie majiteľom</h2>
      <p>Zatiaľ nie je žiadne obdobie.</p>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { const r = await newPeriodAction(); if (r && r.ok) router.push(`/vyuctovanie?m=${r.month.slice(0, 7)}`); else setErr((r && r.error) || 'Nepodarilo sa.') })}>Vytvoriť prvé obdobie</button>
      {err && <p className="vy-msg err">{err}</p>}
    </section>
  )
}

export default function Board(props) {
  return props.period ? <BoardInner key={props.period.id} {...props} /> : <Empty />
}

function BoardInner({ periods, period, items: initial, prices, lists, isAdmin }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [items, setItems] = useState(initial)
  const [q, setQ] = useState('')
  const [firma, setFirma] = useState('')
  const [stav, setStav] = useState('')
  const [open, setOpen] = useState({})
  const [msg, setMsg] = useState(null)
  useEffect(() => { setItems(initial) }, [initial])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), msg.err ? 8000 : 3500); return () => clearTimeout(t) }, [msg])

  const ro = period.status === 'closed'
  const stavy = stavyFor(period.month)
  const stats = useMemo(() => billingStats(items), [items])
  const visible = useMemo(() => items.filter((it) => matchItem(it, { q, firma, stav }, lists)), [items, q, firma, stav, lists])
  const groups = useMemo(() => buildGroups(visible, lists), [visible, lists])
  const filtering = !!(q.trim() || firma || stav)
  const names = useMemo(() => [...new Set([...(lists.names || []), ...items.map((i) => i.byt).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'sk', { numeric: true })), [lists, items])
  const explicitFirm = (byt) => { const x = items.find((i) => i.byt === byt && i.firma && FIRM_CODE[i.firma]); return x ? FIRM_CODE[x.firma] : '' }
  const allKeys = ['N', 'E', 'B', 'O'].flatMap((k) => groups[k].map((c) => c.key))
  const isOpen = (key) => (filtering ? open[key] !== false : !!open[key])
  const allOpen = allKeys.length > 0 && allKeys.every(isOpen)
  const next = nextMonth(period.month)
  const deadline = next ? `15. ${String(next).slice(5, 7).replace(/^0/, '')}. ${String(next).slice(0, 4)}` : ''
  const say = (m) => setMsg(m)

  const onSave = async (id, patch) => {
    const cur = items.find((i) => i.id === id); if (!cur) return
    setItems((a) => a.map((i) => (i.id === id ? { ...i, ...autoStav(i, patch) } : i)))
    const r = await saveItemAction(id, patch)
    if (r && r.ok) setItems((a) => a.map((i) => (i.id === id ? r.item : i)))
    else { setItems((a) => a.map((i) => (i.id === id ? cur : i))); say({ err: (r && r.error) || 'Neuložilo sa.' }) }
  }
  const onDelete = async (it) => {
    if (!window.confirm(`Zmazať riadok?\n\n${it.polozka || '(prázdna položka)'}${it.byt ? `\nByt: ${it.byt}` : ''}`)) return
    const r = await deleteItemAction(it.id)
    if (r && r.ok) { setItems((a) => a.filter((i) => i.id !== it.id)); say({ ok: 'Riadok zmazaný.' }) } else say({ err: (r && r.error) || 'Nepodarilo sa zmazať.' })
  }
  const onAdd = async (card) => {
    const r = await addItemAction({ period_id: period.id, byt: card.byt || '', typ: card.group === 'N' ? 'novy' : card.group === 'E' ? 'existujuci' : null, kat: card.group === 'B' ? 'Všeobecné položky do bytov' : 'Poznámka z Účtovníctva', stav: card.group === 'B' ? 'Cenník (bežná cena)' : 'Doplniť sumu' })
    if (r && r.ok) { setItems((a) => [...a, r.item]); setOpen((o) => ({ ...o, [card.key]: true })) } else say({ err: (r && r.error) || 'Nepodarilo sa pridať.' })
  }
  const onFirm = async (byt, f) => {
    const before = items
    const val = f ? FIRMS[f] : null
    setItems((a) => a.map((i) => (i.byt === byt ? { ...i, firma: val } : i)))
    const r = await setAptFirmAction({ period_id: period.id, byt, firma: f ? FIRMS[f] : '' })
    if (r && r.ok) say({ ok: f ? `Firma pre ${byt}: ${FIRM_FULL[f]} (${r.count} riadkov).` : `Firma pre ${byt} sa dopočíta automaticky.` }); else { setItems(before); say({ err: (r && r.error) || 'Nepodarilo sa.' }) }
  }
  const newMonth = () => {
    if (!window.confirm(`Založiť ďalší mesiac?\n\nRiadky so stavom „Pravdepodobne ${monthName(next)}“ sa presunú do nového obdobia a pribudne cenník bežných položiek.`)) return
    start(async () => { const r = await newPeriodAction(); if (r && r.ok) { say({ ok: `${monthLabel(r.month)}: presunutých ${r.moved} riadkov, cenník ${r.priceRows} položiek.` }); router.push(`/vyuctovanie?m=${r.month.slice(0, 7)}`) } else say({ err: (r && r.error) || 'Nepodarilo sa.' }) })
  }
  const setStatus = (status) => {
    if (status === 'closed' && !window.confirm(`Uzavrieť ${monthLabel(period.month)}? Riadky sa potom nedajú meniť, kým ho admin znova neotvorí.`)) return
    start(async () => { const r = await setPeriodStatusAction({ period_id: period.id, status }); if (r && r.ok) router.refresh(); else say({ err: (r && r.error) || 'Nepodarilo sa.' }) })
  }
  const toggleAll = () => { const v = !allOpen; setOpen(Object.fromEntries(allKeys.map((k) => [k, v]))) }
  const ym = String(period.month).slice(0, 7)

  return (
    <div className="vy-wrap">
      <datalist id="vy-byty">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <section className="card vy-top">
        <div className="vy-title">
          <h1>Vyúčtovanie majiteľom</h1>
          <p>Náklady, ktoré znova fakturujeme majiteľom bytov. Termín: <b>{deadline}</b> za {monthLabel(period.month)}.</p>
        </div>
        <div className="vy-tools">
          <label>Obdobie
            <select value={ym} onChange={(e) => router.push(`/vyuctovanie?m=${e.target.value}`)}>
              {periods.map((p) => <option key={p.id} value={String(p.month).slice(0, 7)}>{monthLabel(p.month)}{p.status === 'closed' ? ' (uzavreté)' : ''}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={pending} onClick={newMonth}>Nový mesiac</button>
          <a className="btn" href={`/vyuctovanie/export?m=${ym}`}>Export do Excelu</a>
          {isAdmin && (ro ? <button type="button" className="btn" disabled={pending} onClick={() => setStatus('open')}>Znova otvoriť</button> : <button type="button" className="btn" disabled={pending} onClick={() => setStatus('closed')}>Uzavrieť obdobie</button>)}
        </div>
        {ro && <p className="vy-msg err">Obdobie je uzavreté. Úpravy sú vypnuté{isAdmin ? '' : ', znova ho môže otvoriť admin'}.</p>}
      </section>

      <section className="vy-stats" aria-label="Súhrn">
        <div className="vy-stat main"><span>Spolu za mesiac</span><b>{eurC(stats.sumC)}</b><small>nové byty {eurC(stats.newC)} · existujúce {eurC(stats.exC)}</small></div>
        <div className="vy-stat"><span>Bytov</span><b>{stats.apts}</b></div>
        <div className={`vy-stat${stats.missing ? ' warn' : ''}`}><span>Riadkov bez sumy</span><b>{stats.missing}</b></div>
        <button type="button" className={`vy-stat${stats.patrik ? ' pat' : ''}`} onClick={() => setStav(stav ? '' : 'Čaká na Patrika (cena opravy)')} aria-pressed={!!stav}><span>Čaká na Patrika</span><b>{stats.patrik}</b></button>
        <div className={`vy-stat${stats.zistit ? ' red' : ''}`}><span>Treba zistiť</span><b>{stats.zistit}</b></div>
      </section>

      <section className="card vy-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt, položku, poznámku…" aria-label="Hľadať" />
        <select value={firma} onChange={(e) => setFirma(e.target.value)} aria-label="Firma">
          <option value="">Všetky firmy</option>
          {['M', 'I', 'S', 'x'].map((k) => <option key={k} value={k}>{FIRM_FULL[k]}</option>)}
        </select>
        <select value={stav} onChange={(e) => setStav(e.target.value)} aria-label="Stav">
          <option value="">Všetky stavy</option>
          {stavy.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="btn" onClick={toggleAll}>{allOpen ? 'Zbaliť všetko' : 'Rozbaliť všetko'}</button>
        {filtering && <button type="button" className="btn" onClick={() => { setQ(''); setFirma(''); setStav('') }}>Zrušiť filter</button>}
      </section>

      <Linen period={period} names={names} ro={ro} onMsg={say} onDone={(rows) => setItems((a) => [...a, ...rows])} />

      {['N', 'E', 'B', 'O'].map((k) => (groups[k].length > 0 || (!filtering && k === 'O')) && (
        <div key={k} className="vy-group">
          <h2>{GROUP_TITLE[k]} <small>{groups[k].length}</small></h2>
          {groups[k].map((card) => (
            <Card key={card.key} card={card} open={isOpen(card.key)} toggle={() => setOpen((o) => ({ ...o, [card.key]: !isOpen(card.key) }))}
              lists={lists} stavy={stavy} ro={ro} firmValue={explicitFirm(card.byt)} onFirm={onFirm} onSave={onSave} onDelete={onDelete} onAdd={onAdd} />
          ))}
          {k === 'O' && !ro && !filtering && <div className="vy-add"><button type="button" className="btn" onClick={() => onAdd({ key: 'O:' + GROUP_TITLE.O, group: 'O', byt: '' })}>+ Riadok bez bytu</button></div>}
        </div>
      ))}
      {visible.length === 0 && <section className="card"><p>Nič nezodpovedá filtru.</p></section>}
      {msg && <div className={`vy-toast ${msg.err ? 'err' : 'ok'}`} role="status" onClick={() => setMsg(null)}>{msg.err || msg.ok}</div>}
    </div>
  )
}
