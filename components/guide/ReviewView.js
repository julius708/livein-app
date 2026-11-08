'use client'
import { useState } from 'react'
import { useLang, Top } from './LangShell'
import { feedbackAction } from '@/app/g/actions'

/** Obe cesty vždy rovnako viditeľné, nezávisle od hodnotenia: verejná recenzia na Google a súkromná spätná väzba. */
export default function ReviewView({ code, name, address, gbpUrl }) {
  const [lang, setLang, t] = useLang()
  const [rating, setRating] = useState(0); const [text, setText] = useState(''); const [contact, setContact] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function send(e) { e.preventDefault(); setBusy(true); setErr(''); const r = await feedbackAction(code, { rating, text, contact, lang }); setBusy(false); if (r && r.ok) setDone(true); else setErr(t.fail) }
  return (
    <div className="gd" data-code={code}>
      <Top lang={lang} setLang={setLang} title={t.review} sub={[name, address].filter(Boolean).join(' · ')} />
      <main className="gd-main">
        <section className="gd-card"><p>{t.reviewIntro}</p>
          <div className="gd-choice">
            {gbpUrl ? <a className="gd-btn o w" href={gbpUrl} target="_blank" rel="noreferrer">⭐ {t.google}</a> : <p className="gd-err">{t.noGoogle}</p>}
            <a className="gd-btn line w" href="#sukromne">✉️ {t.privateFb}</a>
          </div>
        </section>
        <section className="gd-card" id="sukromne">
          <h2>✉️ {t.privateFb}</h2>
          {done ? <p>{t.thanks}</p> : (
            <form className="gd-form" onSubmit={send}>
              <label>{t.rating}<div className="gd-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n}`}>★</button>)}</div></label>
              <label>{t.fbText}<textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /></label>
              <label>{t.contact}<input type="text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} /></label>
              {err && <p className="gd-err">{err}</p>}
              <button className="gd-btn w" disabled={busy || (!text.trim() && !rating)}>{t.send}</button>
            </form>
          )}
        </section>
        <p className="gd-foot"><a href={`/g/${code}`} style={{ color: '#173E2C', fontWeight: 700 }}>← {t.back}</a></p>
      </main>
    </div>
  )
}
