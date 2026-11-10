'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { board, tileState, matches, owedBy, dupHeads, tileName } from '@/lib/keys-core'
import { takeKeysAction, returnKeysAction } from '@/app/kluce/actions'

const STATE_LABEL = { ok: 'na háčiku', part: 'časť vonku', out: 'vonku', none: 'bez sád', unknown: 'nie je v evidencii' }
const fmtT = (iso) => { try { return new Date(iso).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const fmtDay = (ymd) => { try { return new Date(ymd + 'T12:00:00Z').toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }) } catch { return '' } }
const dayName = (ymd, today) => (ymd === today ? 'Dnes ' : '') + new Date(ymd + 'T12:00:00Z').toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
/** Krátky názov na dlaždicu: ulica bez prívlastku za čiarkou („29. Augusta, Grand“ → „29. Augusta“), skratky bez bodky na konci. */
export const shortName = (s) => { const t = String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(); const i = t.indexOf(','); const head = (i > 0 ? t.slice(0, i) : t).trim(); return head.length >= 3 ? head : t }
const plural = (n, a, b, c) => `${n} ${n === 1 ? a : n < 5 ? b : c}`
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch {} return null }

/**
 * Tabuľa kľúčov (kiosk aj appka): dlaždice podľa pozície na stene, modré = dnes zobrať (tašky Práčovne), červené = vonku.
 * Lišta: kto (zapamätané), „Zobrať na dnes“ a „Vrátiť všetko“ ako okamžité akcie, výber ťuknutím na dlaždice s lištou Zobrať/Vrátiť,
 * zbalený zoznam podľa tašiek. Hlásenia sa ukazujú priamo v lište, nie hore nad tabuľou.
 */
export default function KeysBoard({ units = [], rows = [], persons = [], days = [], today, overdue = [], overdueHours = 24, kiosk = false }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [person, setPerson] = useState(null)
  const [picked, setPicked] = useState([])          // listing_id[]
  const [info, setInfo] = useState(null)            // listing_id – byt, ktorého detail je v lište
  const [msg, setMsg] = useState(null)
  const [day, setDay] = useState(0)
  const [needPerson, setNeedPerson] = useState(false)
  const selRef = useRef(null)

  // zapamätané meno (kiosk: posledný, kto s ním robil) – len pohodlie, dá sa prepnúť
  useEffect(() => { const n = store('kl-person'); if (n) { const p = persons.find((x) => x.name === n); if (p) setPerson(p) } }, [persons])
  const choosePerson = (name) => { const p = persons.find((x) => x.name === name) || null; setPerson(p); setNeedPerson(false); if (p) store('kl-person', p.name) }

  // kiosk: obnova každých 45 s, keď nie je rozrobený výber; obrazovka nezhasína
  useEffect(() => {
    if (!kiosk) return
    // nový deň = celé znovunačítanie (dnešné tašky, modré dlaždice); inak tichá obnova dát každých 45 s a po návrate na obrazovku
    const ymdNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const tick = () => { if (ymdNow() !== today) { window.location.reload(); return } if (!picked.length && !busy) router.refresh() }
    const t = setInterval(tick, 45000)
    let lock = null
    const wake = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen') } catch {} }
    const onVis = () => { wake(); if (document.visibilityState === 'visible') tick() }
    wake(); document.addEventListener('visibilitychange', onVis); window.addEventListener('focus', tick); window.addEventListener('online', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', tick); window.removeEventListener('online', tick); try { lock && lock.release() } catch {} }
  }, [kiosk, picked.length, busy, router, today])
  useEffect(() => { if (!kiosk || !picked.length) return; const t = setTimeout(() => setPicked([]), 120000); return () => clearTimeout(t) }, [kiosk, picked])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), msg.err ? 15000 : 8000); return () => clearTimeout(t) }, [msg])

  const b = useMemo(() => board(units, rows), [units, rows])
  const dups = useMemo(() => dupHeads(units), [units])
  const byId = useMemo(() => new Map(units.map((u) => [u.listing_id, u])), [units])
  const owed = useMemo(() => (person ? owedBy(units, person) : []), [units, person])
  const list = days[day] || { date: today, items: [] }
  const filtered = useMemo(() => (q ? units.filter((u) => u.active !== false && matches(u, q)) : null), [units, q])
  const outNow = units.filter((u) => (u.out_sets || 0) > 0)
  const todayList = days[0] || { date: today, items: [] }
  const todayIds = useMemo(() => new Set(todayList.items.filter((i) => i.unit && tileState(i.unit) === 'ok').map((i) => i.listing_id)), [todayList])
  const todayLeft = todayList.items.filter((i) => i.unit && tileState(i.unit) !== 'out' && tileState(i.unit) !== 'none')
  const pickedUnits = picked.map((id) => byId.get(id)).filter(Boolean)
  const canTake = pickedUnits.filter((u) => tileState(u) === 'ok' || tileState(u) === 'part')
  const canReturn = pickedUnits.filter((u) => (u.out_sets || 0) > 0)

  const toggle = (u) => { setInfo(u.listing_id); setPicked((p) => (p.includes(u.listing_id) ? p.filter((x) => x !== u.listing_id) : [...p, u.listing_id])) }
  const requirePerson = () => { if (person) return true; setNeedPerson(true); setMsg({ err: 'Najprv vyber meno hore.' }); try { selRef.current && selRef.current.focus() } catch {} return false }

  /** Zápis: zobrať alebo vrátiť zoznam bytov za vybranú osobu. Chyby sa ukážu v lište. */
  async function run(action, items, label) {
    if (!requirePerson()) return
    if (!items.length) { setMsg({ err: action === 'take' ? 'Nie je čo zobrať.' : 'Nie je čo vrátiť.' }); return }
    setBusy(true)
    try {
      const r = await (action === 'take' ? takeKeysAction : returnKeysAction)({ person, items, kiosk })
      if (!r || (!r.ok && !r.done)) { setMsg({ err: (r && (r.error || (r.failed || []).join(' · '))) || 'Zápis zlyhal. Skús znova.' }); return }
      const names = items.map((i) => { const u = byId.get(i.listing_id); return u ? (u.hook_no != null ? `${u.hook_no} ` : '') + shortName(u.listing_name) : '' }).filter(Boolean)
      setMsg({ ok: `${label}: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` +${names.length - 8}` : ''}${r.failed && r.failed.length ? ` · nepodarilo sa: ${r.failed.join('; ')}` : ''}${r.mismatch ? ' · vrátené bez záznamu o zobratí' : ''}` })
      setPicked([]); setInfo(null); router.refresh()
    } catch (e) {
      console.error('kluce action', e)
      setMsg({ err: 'Zápis sa nepodaril (spojenie alebo prihlásenie). Obnov stránku a skús znova.' })
    } finally { setBusy(false) }
  }
  const takeToday = () => run('take', todayLeft.map((i) => ({ listing_id: i.listing_id, sets: 1, package_id: i.package_id, package_date: i.date })), `Zobraté ${fmtDay(today)} (${person ? person.name.split(' ')[0] : ''})`)
  const returnAll = () => run('return', owed.map((o) => ({ listing_id: o.listing_id, sets: o.sets })), `Vrátené (${person ? person.name.split(' ')[0] : ''})`)
  const takePicked = () => run('take', canTake.map((u) => ({ listing_id: u.listing_id, sets: 1, ...(todayIds.has(u.listing_id) ? { package_id: (todayList.items.find((i) => i.listing_id === u.listing_id) || {}).package_id, package_date: todayList.date } : {}) })), `Zobraté (${person ? person.name.split(' ')[0] : ''})`)
  const returnPicked = () => run('return', canReturn.map((u) => ({ listing_id: u.listing_id, sets: 1 })), `Vrátené (${person ? person.name.split(' ')[0] : ''})`)

  const Tile = ({ n, u }) => {
    if (!u) return <div className="kl-hook s-empty" aria-label={`Pozícia ${n}, voľná`}><span className="n">{n}</span></div>
    const st = tileState(u), td = todayIds.has(u.listing_id), pk = picked.includes(u.listing_id)
    const who = (u.holders || []).map((h) => h.name.split(' ')[0]).join(', ')
    return (
      <button type="button" className={`kl-hook s-${st}${td ? ' s-today' : ''}${pk ? ' picked' : ''}`} onClick={() => toggle(u)} aria-pressed={pk}
        aria-label={`${n != null ? 'Pozícia ' + n + ', ' : ''}${u.listing_name}, ${td ? 'dnes zobrať' : STATE_LABEL[st]}${who ? ', má ' + who : ''}`}
        title={`${u.listing_name}${u.note ? ' · ' + u.note : ''}\n${td ? 'dnes zobrať' : STATE_LABEL[st]}${(u.holders || []).length ? '\n' + u.holders.map((h) => `${h.name} (${h.sets}) ${fmtT(h.at)}`).join('\n') : ''}`}>
        <span className="n">{n != null ? n : '–'}{u.sets > 1 && <i className="c">{u.sets - (u.out_sets || 0)}/{u.sets}</i>}</span>
        <span className="a">{tileName(u.listing_name, dups)}</span>
        {st !== 'ok' && who && <span className="h">{who}</span>}
      </button>
    )
  }

  return (
    <div className={`kl${kiosk ? ' kiosk' : ''}`}>
      <div className="kl-grid">
        <section className="card kl-board" aria-label="Tabuľa kľúčov">
          <div className="kl-legend"><span><i className="s-today" />dnes zobrať</span><span><i className="s-ok" />na háčiku</span><span><i className="s-part" />časť vonku</span><span><i className="s-out" />vonku</span><span><i className="s-empty" />voľné</span>{!!overdue.length && <span className="kl-od" title={overdue.map((o) => `${o.hook_no != null ? o.hook_no + ' ' : ''}${shortName(o.listing_name)} · ${o.name} · ${o.hours} h`).join('\n')}>⏰ {plural(overdue.length, 'kľúč', 'kľúče', 'kľúčov')} vonku dlhšie než {overdueHours} h</span>}</div>
          {filtered ? (
            <div className="kl-row"><h3>Hľadanie <b>{filtered.length}</b></h3><div className="kl-hooks">{filtered.map((u) => <Tile key={u.listing_id} n={u.hook_no} u={u} />)}</div>{!filtered.length && <p className="kl-hint">Nič sa nenašlo.</p>}</div>
          ) : (
            <>
              {b.rows.map((r) => <div className="kl-row" key={r.row}><h3>{r.label || `Lišta ${r.row}`} <b>{r.from}–{r.to}</b></h3><div className="kl-hooks">{r.hooks.map((h) => <Tile key={h.hook_no} n={h.hook_no} u={h.unit} />)}</div></div>)}
              {!!b.outside.length && <div className="kl-row"><h3>Mimo líšt</h3><div className="kl-hooks">{b.outside.map((u) => <Tile key={u.listing_id} n={u.hook_no} u={u} />)}</div></div>}
              {!!b.unplaced.length && <div className="kl-row"><h3>Bez pozície <b>{b.unplaced.length}</b></h3><div className="kl-hooks">{b.unplaced.map((u) => <Tile key={u.listing_id} n={null} u={u} />)}</div></div>}
              {!units.length && <p className="kl-hint">Evidencia je prázdna. Naplň ju v Nastaveniach tlačidlom „Načítať byty z registra“.</p>}
            </>
          )}
        </section>

        <div className="card kl-rail" role="complementary">
          <label className={`kl-who${needPerson ? ' need' : ''}`}><span>Kto</span>
            <select ref={selRef} id="kl-person" className="kl-select" value={person ? person.name : ''} onChange={(e) => choosePerson(e.target.value)} aria-label="Kto berie alebo vracia kľúče">
              <option value="">Vyber meno…</option>
              {persons.map((p) => <option key={p.email || p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          {msg && <div className={`kl-msg ${msg.err ? 'err' : 'ok'}`} role="status">{msg.err || msg.ok}</div>}

          <div className="kl-actions">
            <button type="button" className="kl-btn today" onClick={takeToday} disabled={busy || !todayLeft.length} title="Označí všetky dnešné kľúče z tašiek Práčovne ako zobraté">{busy ? '…' : `Zobrať na dnes ${fmtDay(today)}`} <b>{todayLeft.length}</b></button>
            <button type="button" className="kl-btn back" onClick={returnAll} disabled={busy || !person || !owed.length} title={person ? `Vráti všetko, čo má ${person.name.split(' ')[0]} vonku` : 'Najprv vyber meno'}>Vrátiť všetko <b>{owed.length}</b></button>
          </div>

          {!!picked.length && (
            <div className="kl-selbar" role="group" aria-label="Vybrané kľúče">
              <span className="kl-selcount">{plural(picked.length, 'vybraný', 'vybrané', 'vybraných')}</span>
              <button type="button" className="kl-btn take sm" onClick={takePicked} disabled={busy || !canTake.length}>Zobrať <b>{canTake.length}</b></button>
              <button type="button" className="kl-btn back sm" onClick={returnPicked} disabled={busy || !canReturn.length}>Vrátiť <b>{canReturn.length}</b></button>
              <button type="button" className="kl-x" onClick={() => setPicked([])} aria-label="Zrušiť výber">✕</button>
            </div>
          )}

          {info && byId.get(info) && (() => { const u = byId.get(info); const st = tileState(u); return (
            <div className="kl-info" role="note">
              <div className="kl-info-h"><b>{u.hook_no != null ? `${u.hook_no} · ` : ''}{u.listing_name}</b><button type="button" className="kl-x" onClick={() => setInfo(null)} aria-label="Zavrieť">✕</button></div>
              {u.address && <div className="kl-info-r">📍 {u.address}</div>}
              {u.detail && <div className="kl-info-r">🏢 {u.detail}</div>}
              {u.note && <div className="kl-info-r kl-info-n">{u.note}</div>}
              <div className="kl-info-r"><i className={`kl-dot s-${st}`} />{todayIds.has(u.listing_id) ? 'dnes zobrať · ' : ''}{STATE_LABEL[st]}{u.sets > 1 ? ` · ${u.sets - (u.out_sets || 0)}/${u.sets} sád na háčiku` : ''}{(u.holders || []).length ? ' · má ' + u.holders.map((h) => `${h.name} (${fmtT(h.at)})`).join(', ') : ''}</div>
              {!u.address && !u.detail && <div className="kl-info-r kl-hint">Adresa a poschodie sa dopĺňajú v Nastaveniach pri tomto kľúči.</div>}
            </div>
          ) })()}

          <input id="kl-q" className="kl-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt alebo pozíciu" aria-label="Hľadať byt alebo pozíciu" autoComplete="off" />

          <details className="kl-today">
            <summary>Podľa tašiek <b>{days.map((d) => d.items.length).join(' · ')}</b><span className="kl-chev" aria-hidden="true" /></summary>
            <div className="kl-days">{days.map((d, i) => <button key={d.date} type="button" className={i === day ? 'on' : ''} onClick={() => setDay(i)}>{dayName(d.date, today)} <b>{d.items.length}</b></button>)}</div>
            {list.items.length ? (
              <ul className="kl-list">{list.items.map((i) => <li key={i.package_id}><button type="button" onClick={() => i.unit && toggle(i.unit)} disabled={!i.unit} aria-pressed={picked.includes(i.listing_id)} className={picked.includes(i.listing_id) ? 'on' : ''}><span className="pos">{i.hook_no != null ? i.hook_no : '–'}</span><span className="nm">{shortName(i.listing_name)}</span><span className={`st s-${i.key}`}>{STATE_LABEL[i.key]}</span></button></li>)}</ul>
            ) : <p className="kl-hint">Na tento deň Práčovňa nemá tašky.</p>}
          </details>

          {!kiosk && !!outNow.length && <details className="kl-today"><summary>Práve vonku <b>{outNow.length}</b><span className="kl-chev" aria-hidden="true" /></summary><ul className="kl-list">{outNow.map((u) => <li key={u.listing_id}><button type="button" onClick={() => toggle(u)} aria-pressed={picked.includes(u.listing_id)} className={picked.includes(u.listing_id) ? 'on' : ''}><span className="pos">{u.hook_no != null ? u.hook_no : '–'}</span><span className="nm">{shortName(u.listing_name)}</span><span className="who">{(u.holders || []).map((h) => `${h.name.split(' ')[0]} ${fmtT(h.at)}`).join(', ')}</span></button></li>)}</ul></details>}

          <nav className="kl-more" aria-label="Ďalšie"><a href="/kluce/historia">História</a><span>·</span><a href="/kluce/sprava">Nastavenia</a></nav>
        </div>
      </div>
    </div>
  )
}
