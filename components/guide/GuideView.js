'use client'
import { useEffect, useState } from 'react'
import { useLang, Top } from './LangShell'
import { pick } from './i18n'
import { surveyText } from '@/lib/guide/survey'
import { confirmEmailAction } from '@/app/g/actions'

const fmtDate = (iso, lang) => (iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '')

/** Prihlásenie hosťa: meno + e-mail z rezervácie → server spáruje s aktívnou rezerváciou a odomkne súkromný obsah (cookie do konca pobytu). */
function Login({ code, t, onUnlock }) {
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const r = await fetch('/api/g/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, email, name }), cache: 'no-store', credentials: 'same-origin' })
      const j = await r.json().catch(() => ({}))
      if (j.ok) onUnlock(j); else setErr(t.fail)
    } catch { setErr(t.fail) } finally { setBusy(false) }
  }
  return (
    <section className="gd-card wifi" id="login">
      <h2>🔐 {t.login}</h2>
      <form className="gd-form" onSubmit={submit} autoComplete="off">
        <p>{t.loginIntro}</p>
        <label>{t.name}<input type="text" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>{t.email}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
        {err && <p className="gd-err">{err}</p>}
        <button className="gd-btn o w" disabled={busy}>{busy ? t.checking : t.unlock}</button>
      </form>
    </section>
  )
}
/** Wi-Fi po prihlásení: sieť, heslo, kopírovanie, potvrdenie e-mailu (heslo ostáva len v pamäti stránky). */
function WifiBox({ priv, t }) {
  const [copied, setCopied] = useState(false); const [conf, setConf] = useState({ done: false })
  const wifi = priv.wifi
  async function copy() { try { await navigator.clipboard.writeText(wifi.password); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }
  const [newsletter, setNewsletter] = useState(false)
  async function saveConf() { const r = await confirmEmailAction(priv.confirm, { newsletter }); setConf({ done: !!(r && r.ok) }) }
  return (
    <section className="gd-card wifi" id="wifi">
      <h2>📶 {t.wifi}</h2>
      {wifi ? (
        <div className="gd-wifi">
          <div><small>{t.network}</small><div className="ssid">{wifi.ssid}</div></div>
          <div><small>{t.password}</small><div className="pw">{wifi.password}</div></div>
          <button type="button" className="gd-btn o" onClick={copy}>{copied ? t.copied : t.copy}</button>
          {priv.confirm && !conf.done ? <div className="gd-form" style={{ marginTop: 6 }}>
            <label>
              <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
              {' '}{t.newsletter}
            </label>
            <button type="button" className="gd-btn line" onClick={saveConf}>{t.confirm}</button>
          </div> : conf.done ? <p>{t.saved}</p> : null}
        </div>
      ) : <p>{t.nothing}</p>}
    </section>
  )
}
/** Zámok na citlivom obsahu pred prihlásením. */
function Locked({ t }) { return <p className="gd-locked"><span aria-hidden="true">🔒</span> {t.locked} <a href="#login">{t.goLogin}</a></p> }

/** Rozklikávacia sekcia (natívne <details>: prístupné, bez JS). */
function Acc({ icon, title, children, open = false, className = '' }) {
  return <details className={`gd-acc ${className}`} open={open}><summary><span className="gd-acc-ic" aria-hidden="true">{icon}</span><span className="gd-acc-t">{title}</span><span className="gd-acc-ch" aria-hidden="true">▾</span></summary><div className="gd-acc-b">{children}</div></details>
}
/** Položky sekcie: nadpis → text (každá sa dá rozkliknúť). */
function Items({ items, lang }) {
  return <div className="gd-items">{items.map((it, i) => { const title = pick(it.title, lang), body = pick(it.body, lang); if (!title && !body) return null; return title && body ? <details key={i} className="gd-item"><summary>{title}</summary><p>{body}</p></details> : <p key={i} className="gd-item-p"><b>{title}</b>{body}</p> })}</div>
}
/** Odškrtávací zoznam (lokálne v prehliadači, nič sa neodosiela). */
function Checklist({ code, text, label }) {
  const lines = String(text || '').split(/\n+|(?<=[.!?])\s+(?=[A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ0-9])/).map((x) => x.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter((x) => x.length > 3).slice(0, 12)
  const key = `gd-chk-${code}`
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } })
  if (!lines.length) return null
  const toggle = (i) => { const n = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]; setDone(n); try { localStorage.setItem(key, JSON.stringify(n)) } catch {} }
  return <div className="gd-checklist"><small>{label}</small>{lines.map((l, i) => <label key={i} className={`gd-chk ${done.includes(i) ? 'on' : ''}`}><input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} /><span>{l}</span></label>)}</div>
}
const steps = (text) => String(text || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)

export default function GuideView({ code, data, survey = true }) {
  const [lang, setLang, t] = useLang()
  const su = surveyText(lang).ui
  const { unit, card, rules, tips, events, support_phone } = data
  const [priv, setPriv] = useState(null)   // súkromný obsah po prihlásení hosťa (cookie platí do konca pobytu)
  useEffect(() => { fetch(`/api/g/private?code=${code}`, { cache: 'no-store', credentials: 'same-origin' }).then((r) => r.json()).then((j) => { if (j && j.ok) setPriv(j) }).catch(() => {}) }, [code])
  const logout = async () => { try { await fetch('/api/g/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, logout: true }), credentials: 'same-origin' }) } catch {} setPriv(null) }
  const full = priv ? { ...card, ...priv, sections: [...(card.sections || []), ...(priv.sections || [])] } : card
  const address = card.address || unit.address || ''
  const mapQ = card.lat && card.lng ? `${card.lat},${card.lng}` : address
  const nav = card.map_url || (mapQ ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQ)}` : '')
  const tel = String(support_phone || '').replace(/\s+/g, '')
  const [copiedAddr, setCopiedAddr] = useState(false)
  const copyAddr = async () => { try { await navigator.clipboard.writeText(address); setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1800) } catch {} }
  const share = async () => { const url = typeof location !== 'undefined' ? location.href : ''; try { if (navigator.share) await navigator.share({ title: unit.name || t.title, url }); else { await navigator.clipboard.writeText(url) } } catch {} }
  const reportHref = `mailto:udrzba@live-in.international?subject=${encodeURIComponent(`${t.report}: ${unit.name || ''} (${code})`)}&body=${encodeURIComponent(t.reportHint + '\n\n')}`
  // pravidlá: výnimka bytu nahrádza spoločné; spoločné pravidlá majú nadpis (rozklik) alebo len text
  const override = card.rules_override && pick(card.rules_override, lang)
  const ruleItems = override ? [{ title: { sk: '', en: '' }, body: card.rules_override }] : rules.map((r) => ({ title: r.title || { sk: '', en: '' }, body: r.body }))
  const sections = Array.isArray(full.sections) ? full.sections : []
  const secRules = sections.find((x) => x.key === 'house_rules')
  const other = sections.filter((x) => x.key !== 'house_rules')
  const arrivalSteps = steps(pick(full.arrival, lang))
  return (
    <div className="gd" data-code={code}>
      <Top lang={lang} setLang={setLang} title={unit.name || t.title} sub={address} />
      <main className="gd-main">
        <nav className="gd-chips" aria-label={t.info}>
          {nav && <a className="gd-chip" href={nav} target="_blank" rel="noreferrer">🧭 {t.navigate}</a>}
          {tel && <a className="gd-chip" href={`tel:${tel}`}>📞 {t.call}</a>}
          <a className="gd-chip" href={priv ? '#wifi' : '#login'}>{priv ? '📶 ' + t.wifi : '🔐 ' + t.login}</a>
          <a className="gd-chip" href={reportHref}>🛠️ {t.report}</a>
          <button type="button" className="gd-chip" onClick={share}>↗ {t.share}</button>
        </nav>
        {priv ? <><p className="gd-session"><span>✅ {t.loggedIn}</span><button type="button" onClick={logout}>{t.logout}</button></p><WifiBox priv={priv} t={t} /></> : <Login code={code} t={t} onUnlock={setPriv} />}
        <section className="gd-card">
          <h2>📍 {t.address}</h2>
          <div className="gd-taxi"><small>{t.taxi}</small><b>{address || '—'}</b>{priv && pick(full.address_note, lang) && <span style={{ display: 'block', marginTop: 6, fontSize: 14 }}>{pick(full.address_note, lang)}</span>}</div>
          <div className="gd-row">{nav && <a className="gd-btn" href={nav} target="_blank" rel="noreferrer">🧭 {t.navigate}</a>}{address && <button type="button" className="gd-btn line" onClick={copyAddr}>{copiedAddr ? t.copied : t.copyAddr}</button>}</div>
          {mapQ && <iframe className="gd-map" title={t.map} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQ)}&z=16&output=embed`} />}
          {(card.checkin_time || card.checkout_time) && <p className="gd-times">{card.checkin_time && <span>🚪 {t.checkinFrom} <b>{card.checkin_time}</b></span>}{card.checkout_time && <span>🧳 {t.checkoutAt} <b>{card.checkout_time}</b></span>}</p>}
        </section>
        <Acc icon="🚪" title={t.arrival} open>{!priv ? <Locked t={t} /> : arrivalSteps.length > 1 ? <ol className="gd-steps">{arrivalSteps.map((x, i) => <li key={i}>{x.replace(/^\d+[.)]\s*/, '')}</li>)}</ol> : <p>{pick(full.arrival, lang) || t.nothing}</p>}</Acc>
        <Acc icon="🅿️" title={t.parking}><p>{pick(card.parking, lang) || t.nothing}</p></Acc>
        <Acc icon="📋" title={t.rules}>
          {secRules && <Items items={secRules.items} lang={lang} />}
          {!override && secRules && rules.length > 0 && <small className="gd-sub">{t.stdRules}</small>}
          {ruleItems.length ? <Items items={ruleItems} lang={lang} /> : !secRules && <p>{t.nothing}</p>}
        </Acc>
        {other.map((sec, i) => <Acc key={sec.key + i} icon={sec.icon || '•'} title={pick(sec.title, lang) || sec.key}><Items items={sec.items || []} lang={lang} /></Acc>)}
        <Acc icon="🧳" title={t.checkout}>
          {card.checkout_time && <p><b>{t.checkoutAt} {card.checkout_time}</b></p>}
          {!priv ? <Locked t={t} /> : <><p>{pick(full.checkout, lang) || t.nothing}</p><Checklist code={code} text={pick(full.checkout, lang)} label={t.checklist} /></>}
        </Acc>
        <Acc icon="✨" title={t.tips} open={tips.length > 0}>{tips.length ? tips.map((x, i) => <div key={i} className="gd-tip"><b>{pick(x.title, lang)}</b><span>{pick(x.body, lang)}</span>{x.url && <a href={x.url} target="_blank" rel="noreferrer">→</a>}</div>) : <p>{t.nothing}</p>}</Acc>
        {events.length > 0 && <Acc icon="🎉" title={t.events}>{events.map((x, i) => <div key={i} className="gd-tip"><b>{pick(x.title, lang)}</b><small>{fmtDate(x.starts_at, lang)}{x.place ? ` · ${x.place}` : ''}</small><span>{pick(x.body, lang)}</span>{x.url && <a href={x.url} target="_blank" rel="noreferrer">→</a>}</div>)}</Acc>}
        {survey && <section className="gd-card survey"><h2>🎁 {su.surveyCard}</h2><p>{su.surveyCardSub}</p><a className="gd-btn w" href={`/g/${code}/dotaznik`}>{su.fill}</a></section>}
        <section className="gd-card"><h2>🆘 {t.help}</h2><div className="gd-help">{pick(card.help, lang) && <p>{pick(card.help, lang)}</p>}{tel ? <a className="gd-btn w" href={`tel:${tel}`}>📞 {t.call} {support_phone}</a> : <p className="gd-err">{t.nothing}</p>}<a className="gd-btn line w" href={reportHref}>🛠️ {t.report}</a></div></section>
        <p className="gd-foot">LIVE-IN International</p>
      </main>
    </div>
  )
}
