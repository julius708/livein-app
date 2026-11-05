'use client'
import { fmtDay } from '@/lib/fmt'
import { useActionState, useEffect, useRef, useState } from 'react'
import { addBoardNote, markMentionsSeen } from '@/app/note/actions'

const SHOW = 3

function dayLabel(d, today) {
  if (d === today) return 'dnes'
  const diff = Math.round((Date.parse(d) - Date.parse(today)) / 864e5)
  if (diff === 1) return 'zajtra'
  if (diff === -1) return 'včera'
  return fmtDay(d)
}

/** Nástenka tímu: posledné oznamy, najnovšie hore; 3 viditeľné, zvyšok na rozkliknutie. */
function AddNote({ team, onDone }) {
  const [st, act, pending] = useActionState(addBoardNote, null)
  const [who, setWho] = useState([])
  const ref = useRef(null)
  useEffect(() => { if (st && st.ok) { ref.current && ref.current.reset(); setWho([]); onDone && onDone() } }, [st, onDone])
  const toggle = (e) => setWho((w) => (w.includes(e) ? w.filter((x) => x !== e) : [...w, e]))
  return (
    <form ref={ref} action={act} className="addnote">
      <textarea className="f" name="text" rows={2} maxLength={500} required placeholder="Napíš oznam pre tím… (max 500 znakov)" />
      {team.length > 0 && (
        <div className="forwho">
          <small>Pre koho (voliteľné, dostanú upozornenie):</small>
          <div className="people">{team.map((t) => <button type="button" key={t.email} className={who.includes(t.email) ? 'on' : ''} onClick={() => toggle(t.email)}>{t.name || t.email}</button>)}</div>
          {who.map((e) => <input key={e} type="hidden" name="for" value={e} />)}
        </div>
      )}
      <div className="row"><button className="btn o" disabled={pending}>{pending ? 'Ukladám…' : 'Pridať oznam'}</button>{st && !st.ok && <span className="msg err">{st.error}</span>}</div>
    </form>
  )
}

/** Nástenka tímu: posledné oznamy, najnovšie hore; 3 viditeľné, zvyšok na rozkliknutie; oznamy adresované mne sú zvýraznené. */
export default function NotesBoard({ notes = [], today, mentionIds = [], unseen = [], team = [] }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const mine = new Set(mentionIds), fresh = new Set(unseen)
  // oznamy pre mňa idú hore; keď ich vidím, označia sa ako prečítané
  const sorted = [...notes].sort((a, b) => (fresh.has(b.id) ? 1 : 0) - (fresh.has(a.id) ? 1 : 0))
  useEffect(() => { if (unseen.length) { const t = setTimeout(() => { markMentionsSeen() }, 4000); return () => clearTimeout(t) } }, [unseen.length])
  const list = open ? sorted : sorted.slice(0, Math.max(SHOW, unseen.length))
  return (
    <div className="bc notes" id="nastenka">
      <div className="nh"><h3>📋 Nástenka tímu</h3><span>{notes.length} {notes.length === 1 ? 'oznam' : notes.length < 5 ? 'oznamy' : 'oznamov'}{unseen.length ? ` · ${unseen.length} pre teba` : ''}</span><button type="button" className="mini" onClick={() => setAdding((a) => !a)}>{adding ? 'Zavrieť' : '+ Pridať oznam'}</button></div>
      {adding && <AddNote team={team} onDone={() => setAdding(false)} />}
      {!notes.length && <p className="hint">Zatiaľ žiadny oznam.</p>}
      <ul>
        {list.map((n) => (
          <li key={n.id} className={`${n.date === today ? 'now' : ''}${mine.has(n.id) ? ' forme' : ''}${fresh.has(n.id) ? ' fresh' : ''}`}>
            <span className="by">{dayLabel(n.date, today)}</span>
            <span className="who">{n.author_name}{mine.has(n.id) ? <em className="tag">pre teba</em> : null}</span>
            <p>{n.text}</p>
          </li>
        ))}
      </ul>
      {notes.length > SHOW && (
        <button className="more" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Zobraziť menej' : `Zobraziť všetky (${notes.length})`}
        </button>
      )}
    </div>
  )
}
