'use client'
import { useRef, useState, useTransition } from 'react'
import { ROLES } from '@/lib/modules'
import { addUser, updateUser, removeUser, resetPassword } from '@/app/admin/users/actions'

const EMPTY = { email: '', name: '', title: '', scope_city: '', roles: [] }

function fmt(iso) {
  if (!iso) return 'ešte nikdy'
  return new Date(iso).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' })
}

function RoleChips({ value, onChange, idp }) {
  return (
    <div className="roles">
      {Object.entries(ROLES).map(([k, v]) => {
        const on = value.includes(k)
        return (
          <label key={k} className={on ? 'on' : ''}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} name={`${idp}-${k}`} />
            {v}
          </label>
        )
      })}
    </div>
  )
}

export default function UsersAdmin({ initial, logins, cities, orphans, myEmail, defaultPassword }) {
  const [rows, setRows] = useState(initial)
  const [flags, setFlags] = useState(() => { const f = {}; for (const k of Object.keys(logins)) f[k] = !!logins[k].mustChange; return f })
  const [orph, setOrph] = useState(orphans)
  const [status, setStatus] = useState({})
  const [form, setForm] = useState(EMPTY)
  const [formMsg, setFormMsg] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, start] = useTransition()
  const formRef = useRef(null)

  function flash(email, kind, text) {
    setStatus((s) => ({ ...s, [email]: { kind, text } }))
    if (kind === 'ok') setTimeout(() => setStatus((s) => { const c = { ...s }; if (c[email] && c[email].kind === 'ok') delete c[email]; return c }), 2500)
  }

  function save(email, patch) {
    start(async () => {
      const r = await updateUser(email, patch)
      if (r.ok) {
        if (r.user) setRows((rs) => rs.map((x) => (x.email === email ? r.user : x)))
        flash(email, 'ok', 'Uložené ✓')
      } else flash(email, 'err', r.error)
    })
  }

  function reset(email) {
    start(async () => {
      const r = await resetPassword(email)
      if (r.ok) { setFlags((f) => ({ ...f, [email]: true })); flash(email, 'ok', `Heslo nastavené na „${defaultPassword}“ – pri prihlásení si ho zmení.`) }
      else flash(email, 'err', r.error)
    })
  }

  function del(email) {
    start(async () => {
      const r = await removeUser(email)
      if (r.ok) { setRows((rs) => rs.filter((x) => x.email !== email)); setConfirmDel(null) }
      else flash(email, 'err', r.error)
    })
  }

  function add(e) {
    e.preventDefault()
    setFormMsg(null)
    start(async () => {
      const r = await addUser(form)
      if (r.ok) {
        setRows((rs) => [...rs, r.user].sort((a, b) => a.name.localeCompare(b.name, 'sk')))
        setOrph((o) => o.filter((x) => x.email !== r.user.email))
        setForm(EMPTY)
        setFlags((f) => ({ ...f, [r.user.email]: true }))
        setFormMsg({ kind: 'ok', text: r.account
          ? `${r.user.name} je pridaný/á. Prihlási sa e-mailom ${r.user.email} a dočasným heslom „${defaultPassword}“ – pri prvom prihlásení si ho zmení.`
          : `${r.user.name} je pridaný/á, ale účet sa nepodarilo vytvoriť (${r.accountError || 'neznáma chyba'}). Skús „Reset hesla“.` })
      } else setFormMsg({ kind: 'err', text: r.error })
    })
  }

  function prefill(o) {
    const guess = o.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim()
    setForm({ ...EMPTY, email: o.email, name: guess ? guess.replace(/\b\w/g, (c) => c.toUpperCase()) : '' })
    setFormMsg(null)
    formRef.current && formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <section className="card" ref={formRef}>
        <h2>Pridať človeka</h2>
        <p className="sub">Prihlásiť sa môže len e-mail z tohto zoznamu. Nové záznamy platia okamžite – stačí poslať kolegovi adresu appky.</p>
        <form onSubmit={add}>
          <div className="grid3">
            <div><label className="lb" htmlFor="n-email">E-mail</label><input id="n-email" className="f" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="meno@live-in.international" autoComplete="off" /></div>
            <div><label className="lb" htmlFor="n-name">Meno a priezvisko</label><input id="n-name" className="f" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jana Nováková" autoComplete="off" /></div>
            <div><label className="lb" htmlFor="n-title">Pozícia (voliteľné)</label><input id="n-title" className="f" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Property manager" autoComplete="off" /></div>
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <div>
              <label className="lb">Roly</label>
              <RoleChips value={form.roles} onChange={(roles) => setForm({ ...form, roles })} idp="new" />
            </div>
            <div>
              <label className="lb" htmlFor="n-city">Mesto (obmedzenie)</label>
              <select id="n-city" className="f" value={form.scope_city} onChange={(e) => setForm({ ...form, scope_city: e.target.value })}>
                <option value="">Všetky mestá</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Ukladám…' : 'Pridať'}</button>
            {formMsg && <span className={`msg ${formMsg.kind}`} style={{ marginTop: 0 }}>{formMsg.text}</span>}
          </div>
        </form>
      </section>

      {orph.length > 0 && (
        <section className="card">
          <h2>Účty mimo zoznamu</h2>
          <p className="sub">Tieto e-maily sa už niekedy prihlásili do LIVE-IN systémov, ale v zozname nie sú – do appky sa nedostanú. Ak patria kolegom, pridaj ich (často ide o inú adresu toho istého človeka).</p>
          {orph.map((o) => (
            <div className="orph" key={o.email}>
              <div><b>{o.email}</b><div className="last">naposledy prihlásený: {fmt(o.last_sign_in_at)}</div></div>
              <button className="mini" type="button" onClick={() => prefill(o)}>Pridať do zoznamu</button>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Používatelia <span className="tag">{rows.length}</span></h2>
        <p className="sub">Zmeny sa ukladajú hneď. Vypnutý používateľ sa neprihlási, ale jeho záznam zostane. „Reset hesla“ nastaví dočasné heslo „{defaultPassword}“, ktoré si človek pri prihlásení musí zmeniť.</p>
        <table className="tbl">
          <thead><tr><th>Človek</th><th>Roly</th><th>Mesto</th><th>Prihlásenie</th><th>Akcie</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = status[r.email]
              const lg = logins[r.email]
              const isMe = r.email === myEmail
              return (
                <tr key={r.email} className={r.active ? '' : 'off'}>
                  <td data-l="Človek">
                    <input className="f sm" key={`n-${r.email}-${r.updated_at}`} defaultValue={r.name} aria-label="Meno" onBlur={(e) => { const v = e.target.value.trim(); if (v !== r.name) save(r.email, { name: v }) }} />
                    <input className="f sm" key={`t-${r.email}-${r.updated_at}`} defaultValue={r.title || ''} placeholder="Pozícia" aria-label="Pozícia" style={{ marginTop: 6 }} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.title || '')) save(r.email, { title: v }) }} />
                    <div className="em" style={{ marginTop: 6 }}>{r.email}{isMe && <span className="tag o" style={{ marginLeft: 6 }}>ty</span>}</div>
                    <div className={`row-st ${st && st.kind === 'err' ? 'err' : ''}`}>{st ? st.text : ''}</div>
                  </td>
                  <td data-l="Roly"><RoleChips value={r.roles || []} onChange={(roles) => save(r.email, { roles })} idp={r.email} /></td>
                  <td data-l="Mesto">
                    <select className="f sm" value={r.scope_city || ''} aria-label="Mesto" onChange={(e) => save(r.email, { scope_city: e.target.value })}>
                      <option value="">Všetky</option>
                      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                      {r.scope_city && !cities.includes(r.scope_city) && <option value={r.scope_city}>{r.scope_city}</option>}
                    </select>
                  </td>
                  <td data-l="Prihlásenie">
                    <div className="last">{lg ? fmt(lg.last) : 'ešte nikdy'}</div>
                    {lg && lg.providers.includes('google') && <span className="tag" style={{ marginTop: 4 }}>Google</span>}
                    {flags[r.email] && <span className="tag warn" style={{ marginTop: 4 }}>dočasné heslo</span>}
                    {!lg && <span className="tag off" style={{ marginTop: 4 }}>bez účtu</span>}
                  </td>
                  <td data-l="Akcie">
                    <div className="actions">
                      <button className="mini" type="button" disabled={busy || isMe} onClick={() => save(r.email, { active: !r.active })}>{r.active ? 'Vypnúť' : 'Zapnúť'}</button>
                      {r.active && <button className="mini" type="button" disabled={busy} onClick={() => reset(r.email)}>Reset hesla</button>}
                      {confirmDel === r.email ? (
                        <>
                          <button className="mini danger" type="button" disabled={busy} onClick={() => del(r.email)}>Naozaj odstrániť</button>
                          <button className="mini" type="button" onClick={() => setConfirmDel(null)}>Nie</button>
                        </>
                      ) : (
                        !isMe && <button className="mini danger" type="button" disabled={busy} onClick={() => setConfirmDel(r.email)}>Odstrániť</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </>
  )
}
