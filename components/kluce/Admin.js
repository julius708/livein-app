'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveUnitAction, resetUnitAction, saveRowsAction, syncUnitsAction, addManualUnitAction } from '@/app/kluce/actions'
import { sortUnits, matches, tileState } from '@/lib/keys-core'

/** Správa kľúčov: načítanie bytov z registra, lišty na stene, pozícia a počet sád pre každý byt, náprava stavu. */
export default function KeysAdmin({ units = [], rows = [], overdueHours = 24, persons = [], isAdmin = false }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState(null)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('all')
  const [rw, setRw] = useState(rows.map((r) => ({ ...r })))
  const [hours, setHours] = useState(overdueHours)
  const [names, setNames] = useState(persons.map((p) => p.name).join('\n'))
  const [nu, setNu] = useState({ name: '', hook_no: '', sets: 1, note: '', address: '', detail: '' })
  const list = useMemo(() => sortUnits(units).filter((u) => matches(u, q)).filter((u) => only === 'all' ? true : only === 'unplaced' ? u.hook_no == null && u.active !== false : only === 'out' ? (u.out_sets || 0) > 0 : u.active === false), [units, q, only])
  const run = (fn, okText) => start(async () => { const r = await fn(); setMsg(r && r.ok ? { ok: okText(r) } : { err: (r && r.error) || 'Nepodarilo sa.' }); if (r && r.ok) router.refresh() })
  const save = (listing_id, patch) => run(() => saveUnitAction({ listing_id, ...patch }), () => 'Uložené.')
  const used = new Set(units.filter((u) => u.hook_no != null).map((u) => u.hook_no))
  const free = []; for (const r of rows) for (let n = r.from; n <= r.to && free.length < 400; n++) if (!used.has(n)) free.push(n)

  return (
    <div className="kl-admin">
      {msg && <div className={`kl-msg ${msg.err ? 'err' : 'ok'}`} role="status">{msg.err || msg.ok}</div>}
      <section className="card">
        <h2>Pridať kľúč</h2>
        <p className="hint">Kľúč, ktorý nie je v Guesty (parkovanie, pivnica, náhradná sada, byt mimo registra). Byty z Guesty pribudnú samy cez „Načítať byty z registra“ nižšie.</p>
        <div className="row kl-new">
          <label>Názov<input type="text" maxLength={80} value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="napr. Parkovanie 25, Modrá guľa" /></label>
          <label>Pozícia<input type="number" min={1} max={999} value={nu.hook_no} onChange={(e) => setNu({ ...nu, hook_no: e.target.value })} placeholder="–" /></label>
          <label>Sady<input type="number" min={0} max={20} value={nu.sets} onChange={(e) => setNu({ ...nu, sets: e.target.value })} /></label>
          <label>Adresa<input type="text" maxLength={200} value={nu.address} onChange={(e) => setNu({ ...nu, address: e.target.value })} placeholder="ulica a číslo" /></label>
          <label>Poschodie / byt<input type="text" maxLength={200} value={nu.detail} onChange={(e) => setNu({ ...nu, detail: e.target.value })} placeholder="napr. 3. poschodie · byt 12" /></label>
          <label>Poznámka<input type="text" maxLength={300} value={nu.note} onChange={(e) => setNu({ ...nu, note: e.target.value })} placeholder="voliteľné" /></label>
          <button type="button" className="btn" disabled={pending || !nu.name.trim()} onClick={() => run(() => addManualUnitAction({ name: nu.name, hook_no: nu.hook_no === '' ? null : Number(nu.hook_no), sets: Number(nu.sets), note: nu.note, address: nu.address, detail: nu.detail }), () => { setNu({ name: '', hook_no: '', sets: 1, note: '', address: '', detail: '' }); return 'Kľúč pridaný.' })}>Pridať</button>
        </div>
      </section>

      <section className="card">
        <h2>Byty v evidencii <small>{units.filter((u) => u.active !== false).length} aktívnych · {units.filter((u) => u.hook_no != null).length} s pozíciou</small></h2>
        <p className="hint">Pri každom kľúči zmeň pozíciu, počet sád alebo poznámku a klikni Uložiť. „Vyradiť“ skryje kľúč z tabule (história ostáva), „Zaradiť“ ho vráti. Nové byty z Guesty pribudnú s jednou sadou a bez pozície; čísla idú zľava doprava po celých lištách.</p>
        <div className="row"><button type="button" className="btn" disabled={pending} onClick={() => run(syncUnitsAction, (r) => `Načítané: ${r.added} nových, ${r.renamed} premenovaných, ${r.deactivated} vyradených.`)}>Načítať byty z registra</button><span className="hint">Voľné pozície: {free.slice(0, 30).join(', ')}{free.length > 30 ? '…' : ''}{!free.length && 'žiadne'}</span></div>
      </section>

      {isAdmin && (
        <section className="card">
          <h2>Lišty na stene</h2>
          <p className="hint">Každá lišta má rozsah pozícií. Keď stenu preusporiadaš, zmeň tu rozsahy; pozície bytov uprav v tabuľke nižšie. História pohybov ostáva.</p>
          <div className="kl-rows">
            {rw.map((r, i) => <div className="kl-rowedit" key={i}><label>Lišta<input type="number" min={1} value={r.row} onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, row: Number(e.target.value) } : y))} /></label><label>Od<input type="number" min={1} max={999} value={r.from} onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, from: Number(e.target.value) } : y))} /></label><label>Do<input type="number" min={1} max={999} value={r.to} onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, to: Number(e.target.value) } : y))} /></label><label>Popis<input type="text" maxLength={40} value={r.label || ''} placeholder="napr. horná" onChange={(e) => setRw((x) => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} /></label><button type="button" className="btn line" onClick={() => setRw((x) => x.filter((_, j) => j !== i))}>Odobrať</button></div>)}
          </div>
          <div className="row"><button type="button" className="btn line" onClick={() => setRw((x) => [...x, { row: x.length + 1, from: (x[x.length - 1]?.to || 0) + 1, to: (x[x.length - 1]?.to || 0) + 20 }])}>Pridať lištu</button><label className="inl">Upozorniť po<input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} /> h vonku</label></div>
          <h2 style={{ marginTop: 14 }}>Mená v ponuke „Kto“</h2>
          <p className="hint">Jedno meno na riadok, v tomto poradí sa ukážu na kiosku. Prázdne = odvodiť z účtov appky.</p>
          <textarea className="kl-names" rows={6} value={names} onChange={(e) => setNames(e.target.value)} aria-label="Mená v ponuke" />
          <div className="row"><button type="button" className="btn" disabled={pending} onClick={() => run(() => saveRowsAction({ rows: rw, overdueHours: hours, persons: names }), () => 'Nastavenia uložené.')}>Uložiť lišty a mená</button></div>
        </section>
      )}

      <section className="card">
        <div className="row"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt alebo pozíciu…" aria-label="Hľadať" /><div className="kl-filters">{[['all', 'Všetky'], ['unplaced', 'Bez pozície'], ['out', 'Vonku'], ['inactive', 'Vyradené']].map(([k, l]) => <button type="button" key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}</div></div>
        <div className="kl-table" role="table">
          <div className="kl-tr head" role="row"><span>Pozícia</span><span>Byt</span><span>Sady</span><span>Stav</span><span>Adresa · poschodie / byt · poznámka</span><span></span></div>
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
  const [address, setAddress] = useState(u.address || '')
  const [detail, setDetail] = useState(u.detail || '')
  const st = tileState(u)
  const dirty = hook !== (u.hook_no == null ? '' : String(u.hook_no)) || sets !== String(u.sets) || note !== (u.note || '') || address !== (u.address || '') || detail !== (u.detail || '')
  return (
    <div className={`kl-tr${u.active === false ? ' off' : ''}`} role="row">
      <span><input type="number" min={1} max={999} value={hook} onChange={(e) => setHook(e.target.value)} aria-label={`Pozícia ${u.listing_name}`} placeholder="–" /></span>
      <span className="nm">{u.listing_name}{u.manual && <em> · ručná položka</em>}{u.active === false && <em> · vyradený</em>}</span>
      <span><input type="number" min={0} max={20} value={sets} onChange={(e) => setSets(e.target.value)} aria-label={`Sady ${u.listing_name}`} /></span>
      <span><i className={`kl-dot s-${st}`} />{st === 'ok' ? 'na háčiku' : st === 'none' ? 'bez sád' : `${u.out_sets}/${u.sets} vonku${u.holders && u.holders.length ? ': ' + u.holders.map((h) => h.name).join(', ') : ''}`}</span>
      <span className="kl-tr-txt"><input type="text" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="adresa" aria-label={`Adresa ${u.listing_name}`} /><input type="text" maxLength={200} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="poschodie / byt" aria-label={`Poschodie ${u.listing_name}`} /><input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" aria-label={`Poznámka ${u.listing_name}`} /></span>
      <span className="act">{dirty && <button type="button" className="btn" disabled={pending} onClick={() => save(u.listing_id, { hook_no: hook === '' ? null : Number(hook), sets: Number(sets), note, address, detail })}>Uložiť</button>}{isAdmin && (u.out_sets || 0) > 0 && <button type="button" className="btn line" disabled={pending} onClick={onReset} title="Kľúče sa našli / stav nesedí: vynuluje vonku a držiteľov">Napraviť</button>}<button type="button" className="btn line" disabled={pending} onClick={() => save(u.listing_id, { active: u.active === false })} title={u.active === false ? 'Vrátiť na tabuľu' : 'Skryť z tabule (história ostáva)'}>{u.active === false ? 'Zaradiť' : 'Vyradiť'}</button></span>
    </div>
  )
}
