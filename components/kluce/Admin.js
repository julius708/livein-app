'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveUnitAction, resetUnitAction, saveRowsAction, syncUnitsAction } from '@/app/kluce/actions'
import { sortUnits, matches, tileState } from '@/lib/keys-core'

/** Správa kľúčov: načítanie bytov z registra, lišty na stene, pozícia a počet sád pre každý byt, náprava stavu. */
export default function KeysAdmin({ units = [], rows = [], overdueHours = 24, isAdmin = false }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState(null)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('all')
  const [rw, setRw] = useState(rows.map((r) => ({ ...r })))
  const [hours, setHours] = useState(overdueHours)
  const list = useMemo(() => sortUnits(units).filter((u) => matches(u, q)).filter((u) => only === 'all' ? true : only === 'unplaced' ? u.hook_no == null && u.active !== false : only === 'out' ? (u.out_sets || 0) > 0 : u.active === false), [units, q, only])
  const run = (fn, okText) => start(async () => { const r = await fn(); setMsg(r && r.ok ? { ok: okText(r) } : { err: (r && r.error) || 'Nepodarilo sa.' }); if (r && r.ok) router.refresh() })
  const save = (listing_id, patch) => run(() => saveUnitAction({ listing_id, ...patch }), () => 'Uložené.')
  const used = new Set(units.filter((u) => u.hook_no != null).map((u) => u.hook_no))
  const free = []; for (const r of rows) for (let n = r.from; n <= r.to && free.length < 400; n++) if (!used.has(n)) free.push(n)

  return (
    <div className="kl-admin">
      {msg && <div className={`kl-msg ${msg.err ? 'err' : 'ok'}`} role="status">{msg.err || msg.ok}</div>}
      <section className="card">
        <h2>Byty v evidencii <small>{units.filter((u) => u.active !== false).length} aktívnych · {units.filter((u) => u.hook_no != null).length} s pozíciou</small></h2>
        <p className="hint">Nové byty z registra (Guesty) pribudnú s jednou sadou a bez pozície. Pozíciu doplň podľa stene; čísla idú zľava doprava po celých lištách.</p>
        <div className="row"><button type="button" className="btn" disabled={pending} onClick={() => run(syncUnitsAction, (r) => `Načítané: ${r.added} nových, ${r.renamed} premenovaných, ${r.deactivated} vyradených.`)}>Načítať byty z registra</button><span className="hint">Voľné pozície: {free.slice(0, 30).join(', ')}{free.length > 30 ? '…' : ''}{!free.length && 'žiadne'}</span></div>
      </section>

      {isAdmin && (
        <section className="card">
          <h2>Lišty na stene</h2>
          <p className="hint">Každá lišta má rozsah pozícií. Keď stenu preusporiadaš, zmeň tu rozsahy; pozície bytov uprav v tabuľke nižšie. História pohybov ostáva.</p>
          <div className="kl-rows">
            {rw.map((r, i) => <div className="kl-rowedit" key={i}><label>Lišta<input type="number" min={1} value={r.row} onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, row: Number(e.target.value) } : y))} /></label><label>Od<input type="number" min={1} max={999} value={r.from} onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, from: Number(e.target.value) } : y))} /></label><label>Do<input type="number" min={1} max={999} value={r.to} onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, to: Number(e.target.value) } : y))} /></label><label>Popis<input type="text" maxLength={40} value={r.label || ''} placeholder="napr. horná" onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} /></label><button type="button" className="btn line" onClick={() => setRw((x) => x.filter((_, j) => j !== i))}>Odobrať</button></div>)}
          </div>
          <div className="row"><button type="button" className="btn line" onClick={() => setRw((x) => [...x, { row: x.length + 1, from: (x[x.length - 1]?.to || 0) + 1, to: (x[x.length - 1]?.to || 0) + 20 }])}>Pridať lištu</button><label className="inl">Upozorniť po<input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} /> h vonku</label><button type="button" className="btn" disabled={pending} onClick={() => run(() => saveRowsAction({ rows: rw, overdueHours: hours }), () => 'Lišty uložené.')}>Uložiť lišty</button></div>
        </section>
      )}

      <section className="card">
        <div className="row"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt alebo pozíciu…" aria-label="Hľadať" /><div className="kl-filters">{[['all', 'Všetky'], ['unplaced', 'Bez pozície'], ['out', 'Vonku'], ['inactive', 'Vyradené']].map(([k, l]) => <button type="button" key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}</div></div>
        <div className="kl-table" role="table">
          <div className="kl-tr head" role="row"><span>Pozícia</span><span>Byt</span><span>Sady</span><span>Stav</span><span>Poznámka</span><span></span></div>
          {list.map((u) => <Row key={u.listing_id} u={u} save={save} pending={pending} isAdmin={isAdmin} onReset={() => run(() => resetUnitAction({ listing_id: u.listing_id }), () => 'Stav vynulovaný, zapísané do histórie.')} />)}
          {!list.length && <p className="hint">Nič.</p>}
        </div>
      </section>
    </div>
  )
}

function Row({ u, save, pending, isAdmin, onReset }) {
  const [hook, setHook] = useState(u.hook_no == null ? '' : String(u.hook_no))
  const [sets, setSets] = useState(String(u.sets))
  const [note, setNote] = useState(u.note || '')
  const st = tileState(u)
  const dirty = hook !== (u.hook_no == null ? '' : String(u.hook_no)) || sets !== String(u.sets) || note !== (u.note || '')
  return (
    <div className={`kl-tr${u.active === false ? ' off' : ''}`} role="row">
      <span><input type="number" min={1} max={999} value={hook} onChange={(e) => setHook(e.target.value)} aria-label={`Pozícia ${u.listing_name}`} placeholder="–" /></span>
      <span className="nm">{u.listing_name}{u.manual && <em> · ručná položka</em>}{u.active === false && <em> · vyradený</em>}</span>
      <span><input type="number" min={0} max={20} value={sets} onChange={(e) => setSets(e.target.value)} aria-label={`Sady ${u.listing_name}`} /></span>
      <span><i className={`kl-dot ${st}`} />{st === 'ok' ? 'na háčiku' : st === 'none' ? 'bez sád' : `${u.out_sets}/${u.sets} vonku${u.holders && u.holders.length ? ': ' + u.holders.map((h) => h.name).join(', ') : ''}`}</span>
      <span><input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="napr. 2. sada u majiteľa" aria-label={`Poznámka ${u.listing_name}`} /></span>
      <span className="act">{dirty && <button type="button" className="btn" disabled={pending} onClick={() => save(u.listing_id, { hook_no: hook === '' ? null : Number(hook), sets: Number(sets), note })}>Uložiť</button>}{isAdmin && (u.out_sets || 0) > 0 && <button type="button" className="btn line" disabled={pending} onClick={onReset} title="Kľúče sa našli / stav nesedí: vynuluje vonku a držiteľov">Napraviť</button>}{isAdmin && <button type="button" className="btn line" disabled={pending} onClick={() => save(u.listing_id, { active: u.active === false })}>{u.active === false ? 'Zaradiť' : 'Vyradiť'}</button>}</span>
    </div>
  )
}
