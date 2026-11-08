'use client'
import { useEffect, useState } from 'react'
import { T, LANGS, LANG_NAMES } from './i18n'

/** Jedna mobilná šablóna, 11 jazykov. Jazyk sa pamätá len ako pohodlie (localStorage), nikdy nič citlivé. */
export function useLang() {
  const [lang, setLang] = useState('en')
  useEffect(() => { try { const l = localStorage.getItem('gd-lang'); if (LANGS.includes(l)) return setLang(l); const nav = String(navigator.language || 'en').slice(0, 2).toLowerCase(); setLang(LANGS.includes(nav) ? nav : 'en') } catch {} }, [])
  const set = (l) => { if (!LANGS.includes(l)) return; setLang(l); try { localStorage.setItem('gd-lang', l) } catch {} }
  return [lang, set, T[lang] || T.en]
}
export function Top({ lang, setLang, title, sub }) {
  return (
    <header className="gd-top">
      <div className="gd-top-row"><img src="/logo.png" alt="LIVE-IN" /><label className="gd-langsel"><span aria-hidden="true">🌐</span><select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={(T[lang] || T.en).language}>{LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}</select></label></div>
      <h1>{title}</h1>{sub && <p>{sub}</p>}
    </header>
  )
}
