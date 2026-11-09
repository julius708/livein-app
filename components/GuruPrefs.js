'use client'
import { useEffect, useState } from 'react'

/** Nastavenie asistenta na stránkach: zobrazenie (postavička / malé koliesko / skrytý) a hlas. Pamätá sa v prehliadači používateľa. */
export default function GuruPrefs() {
  const [mode, setMode] = useState('mini'); const [voice, setVoice] = useState(false)
  useEffect(() => { try { const m = localStorage.getItem('guru-mode'); if (m) setMode(m); setVoice(localStorage.getItem('guru-muted') === '0') } catch {} }, [])
  const save = (m, v) => { try { localStorage.setItem('guru-mode', m); localStorage.setItem('guru-muted', v ? '0' : '1') } catch {} setMode(m); setVoice(v) }
  return (
    <div className="g-prefs">
      <b>Asistent na stránkach</b>
      <div className="g-prefs-row">
        {[['full', 'Postavička'], ['mini', 'Malé koliesko'], ['hidden', 'Skrytý']].map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => save(k, voice)}>{l}</button>)}
        <label><input type="checkbox" checked={voice} onChange={(e) => save(mode, e.target.checked)} /> Čítať odpovede nahlas</label>
      </div>
      <small>Guru sa už sám neprihovára pri otvorení appky. Nastavenie platí pre tento prehliadač.</small>
    </div>
  )
}
