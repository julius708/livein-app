'use client'
import { useEffect, useState } from 'react'

/** Odkaz na prihlášku upratovačky: vždy po ruke, jedným klikom do schránky. */
export default function ApplyLink({ compact = false }) {
  const [url, setUrl] = useState('/uprat/prihlaska')
  const [copied, setCopied] = useState(false)
  useEffect(() => { setUrl(location.origin + '/uprat/prihlaska') }, [])
  const copy = async () => {
    try { await navigator.clipboard.writeText(url) } catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy') } catch {} t.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }
  if (compact) return <button type="button" className="btn o" onClick={copy} title={url}>{copied ? '✅ Odkaz skopírovaný' : '📋 Skopírovať odkaz na prihlášku'}</button>
  return (
    <div className="up-linkbox">
      <b>Odkaz na prihlášku pre upratovačky</b>
      <div className="up-row"><a href="/uprat/prihlaska" target="_blank" rel="noreferrer" className="up-linkurl">{url}</a><button type="button" className="btn" onClick={copy}>{copied ? '✅ Skopírované' : 'Skopírovať'}</button></div>
      <small>Pošli ho upratovačkám, nech sa prihlásia. Alebo ich pridaj nižšie cez „Pridať člena“, dostanú vlastnú pozvánku e-mailom.</small>
    </div>
  )
}
