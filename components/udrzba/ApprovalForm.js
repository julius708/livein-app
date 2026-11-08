'use client'
import { useState, useTransition } from 'react'
import { decideAction } from '@/app/p/actions'

const ERR = { invalid_token: 'Tento odkaz už nie je platný.', expired: 'Platnosť odkazu uplynula. Ozvite sa prosím LIVE-IN.', already_decided: 'Toto rozhodnutie už bolo zaznamenané (odkaz sa dá použiť len raz).', superseded: 'Ponuka sa medzitým zmenila. LIVE-IN vám pošle nový odkaz s aktuálnou verziou.', not_open: 'Tento súhlas už nie je otvorený.', bad_action: 'Neplatná voľba.', server: 'Chyba servera, skúste znova.' }
/** Rozhodnutie majiteľa: až výslovné odoslanie tlačidlom (POST) rozhoduje. Zobrazenie stránky nič nemení. */
export default function ApprovalForm({ token, total }) {
  const [busy, start] = useTransition(); const [done, setDone] = useState(null); const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [mode, setMode] = useState('')
  const go = (action) => start(async () => { setErr(''); const r = await decideAction(token, action, note); if (r.ok) setDone(r.status); else setErr(ERR[r.error] || r.error) })
  if (done) return <section className="card"><h2>{{ approved: '✅ Ďakujeme, ponuku ste schválili.', declined: 'Rozumieme, ponuku ste odmietli.', question: 'Vašu otázku sme zaznamenali.' }[done]}</h2><p>{{ approved: 'Opravu objednáme u vybraného technika a dáme vám vedieť termín.', declined: 'Ozveme sa vám s ďalším postupom.', question: 'Ozveme sa vám čo najskôr a pošleme nový odkaz na rozhodnutie.' }[done]}</p></section>
  return (
    <section className="card choice">
      <h2>Vaše rozhodnutie</h2>
      {mode === '' && <>
        <button className="btn o big" disabled={busy} onClick={() => setMode('approve')}>Schvaľujem opravu za {total}</button>
        <button className="btn line big" disabled={busy} onClick={() => setMode('question')}>Mám otázku</button>
        <button className="btn line big" disabled={busy} onClick={() => setMode('decline')}>Odmietam</button>
      </>}
      {mode === 'approve' && <><p>Potvrdzujete objednanie opravy v uvedenom rozsahu a cene (strop {total}). Zmena ceny alebo rozsahu by si vyžiadala nový súhlas.</p><button className="btn o big" disabled={busy} onClick={() => go('approved')}>{busy ? 'Odosielam…' : 'Áno, záväzne schvaľujem'}</button><button className="btn line" onClick={() => setMode('')}>Späť</button></>}
      {mode !== '' && mode !== 'approve' && <><label>{mode === 'question' ? 'Vaša otázka' : 'Dôvod (nepovinné)'}<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label><button className="btn big" disabled={busy || (mode === 'question' && note.trim().length < 3)} onClick={() => go(mode === 'question' ? 'question' : 'declined')}>{busy ? 'Odosielam…' : mode === 'question' ? 'Odoslať otázku' : 'Potvrdiť odmietnutie'}</button><button className="btn line" onClick={() => setMode('')}>Späť</button></>}
      {err && <p className="err">{err}</p>}
    </section>
  )
}
