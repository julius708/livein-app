'use client'
import { useEffect, useRef, useState } from 'react'

/** Biele okienko na poznámky počas hovoru: píše sa rovno, uloží sa tlačidlom (ide do histórie, HubSpotu aj Asany). Hlasovka → prepis cez ElevenLabs. */
export default function CallNotes({ value, onChange, onSave, busy }) {
  const [rec, setRec] = useState(null); const [recording, setRecording] = useState(false); const [transcribing, setTranscribing] = useState(false); const [err, setErr] = useState(''); const [secs, setSecs] = useState(0)
  const chunks = useRef([]); const timer = useRef(null)
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  async function start() {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data) }
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); clearInterval(timer.current); setRecording(false)
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })
        if (blob.size < 800) { setErr('Nahrávka je prázdna.'); return }
        setTranscribing(true)
        try {
          const fd = new FormData(); fd.append('audio', blob, 'hovor.webm')
          const res = await fetch('/api/guru/stt', { method: 'POST', body: fd })
          const j = await res.json().catch(() => ({}))
          if (j.ok && j.text) onChange((value ? value.trimEnd() + '\n' : '') + j.text)
          else setErr(j.error === 'stt_not_configured' ? 'Prepis nie je nastavený (ELEVENLABS_API_KEY).' : 'Prepis sa nepodaril, skús znova.')
        } catch { setErr('Prepis sa nepodaril, skús znova.') } finally { setTranscribing(false) }
      }
      r.start(); setRec(r); setRecording(true); setSecs(0); timer.current = setInterval(() => setSecs((s) => s + 1), 1000)
    } catch { setErr('Mikrofón nie je dostupný. Povoľ ho v prehliadači.') }
  }
  function stop() { if (rec && rec.state !== 'inactive') rec.stop() }
  return (
    <section className="card crm-callnotes">
      <div className="crm-row-head"><h2>📝 Poznámky z hovoru</h2><small className="eko-fine">Píš rovno počas hovoru. Uložené ide do histórie, HubSpotu aj Asany.</small></div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={10} placeholder={'napr. 2-izbový byt, 55 m², zariadený, voľný od januára, chce poradiť s cenou…'} />
      <div className="crm-callnotes-actions">
        {!recording ? <button type="button" className="btn line" onClick={start} disabled={transcribing}>{transcribing ? 'Prepisujem…' : '🎙️ Nahrať hlasovku'}</button> : <button type="button" className="btn o" onClick={stop}>■ Stop ({secs}s)</button>}
        <button type="button" className="btn" onClick={onSave} disabled={busy || !String(value || '').trim()}>Uložiť poznámku</button>
      </div>
      {err && <p className="msg err">{err}</p>}
      <p className="eko-fine">Hlasovka sa prepíše na text (slovenčina) a doplní do okienka; pred uložením ju môžeš upraviť.</p>
    </section>
  )
}
