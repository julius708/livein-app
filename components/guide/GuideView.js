'use client'
import { useState } from 'react'
import { useLang, Top } from './LangShell'
import { pick } from './i18n'
import { confirmEmailAction } from '@/app/g/actions'

const fmtDate = (iso, lang) => (iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) : '')

function Wifi({ code, t }) {
  const [email, setEmail] = useState(''); const [res, setRes] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [wifi, setWifi] = useState(null); const [copied, setCopied] = useState(false); const [conf, setConf] = useState({ confirm: true, newsletter: false, done: false })
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      // POST, odpoveď s hlavičkou no-store; heslo ostáva len v pamäti stránky (nie v URL, histórii ani úložisku)
      const r = await fetch('/api/g/wifi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, email, reservation: res }), cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (j.ok) { setWifi(j); setRes(''); } else setErr(t.fail)
    } catch { setErr(t.fail) } finally { setBusy(false) }
  }
  async function copy() { try { await navigator.clipboard.writeText(wifi.password); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }
  async function saveConf() { const r = await confirmEmailAction(wifi.confirm, { newsletter: conf.newsletter }); setConf({ ...conf, done: !!(r && r.ok) }) }
  return (
    <section className="gd-card wifi">
      <h2>📶 {t.wifi}</h2>
      {!wifi ? (
        <form className="gd-form" onSubmit={submit} autoComplete="off">
          <p>{t.wifiIntro}</p>
          <label>{t.email}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
          <label>{t.res}<input type="text" required value={res} onChange={(e) => setRes(e.target.value)} autoComplete="off" autoCapitalize="characters" placeholder="HMXYZ…" /></label>
          {err && <p className="gd-err">{err}</p>}
          <button className="gd-btn o w" disabled={busy}>{busy ? t.checking : t.show}</button>
        </form>
      ) : (
        <div className="gd-wifi">
          <div><small>{t.network}</small><div className="ssid">{wifi.ssid}</div></div>
          <div><small>{t.password}</small><div className="pw">{wifi.password}</div></div>
          <button type="button" className="gd-btn o" onClick={copy}>{copied ? t.copied : t.copy}</button>
          {!conf.done ? <div className="gd-form" style={{ marginTop: 6 }}>
            <label className="gd-chk"><input type="checkbox" checked={conf.confirm} onChange={(e) => setConf({ ...conf, confirm: e.target.checked })} /> {t.confirmEmail}</label>
            <label className="gd-chk"><input type="checkbox" checked={conf.newsletter} onChange={(e) => setConf({ ...conf, newsletter: e.target.checked })} /> {t.newsletter}</label>
            {(conf.confirm || conf.newsletter) && <button type="button" className="gd-btn line" onClick={saveConf}>{t.save}</button>}
          </div> : <p>{t.saved}</p>}
        </div>
      )}
    </section>
  )
}

export default function GuideView({ code, data }) {
  const [lang, setLang, t] = useLang()
  const { unit, card, rules, tips, events, support_phone } = data
  const address = card.address || unit.address || ''
  const mapQ = card.lat && card.lng ? `${card.lat},${card.lng}` : address
  const nav = card.map_url || (mapQ ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQ)}` : '')
  const rulesText = (card.rules_override && pick(card.rules_override, lang)) || rules.map((r) => pick(r.body, lang)).filter(Boolean).join('\n')
  const tel = String(support_phone || '').replace(/\s+/g, '')
  return (
    <div className="gd" data-code={code}>
      <Top lang={lang} setLang={setLang} title={unit.name || t.title} sub={address} />
      <main className="gd-main">
        <Wifi code={code} t={t} />
        <section className="gd-card">
          <h2>📍 {t.address}</h2>
          <div className="gd-taxi"><small>{t.taxi}</small><b>{address || '—'}</b>{pick(card.address_note, lang) && <span style={{ display: 'block', marginTop: 6, fontSize: 14 }}>{pick(card.address_note, lang)}</span>}</div>
          {nav && <p><a className="gd-btn w" href={nav} target="_blank" rel="noreferrer">🧭 {t.navigate}</a></p>}
          {mapQ && <iframe className="gd-map" title={t.map} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQ)}&z=16&output=embed`} />}
          {pick(card.arrival, lang) && <><h2 style={{ marginTop: 10 }}>🚪 {t.arrival}</h2><p>{pick(card.arrival, lang)}</p></>}
        </section>
        <section className="gd-card"><h2>🅿️ {t.parking}</h2><p>{pick(card.parking, lang) || t.nothing}</p></section>
        <section className="gd-card"><h2>📋 {t.rules}</h2><p>{rulesText || t.nothing}</p></section>
        <section className="gd-card"><h2>🧳 {t.checkout}</h2>{card.checkout_time && <p><b>{t.checkoutAt} {card.checkout_time}</b></p>}<p>{pick(card.checkout, lang) || t.nothing}</p></section>
        <section className="gd-card"><h2>✨ {t.tips}</h2>{tips.length ? tips.map((x, i) => <div key={i} className="gd-tip"><b>{pick(x.title, lang)}</b><span>{pick(x.body, lang)}</span>{x.url && <a href={x.url} target="_blank" rel="noreferrer">→</a>}</div>) : <p>{t.nothing}</p>}</section>
        <section className="gd-card"><h2>🎉 {t.events}</h2>{events.length ? events.map((x, i) => <div key={i} className="gd-tip"><b>{pick(x.title, lang)}</b><small>{fmtDate(x.starts_at, lang)}{x.place ? ` · ${x.place}` : ''}</small><span>{pick(x.body, lang)}</span>{x.url && <a href={x.url} target="_blank" rel="noreferrer">→</a>}</div>) : <p>{t.nothing}</p>}</section>
        <section className="gd-card"><h2>🆘 {t.help}</h2><div className="gd-help">{pick(card.help, lang) && <p>{pick(card.help, lang)}</p>}{tel ? <a className="gd-btn w" href={`tel:${tel}`}>📞 {t.call} {support_phone}</a> : <p className="gd-err">—</p>}<a className="gd-btn line w" href={`/g/${code}/recenzia`}>⭐ {t.review}</a></div></section>
        <p className="gd-foot">LIVE-IN International</p>
      </main>
    </div>
  )
}
