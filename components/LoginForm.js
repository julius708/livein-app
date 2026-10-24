'use client'
import { useState } from 'react'
import { browserClient } from '@/lib/browser'

const ERRORS = {
  denied: 'Tento e-mail nemá prístup do LIVE-IN. Ak si člen tímu, napíš Júliusovi – pridá ťa do zoznamu.',
  expired: 'Prihlasovací odkaz už neplatí (platí 1 hodinu a dá sa použiť raz). Vyžiadaj si nový alebo sa prihlás heslom.',
  google: 'Prihlásenie cez Google sa nepodarilo. Skús heslo alebo e-mailový odkaz.',
  auth: 'Prihlásenie sa nepodarilo. Skús to znova.',
}

export default function LoginForm({ google, err }) {
  const [mode, setMode] = useState('password') // 'password' | 'link'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState(err ? { kind: 'err', text: ERRORS[err] || ERRORS.auth } : null)

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return r.json()
  }

  async function withPassword(e) {
    e.preventDefault()
    setMsg(null); setBusy(true)
    try {
      const j = await post('/api/auth/password', { email, password })
      if (j.ok) { window.location.assign(j.next || '/'); return }
      setMsg({ kind: 'err', text: j.error })
    } catch {
      setMsg({ kind: 'err', text: 'Nepodarilo sa spojiť so serverom. Skús znova.' })
    }
    setBusy(false)
  }

  async function withLink(e) {
    e.preventDefault()
    setMsg(null); setBusy(true)
    try {
      const j = await post('/api/auth/magic', { email })
      if (j.ok) setSent(true)
      else setMsg({ kind: j.code === 'rate' ? 'info' : 'err', text: j.error })
    } catch {
      setMsg({ kind: 'err', text: 'Nepodarilo sa spojiť so serverom. Skús znova.' })
    } finally { setBusy(false) }
  }

  async function withGoogle() {
    setMsg(null); setBusy(true)
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } },
    })
    if (error) { setBusy(false); setMsg({ kind: 'err', text: ERRORS.google }) }
  }

  function switchMode(m) { setMode(m); setMsg(null); setSent(false) }

  return (
    <div className="login">
      <div className="box">
        <div className="lh"><img src="/logo.png" alt="LIVE-IN" /></div>
        <h2>Vitaj späť</h2>
        <p className="term">{mode === 'password' ? 'Prihlás sa e-mailom a heslom, ktoré máš v LIVE-IN.' : 'Pošleme ti na e-mail jednorazový prihlasovací odkaz.'}</p>

        {google && (
          <>
            <button className="gbtn" onClick={withGoogle} type="button" disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
              Pokračovať cez Google
            </button>
            <div className="or">alebo</div>
          </>
        )}

        {mode === 'password' ? (
          <form onSubmit={withPassword}>
            <label className="sr" htmlFor="email">E-mail</label>
            <input id="email" className="f" type="email" required placeholder="tvoj@email.sk" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" autoFocus />
            <label className="sr" htmlFor="password">Heslo</label>
            <input id="password" className="f" type="password" required placeholder="Heslo" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button className="btn w" disabled={busy} type="submit">{busy ? 'Prihlasujem…' : 'Prihlásiť sa'}</button>
          </form>
        ) : sent ? (
          <div className="msg ok" role="status">
            <b>Odkaz je na ceste.</b><br />Otvor e-mail <b>{email}</b> a klikni na prihlasovací odkaz. Platí 1 hodinu.
            <div style={{ marginTop: 10 }}><button className="mini" type="button" onClick={() => { setSent(false); setMsg(null) }}>Poslať znova</button></div>
          </div>
        ) : (
          <form onSubmit={withLink}>
            <label className="sr" htmlFor="email2">E-mail</label>
            <input id="email2" className="f" type="email" required placeholder="tvoj@email.sk" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoFocus />
            <button className="btn w" disabled={busy} type="submit">{busy ? 'Odosielam…' : 'Poslať prihlasovací odkaz'}</button>
          </form>
        )}

        {msg && <div className={`msg ${msg.kind}`} role="alert">{msg.text}</div>}

        <div className="alt">
          {mode === 'password'
            ? <button className="lnk" type="button" onClick={() => switchMode('link')}>Zabudol/a si heslo? Pošli mi prihlasovací odkaz</button>
            : <button className="lnk" type="button" onClick={() => switchMode('password')}>Späť na prihlásenie heslom</button>}
        </div>
        <div className="foot">Interná aplikácia LIVE-IN. Prístup majú len členovia tímu.</div>
      </div>
    </div>
  )
}
