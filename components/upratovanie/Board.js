'use client'
import { useState } from 'react'
import { postAction, removePostAction } from '@/app/upratovanie/actions'
import { useRun, Msg, Pill } from './ui'

const when = (s) => new Date(s).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'short', timeStyle: 'short' })

/** Nástenka upratovania: manažérka píše a pripína, upratovačky čítajú a odpovedajú. Zdieľaná medzi manažérskym a upratovačkiným rozhraním. */
export default function Board({ posts, isManager, demo }) {
  const [text, setText] = useState('')
  const [pin, setPin] = useState(false)
  const { pending, msg, run } = useRun()
  const roots = posts.filter((p) => !p.parent_id)
  const replies = (id) => posts.filter((p) => p.parent_id === id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Nástenka</h2>
        <p className="up-hint">Oznamy a info pre kolegyne. {isManager ? 'Pripnutý oznam zostane navrchu.' : 'Môžeš odpovedať pod oznam.'}</p>
        {isManager && (
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(() => postAction(text, null, pin), { ok: 'Zverejnené.', then: () => { setText(''); setPin(false) } }) }}>
            <textarea rows="3" maxLength="1000" value={text} onChange={(e) => setText(e.target.value)} placeholder="Napíš oznam pre upratovačky…" aria-label="Nový oznam" />
            <div className="up-row"><label className="up-check"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Pripnúť navrch</label>
              <button className="btn" disabled={pending || demo || !text.trim()}>Zverejniť</button></div>
          </form>
        )}
        <Msg msg={msg} />
      </section>
      {roots.length === 0 && <section className="up-panel"><p className="up-hint">Zatiaľ tu nič nie je.</p></section>}
      {roots.map((p) => <Post key={p.id} p={p} replies={replies(p.id)} isManager={isManager} demo={demo} />)}
    </div>
  )
}

function Post({ p, replies, isManager, demo }) {
  const [text, setText] = useState('')
  const { pending, msg, run } = useRun()
  return (
    <section className={'up-panel up-post' + (p.pinned ? ' pinned' : '')}>
      <div className="up-row"><b>{p.author_name}</b><small>{when(p.created_at)}</small>{p.pinned && <Pill tone="info">📌 pripnuté</Pill>}
        {isManager && <button className="btn o" disabled={pending || demo} onClick={() => run(() => removePostAction(p.id), { ok: 'Odstránené.' })}>Odstrániť</button>}</div>
      <p className="up-text">{p.text}</p>
      {replies.map((r) => <div key={r.id} className="up-reply"><b>{r.author_name}</b> <small>{when(r.created_at)}</small><p className="up-text">{r.text}</p>{isManager && <button className="up-link" disabled={pending || demo} onClick={() => run(() => removePostAction(r.id))}>odstrániť</button>}</div>)}
      <form className="up-row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(() => postAction(text, p.id, false), { then: () => setText('') }) }}>
        <input aria-label="Odpoveď" maxLength="1000" value={text} onChange={(e) => setText(e.target.value)} placeholder="Odpovedať…" />
        <button className="btn o" disabled={pending || demo || !text.trim()}>Odoslať</button>
      </form>
      <Msg msg={msg} />
    </section>
  )
}
