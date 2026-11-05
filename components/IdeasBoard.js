'use client'
import { fmtDate } from '@/lib/fmt'
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { addIdea, setIdeaStatus } from '@/app/napady/actions'

export const STATUS = { new: 'Nový', selected: 'Vybraný', script_done: 'Scenár hotový' }
const fmt = (d) => fmtDate(d)

function Card({ idea }) {
  const [busy, start] = useTransition()
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const set = (status) => start(async () => { setErr(''); const fd = new FormData(); fd.set('id', idea.id); fd.set('status', status); const r = await setIdeaStatus(fd); if (r && !r.ok) setErr(r.error) })
  const copy = async () => { try { await navigator.clipboard.writeText(idea.script || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  return (
    <li className={`card idea ${idea.status}`}>
      <h3>{idea.title}</h3>
      <p className="desc">{idea.description}</p>
      <p className="meta">{idea.author_name} · {fmt(idea.created_at)}</p>
      <div className="seg" role="group" aria-label="Stav">
        {Object.entries(STATUS).map(([k, v]) => <button key={k} type="button" className={idea.status === k ? `on ${k}` : ''} disabled={busy} aria-pressed={idea.status === k} onClick={() => idea.status !== k && set(k)}>{v}</button>)}
      </div>
      {err && <p className="msg err">{err}</p>}
      {idea.script ? (
        <div className="script">
          <div className="sh"><b>🎬 Scenár</b><button type="button" className="mini" onClick={copy}>{copied ? 'Skopírované ✓' : 'Kopírovať'}</button></div>
          <p>{idea.script}</p>
        </div>
      ) : <p className="noscript">Scenár doplní marketing.</p>}
    </li>
  )
}

function NewIdea({ onClose }) {
  const [st, act, pending] = useActionState(addIdea, null)
  const ref = useRef(null)
  useEffect(() => { if (st && st.ok) { ref.current && ref.current.reset(); onClose(true) } }, [st, onClose])
  return (
    <div className="sheet-bg" onClick={() => onClose(false)}>
      <form ref={ref} action={act} className="sheet card" onClick={(e) => e.stopPropagation()}>
        <h2>Nový nápad</h2>
        <label>Názov<input className="f" name="title" maxLength={80} required autoFocus placeholder="napr. Hosť nevie otvoriť bránu" /></label>
        <label>Popis situácie<textarea className="f" name="description" rows={5} maxLength={2000} required placeholder="Čo sa stalo, kde, ako sme to vyriešili…" /></label>
        <p className="hint">🎤 Ťukni na mikrofón na klávesnici a nadiktuj, čo sa stalo.</p>
        {st && !st.ok && <p className="msg err">{st.error}</p>}
        <div className="row">
          <button type="button" className="ghost" onClick={() => onClose(false)}>Zrušiť</button>
          <button className="btn o" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť nápad'}</button>
        </div>
      </form>
    </div>
  )
}

export default function IdeasBoard({ ideas }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return ideas.filter((i) => filter === 'all' || i.status === filter).filter((i) => !t || `${i.title} ${i.description} ${i.author_name} ${i.script || ''}`.toLowerCase().includes(t))
  }, [ideas, filter, q])
  const count = (k) => ideas.filter((i) => i.status === k).length
  const close = (ok) => { setOpen(false); if (ok) { setSaved(true); setFilter('all'); setTimeout(() => setSaved(false), 2500) } }
  return (
    <div className="ideas">
      <input className="f search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať v nápadoch…" aria-label="Hľadať" />
      <div className="chips">
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Všetky <span>{ideas.length}</span></button>
        {Object.entries(STATUS).map(([k, v]) => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{v} <span>{count(k)}</span></button>)}
      </div>
      {saved && <p className="msg ok">Nápad uložený. Ďakujeme!</p>}
      <ul className="ideas-list">
        {list.map((i) => <Card key={i.id} idea={i} />)}
        {list.length === 0 && <li className="empty">{ideas.length ? 'Nič sa nenašlo.' : 'Zatiaľ žiadny nápad. Buď prvý/á.'}</li>}
      </ul>
      <div className="addbar"><button type="button" className="btn o add" onClick={() => setOpen(true)}>+ Pridať nápad</button></div>
      {open && <NewIdea onClose={close} />}
    </div>
  )
}
