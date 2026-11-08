'use client'
import { useState } from 'react'
import { useLang, Top } from './LangShell'
import { QUESTIONS, surveyText, giftText } from '@/lib/guide/survey'
import { surveyAction } from '@/app/g/actions'

/** Nepovinný dotazník hosťa v jazyku sprievodcu; po odoslaní darček (ak je nastavený). */
export default function SurveyView({ code, name, gift }) {
  const [lang, setLang] = useLang()
  const s = surveyText(lang)
  const [a, setA] = useState({}); const [email, setEmail] = useState(''); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null); const [err, setErr] = useState('')
  const set = (id, v) => setA({ ...a, [id]: v })
  const toggle = (id, v) => { const cur = a[id] || []; set(id, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]) }
  async function submit(e) { e.preventDefault(); setBusy(true); setErr(''); const r = await surveyAction(code, { lang, answers: a, email, consent }); setBusy(false); if (r && r.ok) setDone(r); else setErr(s.ui.error) }
  const answered = Object.keys(a).length
  return (
    <div className="gd" data-code={code}>
      <Top lang={lang} setLang={setLang} title={s.ui.title} sub={name} />
      <main className="gd-main">
        {done ? (
          <section className="gd-card"><h2>🎉 {s.ui.thanks}</h2>
            {done.gift && done.gift.enabled && <div className="gd-gift"><b>{s.ui.gift}</b>{done.gift.kind === 'code' ? <><span>{giftText(lang, done.gift)}</span><code>{done.gift.code}</code>{done.gift.url && <a className="gd-btn o" href={done.gift.url} target="_blank" rel="noreferrer">{s.ui.giftLink}</a>}</> : <a className="gd-btn o" href={done.gift.url} target="_blank" rel="noreferrer">{s.ui.giftLink}</a>}</div>}
            <p style={{ marginTop: 10 }}><a href={`/g/${code}`} className="gd-btn line w">← {s.ui.back}</a></p>
          </section>
        ) : (
          <form className="gd-card" onSubmit={submit}>
            <p>{s.ui.intro}</p>
            {QUESTIONS.map((q) => (
              <div className="gd-q" key={q.id}>
                <b>{s.q[q.id]} <small style={{ color: '#8A948C', fontWeight: 400 }}>({s.ui.optional})</small></b>
                {q.type === 'text' && (q.long ? <textarea className="gd-ta" maxLength={q.max} value={a[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} style={{ padding: 10, border: '1px solid #173e2c33', borderRadius: 12, font: 'inherit', minHeight: 70 }} /> : <input type="text" maxLength={q.max} value={a[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} style={{ padding: 10, border: '1px solid #173e2c33', borderRadius: 12, font: 'inherit' }} />)}
                {q.type === 'single' && <div className="gd-opts">{q.options.map((o) => <button type="button" key={o} className={a[q.id] === o ? 'on' : ''} onClick={() => set(q.id, a[q.id] === o ? undefined : o)}>{s.o[o]}</button>)}</div>}
                {q.type === 'multi' && <div className="gd-opts">{q.options.map((o) => <button type="button" key={o} className={(a[q.id] || []).includes(o) ? 'on' : ''} onClick={() => toggle(q.id, o)}>{s.o[o]}</button>)}</div>}
                {q.type === 'scale' && <div className="gd-opts">{Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map((n) => <button type="button" key={n} className={a[q.id] === n ? 'on' : ''} onClick={() => set(q.id, n)}>{n}</button>)}</div>}
              </div>
            ))}
            {gift && gift.enabled && <div className="gd-q"><b>🎁 {s.ui.gift}</b><input type="email" placeholder={s.ui.email} value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 10, border: '1px solid #173e2c33', borderRadius: 12, font: 'inherit' }} /><label className="gd-chk"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {s.ui.consent}</label></div>}
            {err && <p className="gd-err">{err}</p>}
            <button className="gd-btn o w" disabled={busy || !answered} style={{ marginTop: 10 }}>{s.ui.send}</button>
            <p className="gd-foot"><a href={`/g/${code}`} style={{ color: '#173E2C', fontWeight: 700 }}>← {s.ui.back}</a></p>
          </form>
        )}
      </main>
    </div>
  )
}
