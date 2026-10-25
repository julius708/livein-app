'use client'
import { useState } from 'react'

const SHOW = 3

function dayLabel(d, today) {
  if (d === today) return 'dnes'
  const diff = Math.round((Date.parse(d) - Date.parse(today)) / 864e5)
  if (diff === 1) return 'zajtra'
  if (diff === -1) return 'včera'
  return new Date(d + 'T00:00:00').toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' })
}

/** Nástenka tímu: posledné oznamy, najnovšie hore; 3 viditeľné, zvyšok na rozkliknutie. */
export default function NotesBoard({ notes = [], today }) {
  const [open, setOpen] = useState(false)
  if (!notes.length) return null
  const list = open ? notes : notes.slice(0, SHOW)
  return (
    <div className="bc notes">
      <div className="nh"><h3>📋 Nástenka tímu</h3><span>{notes.length} {notes.length === 1 ? 'oznam' : notes.length < 5 ? 'oznamy' : 'oznamov'}</span></div>
      <ul>
        {list.map((n) => (
          <li key={n.id} className={n.date === today ? 'now' : ''}>
            <span className="by">{dayLabel(n.date, today)}</span>
            <span className="who">{n.author_name}</span>
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
