'use client'
import { useEffect, useState } from 'react'
import { T } from './i18n'

/** Jedna mobilná šablóna v SK/EN. Jazyk sa pamätá len ako pohodlie (localStorage), nikdy nič citlivé. */
export function useLang() {
  const [lang, setLang] = useState('sk')
  useEffect(() => { try { const l = localStorage.getItem('gd-lang'); if (l === 'en' || l === 'sk') setLang(l); else if (/^en/i.test(navigator.language || '')) setLang('en') } catch {} }, [])
  const set = (l) => { setLang(l); try { localStorage.setItem('gd-lang', l) } catch {} }
  return [lang, set, T[lang]]
}
export function Top({ lang, setLang, title, sub }) {
  return (
    <header className="gd-top">
      <div className="gd-top-row"><img src="/logo.png" alt="LIVE-IN" /><div className="gd-lang"><button type="button" className={lang === 'sk' ? 'on' : ''} onClick={() => setLang('sk')}>SK</button><button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button></div></div>
      <h1>{title}</h1>{sub && <p>{sub}</p>}
    </header>
  )
}
