'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { board, tileState, matches, owedBy, fold } from '@/lib/keys-core'
import { takeKeysAction, returnKeysAction } from '@/app/kluce/actions'

const STATE_LABEL = { ok: 'na háčiku', part: 'časť vonku', out: 'vonku', none: 'bez sád', unknown: 'nie je v evidencii' }
const fmtT = (iso) => { try { return new Date(iso).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const dayName = (ymd, today) => ymd === today ? 'Dnes' : new Date(ymd + 'T12:00:00Z').toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' })

/**
 * Tabuľa kľúčov: dlaždice podľa pozície na stene (rady z nastavení), nezaradené byty v poradí Práčovne, zoznam podľa tašiek,
 * tok „Zobrať“ (osoba → byty → potvrdiť) a „Vrátiť“ (osoba → čo má vonku → potvrdiť). Rovnaký komponent pre appku aj kiosk.
 */
export default function KeysBoard({ units = [], rows = [], persons = [], days = [], today, overdue = [], overdueHours = 24, kiosk = false, isAdmin = false }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  const [mode, setMode] = useState(null)            // null | 'take' | 'return'
  const [person, setPerson] = useState(null)
  const [picked, setPicked] = useState([])          // [{listing_id, sets, package_id, package_date}]
  const [msg, setMsg] = useState(null)
  const [day, setDay] = useState(0)
  const [lastPerson, setLastPerson] = useState(null)
  const tick = useRef(null)

  // kiosk: obnova každých 45 s, keď sa nič nerobí; a nezhasínajúca obrazovka
  useEffect(() => {
    if (!kiosk) return
    tick.current = setInterval(() => { if (!mode) router.refresh() }, 45000)
    let lock = null
    const wake = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen') } catch {} }
    wake(); document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(tick.current); document.removeEventListener('visibilitychange', wake); try { lock && lock.release() } catch {} }
  }, [kiosk, mode, router])
  // automatické zrušenie rozrobeného toku po 2 minútach nečinnosti (kiosk)
  useEffect(() => { if (!kiosk || !mode) return; const t = setTimeout(() => { setMode(null); setPicked([]); setPerson(null) }, 120000); return () => clearTimeout(t) }, [kiosk, mode, picked, person])

  const b = useMemo(() => board(units, rows), [units, rows])
  const byId = useMemo(() => new Map(units.map((u) => [u.listing_id, u])), [units])
  const owed = useMemo(() => (person ? owedBy(units, person) : []), [units, person])
  const list = days[day] || { date: today, items: [] }
  const filtered = useMemo(() => (q ? units.filter((u) => u.active !== false && matches(u, q)) : null), [units, q])
  const outNow = units.filter((u) => (u.out_sets || 0) > 0)
  const todayList = days[0] || { date: today, items: [] }
  const todayIds = useMemo(() => new Set(todayList.items.filter((i) => i.unit && tileState(i.unit) === 'ok').map((i) => i.listing_id)), [todayList])
  const todayLeft = todayList.items.filter((i) => i.unit && tileState(i.unit) !== 'out' && tileState(i.unit) !== 'none')

  const isPicked = (id) => picked.some((p) => p.listing_id === id)
  const toggle = (u, extra = {}) => {
    if (!mode) setMode('take')
    setPicked((p) => (p.some((x) => x.listing_id === u.listing_id) ? p.filter((x) => x.listing_id !== u.listing_id) : [...p, { listing_id: u.listing_id, sets: 1, ...extra }]))
  }
  const pickToday = () => {
    setMode('take'); setPicked(todayLeft.map((i) => ({ listing_id: i.listing_id, sets: 1, package_id: i.package_id, package_date: i.date })))
  }
  const reset = () => { setMode(null); setPicked([]); setPerson(null); setQ('') }
  const confirm = () => {
    if (!person) { setMsg({ err: 'Najprv vyber osobu.' }); return }
    const items = mode === 'return' ? (picked.length ? picked : owed.map((o) => ({ listing_id: o.listing_id, sets: o.sets }))) : picked
    if (!items.length) { setMsg({ err: mode === 'return' ? 'Nie je čo vrátiť.' : 'Vyber aspoň jeden byt.' }); return }
    start(async () => {
      const r = await (mode === 'return' ? returnKeysAction : takeKeysAction)({ person, items, kiosk })
      if (!r || (!r.ok && !r.done)) { setMsg({ err: (r && (r.error || (r.failed || []).join(' · '))) || 'Nepodarilo sa.' }); return }
      const names = items.map((i) => { const u = byId.get(i.listing_id); return u ? (u.hook_no != null ? `${u.hook_no} · ` : '') + u.listing_name : '' }).filter(Boolean)
      setMsg({ ok: `${mode === 'return' ? 'Vrátené' : 'Zobraté'} (${person.name}): ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` a ďalších ${names.length - 6}` : ''}${r.failed && r.failed.length ? ` · nepodarilo sa: ${r.failed.join('; ')}` : ''}${r.mismatch ? ' · pozor: vrátené bez záznamu o zobratí' : ''}` })
      setLastPerson(person); reset(); router.refresh()
    })
  }
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), kiosk ? 12000 : 20000); return () => clearTimeout(t) }, [msg, kiosk])

  const Tile = ({ n, u, picked: pk }) => {
    if (!u) return <div className="kl-hook empty" aria-label={`Pozícia ${n}, voľná`}><span className="n">{n}</span><span className="a">voľné</span></div>
    const st = tileState(u)
    const td = todayIds.has(u.listing_id)
    return (
      <button type="button" className={`kl-hook s-${st}${td ? ' s-today' : ''}${pk ? ' picked' : ''}`} onClick={() => toggle(u)} aria-pressed={pk} aria-label={`${n != null ? 'Pozícia ' + n + ', ' : ''}${u.listing_name}, ${td ? 'dnes zobrať' : STATE_LABEL[st]}`} title={u.holders && u.holders.length ? u.holders.map((h) => `${h.name} (${h.sets}) ${fmtT(h.at)}`).join('\n') : STATE_LABEL[st]}>
        {u.sets > 1 && <span className="c">{u.sets - (u.out_sets || 0)}/{u.sets}</span>}
        <span className="n">{n != null ? n : '–'}</span><span className="a">{u.listing_name}</span>
        {st !== 'ok' && u.holders && u.holders[0] && <span className="h">{u.holders.map((h) => h.name.split(' ')[0]).join(', ')}</span>}
      </button>
    )
  }

  return (
    <div className={`kl${kiosk ? ' kiosk' : ''}`}>
      {msg && <div className={`kl-msg ${msg.err ? 'err' : 'ok'}`} role="status">{msg.err || msg.ok}</div>}
      {!!overdue.length && !mode && <div className="kl-warn">⏰ Dlhšie než {overdueHours} h vonku: {overdue.slice(0, 5).map((o) => `${o.hook_no != null ? o.hook_no + ' · ' : ''}${o.listing_name} (${o.name}, ${o.hours} h)`).join(' · ')}{overdue.length > 5 ? ` a ďalších ${overdue.length - 5}` : ''}</div>}

      <div className="kl-grid">
        <section className="card kl-board" aria-label="Tabuľa kľúčov">
          <div className="kl-legend"><span><i className="s-today" />dnes zobrať</span><span><i className="s-ok" />na háčiku</span><span><i className="s-part" />časť vonku</span><span><i className="s-out" />vonku</span><span><i className="s-empty" />voľná pozícia</span><span><i className="s-picked" />vybrané</span></div>
          {filtered ? (
            <div className="kl-row"><h3>Výsledky hľadania <b>{filtered.length}</b></h3><div className="kl-hooks">{filtered.map((u) => <Tile key={u.listing_id} n={u.hook_no} u={u} picked={isPicked(u.listing_id)} />)}</div>{!filtered.length && <p className="kl-hint">Nič sa nenašlo. Skús časť názvu ulice alebo číslo pozície.</p>}</div>
          ) : (
            <>
              {b.rows.map((r) => <div className="kl-row" key={r.row}><h3>Lišta {r.row}{r.label ? ` · ${r.label}` : ''} <b>{r.from}–{r.to}</b></h3><div className="kl-hooks">{r.hooks.map((h) => <Tile key={h.hook_no} n={h.hook_no} u={h.unit} picked={h.unit ? isPicked(h.unit.listing_id) : false} />)}</div></div>)}
              {!!b.outside.length && <div className="kl-row"><h3>Pozície mimo líšt</h3><div className="kl-hooks">{b.outside.map((u) => <Tile key={u.listing_id} n={u.hook_no} u={u} picked={isPicked(u.listing_id)} />)}</div></div>}
              {!!b.unplaced.length && <div className="kl-row"><h3>Zatiaľ bez pozície <b>{b.unplaced.length}</b> <small>poradie ako na nástenke Práčovne</small></h3><div className="kl-hooks">{b.unplaced.map((u) => <Tile key={u.listing_id} n={null} u={u} picked={isPicked(u.listing_id)} />)}</div></div>}
              {!units.length && <p className="kl-hint">Evidencia je prázdna. Admin ju naplní v Správe tlačidlom „Načítať byty z registra“.</p>}
            </>
          )}
        </section>

        <div className="card kl-rail" role="complementary">
          <input id="kl-q" className="kl-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt alebo pozíciu" aria-label="Hľadať byt alebo pozíciu" autoComplete="off" />

          {!mode && (
            <>
              <button type="button" className="kl-big take" onClick={() => setMode('take')}>Zobrať kľúče <small>osoba → byty → potvrdiť</small></button>
              <button type="button" className="kl-big back" onClick={() => setMode('return')}>Vrátiť kľúče <small>{outNow.length ? `vonku je ${outNow.length} ${outNow.length === 1 ? 'byt' : outNow.length < 5 ? 'byty' : 'bytov'}` : 'všetko je na háčikoch'}</small></button>
              <button type="button" className="kl-big today" onClick={pickToday} disabled={!todayLeft.length}>Zobrať kľúče na dnes <small>{todayLeft.length ? `${todayLeft.length} ${todayLeft.length === 1 ? 'byt' : todayLeft.length < 5 ? 'byty' : 'bytov'} z tašiek Práčovne` : todayList.items.length ? 'všetky dnešné sú už vonku' : 'dnes nič z Práčovne'}</small></button>
              <details className="kl-today">
                <summary>Byty podľa tašiek <b>{days.map((d) => d.items.length).join(' · ')}</b><span className="kl-chev" aria-hidden="true" /></summary>
                <div className="kl-days">{days.map((d, i) => <button key={d.date} type="button" className={i === day ? 'on' : ''} onClick={() => setDay(i)}>{dayName(d.date, today)} <b>{d.items.length}</b></button>)}</div>
                {list.items.length ? (
                  <ul className="kl-list">{list.items.map((i) => <li key={i.package_id} className={`s-${i.key}`}><button type="button" onClick={() => i.unit && toggle(i.unit, { package_id: i.package_id, package_date: i.date })} disabled={!i.unit}><span className="pos">{i.hook_no != null ? i.hook_no : '–'}</span><span className="nm">{i.listing_name}{i.same_day ? <em> · v ten istý deň</em> : null}</span><span className={`st s-${i.key}`}>{STATE_LABEL[i.key]}</span></button></li>)}</ul>
                ) : <p className="kl-hint">Na tento deň Práčovňa nemá žiadne tašky.</p>}
                <p className="kl-hint">Ťuknutím na byt ho pridáš do výberu, keď chceš zobrať len niektoré.</p>
              </details>
              {!kiosk && !!outNow.length && <div className="kl-out"><h4>Práve vonku</h4><ul>{outNow.slice(0, 12).map((u) => <li key={u.listing_id}><span className="pos">{u.hook_no != null ? u.hook_no : '–'}</span><span className="nm">{u.listing_name}</span><span className="who">{(u.holders || []).map((h) => `${h.name.split(' ')[0]} ${fmtT(h.at)}`).join(', ')}</span></li>)}</ul>{outNow.length > 12 && <p className="kl-hint">a ďalších {outNow.length - 12}</p>}</div>}
            </>
          )}

          {mode && (
            <div className="kl-flow" role="dialog" aria-label={mode === 'take' ? 'Zobrať kľúče' : 'Vrátiť kľúče'}>
              <h2>{mode === 'take' ? 'Zobrať kľúče' : 'Vrátiť kľúče'}</h2>
              <p className="kl-step">1 · Kto {mode === 'take' ? 'berie' : 'vracia'}</p>
              <select id="kl-person" className="kl-select" value={person ? person.name : ''} onChange={(e) => { const p = persons.find((x) => x.name === e.target.value) || null; setPerson(p); setPicked((ps) => (mode === 'return' ? [] : ps)) }} aria-label="Kto">
                <option value="">Vyber meno…</option>
                {persons.map((p) => <option key={p.email || p.name} value={p.name}>{p.name}{lastPerson && lastPerson.name === p.name ? ' (naposledy)' : ''}</option>)}
              </select>
              {!persons.length && <p className="kl-hint">Žiadne osoby v ponuke. Skontroluj účty v Správe appky.</p>}
              {mode === 'take' && (
                <>
                  <p className="kl-step">2 · Ktoré byty <small>ťukni na tabuľu alebo na zoznam vľavo; dá sa vybrať viac</small></p>
                  <div className="kl-sel">{picked.map((p) => { const u = byId.get(p.listing_id); return u ? <button type="button" key={p.listing_id} onClick={() => toggle(u)} aria-label={`Odobrať ${u.listing_name}`}>{u.hook_no != null ? `${u.hook_no} · ` : ''}{u.listing_name}{u.sets > 1 ? <span className="sets"><i onClick={(e) => { e.stopPropagation(); setPicked((ps) => ps.map((x) => x.listing_id === p.listing_id ? { ...x, sets: x.sets >= Math.max(1, u.sets - (u.out_sets || 0)) ? 1 : x.sets + 1 } : x)) }}>×{p.sets}</i></span> : null} ✕</button> : null })}{!picked.length && <span className="kl-hint">zatiaľ nič</span>}</div>
                </>
              )}
              {mode === 'return' && person && (
                <>
                  <p className="kl-step">2 · Čo má {person.name.split(' ')[0]} vonku</p>
                  {owed.length ? <ul className="kl-list owed">{owed.map((o) => <li key={o.listing_id}><label><input type="checkbox" checked={picked.length ? isPicked(o.listing_id) : true} onChange={() => { const base = picked.length ? picked : owed.map((x) => ({ listing_id: x.listing_id, sets: x.sets })); setPicked(base.some((x) => x.listing_id === o.listing_id) ? base.filter((x) => x.listing_id !== o.listing_id) : [...base, { listing_id: o.listing_id, sets: o.sets }]) }} /><span className="pos">{o.hook_no != null ? o.hook_no : '–'}</span><span className="nm">{o.listing_name}{o.sets > 1 ? ` ×${o.sets}` : ''}</span><span className="who">{fmtT(o.at)}</span></label></li>)}</ul> : <p className="kl-hint">Podľa evidencie nemá nič vonku. Ak kľúče vracia aj tak, vyber byt na tabuli a potvrď – zapíše sa to s poznámkou.</p>}
                  {!!picked.length && !owed.some((o) => picked.some((p) => p.listing_id === o.listing_id)) && <div className="kl-sel">{picked.map((p) => { const u = byId.get(p.listing_id); return u ? <button type="button" key={p.listing_id} onClick={() => toggle(u)}>{u.hook_no != null ? `${u.hook_no} · ` : ''}{u.listing_name} ✕</button> : null })}</div>}
                </>
              )}
              <button type="button" className={`kl-big ${mode === 'take' ? 'take' : 'back'}`} onClick={confirm} disabled={pending}>{pending ? 'Zapisujem…' : 'Potvrdiť'} <small>{mode === 'take' ? `${picked.length} ${picked.length === 1 ? 'byt' : picked.length < 5 ? 'byty' : 'bytov'} · háčiky sčervenajú` : `${(picked.length || owed.length)} na vrátenie · háčiky zozelenajú`}</small></button>
              <button type="button" className="kl-ghost" onClick={reset}>Zrušiť</button>
            </div>
          )}
          <nav className="kl-more" aria-label="Ďalšie"><a href="/kluce/historia">História</a><span>·</span><a href="/kluce/sprava">Správa</a></nav>
        </div>
      </div>
    </div>
  )
}
