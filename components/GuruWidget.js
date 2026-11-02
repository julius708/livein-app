'use client'
// LIVE-IN Guru ako živý asistent na každej stránke (rovnaký typ widgetu ako Adam na webe):
// malá postavička dole, po kliknutí čitateľné okno, dá sa presúvať a zbaliť. Hlas ElevenLabs
// s pohybom úst podľa hlások; keď hlas nie je nastavený, číta prehliadač. Žiadne skákanie.
import { useEffect, useRef, useState } from 'react'
import { MOUTH, stripMarkdown, visAt, timelineFrom, clampPos } from '@/lib/guru-widget-core'

const CHIPS = ['Čo dnes potrebuje moju pozornosť?', 'Koľko máme dnes príchodov a odchodov?', 'Aký je kód od dverí na byte…', 'Ako riešime neskorý check-in?', 'Napíš hosťovi odpoveď na sťažnosť na hluk']
const HELLO = 'Ahoj, som LIVE-IN Guru. Opýtaj sa ma na byty, rezervácie alebo postupy.'
const GREETING = 'Ahoj, som LIVE-IN Guru. Opýtaj sa na byty, rezervácie, kódy, postupy alebo čokoľvek iné. Môžeš aj hovoriť.'
const ERR = 'Prepáč, teraz sa mi nepodarilo odpovedať. Skús to o chvíľu znova.'
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch {} return null }
function sstore(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v) } catch {} return null }
function uuid() { try { return crypto.randomUUID() } catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }) } }
function b64blob(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'audio/mpeg' }) }

const ICON_ON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
const ICON_OFF = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>

export default function GuruWidget({ name = '' }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])           // {id, role:'u'|'a', text, words?, shown?}
  const [busy, setBusy] = useState(false)
  const [muted, setMuted] = useState(false)
  const [hello, setHello] = useState(false)
  const [imgOk, setImgOk] = useState(true)
  const [q, setQ] = useState('')
  const [rec, setRec] = useState(false)
  const [pos, setPos] = useState({ r: 22, b: 14 })
  const [mobile, setMobile] = useState(false)

  const hostRef = useRef(null), figRef = useRef(null), cvRef = useRef(null), msgsRef = useRef(null), inputRef = useRef(null)
  const audio = useRef(null), TL = useRef(null), speaking = useRef(false), sim = useRef(false), mouth = useRef({ o: 0, w: 0 })
  const primed = useRef(false), greeted = useRef(false), revealId = useRef(null), recRef = useRef(null), mountedRef = useRef(false)

  /* ---------- štart ---------- */
  useEffect(() => {
    mountedRef.current = true
    const m = () => window.innerWidth < 700
    setMobile(m())
    let saved = null
    try { saved = JSON.parse(store('guru-pos') || 'null') } catch {}
    const base = saved && typeof saved.r === 'number' ? saved : (m() ? { r: 8, b: 78 } : { r: 22, b: 14 })
    setPos(clampPos(base.r, base.b, { w: window.innerWidth, h: window.innerHeight }, { w: 130, h: 200 }))
    const onResize = () => { setMobile(m()); setPos((p) => clampPos(p.r, p.b, { w: window.innerWidth, h: window.innerHeight }, { w: 130, h: 200 })) }
    window.addEventListener('resize', onResize)
    const t = setTimeout(() => { if (!sstore('guru-hello')) { sstore('guru-hello', '1'); setHello(true); setTimeout(() => setHello(false), 9000) } }, 1500)
    const A = new Audio(); A.preload = 'auto'; A.playsInline = true; audio.current = A
    return () => { mountedRef.current = false; window.removeEventListener('resize', onResize); clearTimeout(t); try { A.pause() } catch {} try { speechSynthesis.cancel() } catch {} }
  }, [])

  /* ---------- ústa: kreslenie v slučke, plynulé (lerp), bez trasenia ---------- */
  useEffect(() => {
    let raf
    const loop = () => {
      const cv = cvRef.current
      if (cv) {
        const g = cv.getContext('2d')
        let tO = 0, tW = 0
        if (speaking.current) {
          if (!sim.current && TL.current && audio.current) {
            const v = visAt(TL.current, audio.current.currentTime); tO = v.o; tW = v.w
            if (v.i >= 0 && revealId.current) reveal(revealId.current, (v.i + 2) / TL.current.c.length)
          } else {
            const t = performance.now() / 1000; tO = 0.3 + 0.5 * Math.abs(Math.sin(t * 13)) * (0.55 + 0.45 * Math.sin(t * 3.3))
          }
        }
        mouth.current.o += (tO - mouth.current.o) * 0.3
        mouth.current.w += (tW - mouth.current.w) * 0.25
        drawMouth(g, mouth.current.o, mouth.current.w)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  function drawMouth(g, o, w) {
    const W = MOUTH.canvasW, H = MOUTH.canvasH
    g.clearRect(0, 0, W, H)
    if (o < 0.05) return
    const a = Math.min(1, (o - 0.05) * 7), cx = 70, cy = 30, hw = 29 + 9 * w, h = 4 + o * 34
    g.globalAlpha = a
    const path = () => { g.beginPath(); g.moveTo(cx - hw, cy - 1); g.quadraticCurveTo(cx, cy - 5, cx + hw, cy - 1); g.quadraticCurveTo(cx, cy - 1 + h * 1.7, cx - hw, cy - 1); g.closePath() }
    path(); const gr = g.createLinearGradient(0, cy, 0, cy + h); gr.addColorStop(0, '#2a0d0d'); gr.addColorStop(1, '#4a1818'); g.fillStyle = gr; g.fill()
    g.save(); path(); g.clip()
    g.fillStyle = '#c5625b'; g.beginPath(); g.ellipse(cx, cy + h * 0.82, hw * 0.5, h * 0.3, 0, 0, 7); g.fill()
    g.fillStyle = '#f7f2ea'; g.fillRect(cx - hw + 5, cy - 6, 2 * hw - 10, Math.min(7, h * 0.3) + 3)
    g.restore()
    path(); g.lineWidth = 2.8; g.strokeStyle = '#a8604f'; g.stroke()
    g.globalAlpha = 1
  }

  /* ---------- správy ---------- */
  function scrollEnd() { const el = msgsRef.current; if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight }) }
  function reveal(id, ratio) {
    setMsgs((old) => old.map((m) => {
      if (m.id !== id || !m.words) return m
      const n = Math.ceil(m.words.length * Math.min(1, ratio))
      return n === m.shown ? m : { ...m, shown: n }
    }))
  }
  function addGuru(text) {
    const id = uuid(), words = text.split(/\s+/).filter(Boolean)
    setMsgs((old) => [...old.filter((m) => !m.thinking), { id, role: 'a', text, words, shown: 0 }])
    revealId.current = id
    scrollEnd()
    return id
  }

  /* ---------- zvuk ---------- */
  function unlock() { if (primed.current) return; primed.current = true; try { const A = audio.current; A.src = SILENT; const p = A.play(); if (p && p.catch) p.catch(() => {}) } catch {} }
  function stopSpeech(showAll) {
    speaking.current = false; sim.current = false
    try { audio.current && audio.current.pause() } catch {}
    try { speechSynthesis.cancel() } catch {}
    if (showAll && revealId.current) reveal(revealId.current, 1)
  }
  function playAudio(url) {
    return new Promise((res, rej) => {
      const A = audio.current
      A.onended = () => { speaking.current = false; if (revealId.current) reveal(revealId.current, 1); res() }
      A.onerror = () => { speaking.current = false; rej(new Error('audio')) }
      A.src = url; sim.current = false
      const p = A.play()
      if (p && p.then) p.then(() => { speaking.current = true }, (e) => { speaking.current = false; rej(e) }); else speaking.current = true
    })
  }
  function speechFallback(text) {
    return new Promise((res) => {
      if (!('speechSynthesis' in window)) { if (revealId.current) reveal(revealId.current, 1); return res() }
      const u = new SpeechSynthesisUtterance(text.replace(/LIVE-IN/g, 'Livin')); u.lang = 'sk-SK'; u.rate = 1.02
      u.onboundary = (e) => { if (e.charIndex != null && revealId.current) reveal(revealId.current, e.charIndex / text.length + 0.04) }
      u.onend = u.onerror = () => { speaking.current = false; sim.current = false; if (revealId.current) reveal(revealId.current, 1); res() }
      sim.current = true; speaking.current = true; speechSynthesis.speak(u)
    })
  }
  async function speak(text) {
    if (muted) { if (revealId.current) reveal(revealId.current, 1); return }
    try {
      const r = await fetch('/api/guru/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      if (!r.ok) throw new Error('tts ' + r.status)
      const j = await r.json()
      if (!j.ok || !j.audio) throw new Error('tts')
      TL.current = timelineFrom(j.alignment)
      await playAudio(URL.createObjectURL(b64blob(j.audio)))
    } catch { TL.current = null; await speechFallback(text) }
  }

  /* ---------- chat ---------- */
  async function ask(text) {
    const question = (text || '').trim()
    if (!question || busy) return
    unlock(); stopSpeech(true)
    setBusy(true); setQ('')
    setMsgs((old) => [...old, { id: uuid(), role: 'u', text: question }, { id: 'think', role: 'a', thinking: true }])
    scrollEnd()
    let reply
    try {
      const r = await fetch('/api/guru', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, turnId: uuid() }) })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'chat')
      reply = stripMarkdown(j.text || '').trim() || ERR
    } catch (e) { reply = e && e.message && /prihlás|uložen|nedostupn|krokov/i.test(e.message) ? e.message : ERR }
    if (!mountedRef.current) return
    addGuru(reply)
    setBusy(false)
    await speak(reply)
  }

  function openWin() {
    unlock(); setHello(false); setOpen(true); store('guru-open', '1')
    if (!greeted.current) {
      greeted.current = true
      const id = addGuru(GREETING)
      if (!sstore('guru-g')) { sstore('guru-g', '1'); speak(GREETING) } else reveal(id, 1)
    }
    if (!mobile) setTimeout(() => inputRef.current && inputRef.current.focus(), 80)
  }
  function closeWin() { stopSpeech(true); setOpen(false); store('guru-open', '0') }

  /* ---------- ťahanie malej postavy ---------- */
  const drag = useRef({ down: false, moved: 0, sx: 0, sy: 0, r0: 0, b0: 0 })
  function onDown(e) {
    if (open) return
    const d = drag.current; d.down = true; d.moved = 0; d.sx = e.clientX; d.sy = e.clientY; d.r0 = pos.r; d.b0 = pos.b
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  function onMove(e) {
    const d = drag.current; if (!d.down) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy))
    if (d.moved > 5) setPos(clampPos(d.r0 - dx, d.b0 - dy, { w: window.innerWidth, h: window.innerHeight }, { w: 130, h: 200 }))
  }
  function onUp() {
    const d = drag.current; if (!d.down) return; d.down = false
    if (d.moved > 5) { store('guru-pos', JSON.stringify(pos)); return }
    openWin()
  }

  /* ---------- mikrofón ---------- */
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
  function mic() {
    unlock()
    if (recRef.current) { try { recRef.current.stop() } catch {} return }
    if (!SR) return
    stopSpeech(true)
    const r = new SR(); r.lang = 'sk-SK'; r.interimResults = false; r.maxAlternatives = 1
    recRef.current = r; setRec(true)
    r.onresult = (e) => { const t = e.results[0][0].transcript; setQ(t); ask(t) }
    r.onerror = () => {}
    r.onend = () => { setRec(false); recRef.current = null }
    try { r.start() } catch { setRec(false); recRef.current = null }
  }

  const first = (name || '').split(' ')[0]
  const figure = (
    <div className={'gw-fig' + (open ? ' in' : '')} ref={figRef} title={open ? undefined : 'Klikni a opýtaj sa LIVE-IN Guru · chyť a presuň'}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={() => { if (open && speaking.current) stopSpeech(true) }}>
      <div className="gw-bob"><div className="gw-nod">
        {imgOk ? <img src="/guru-v3.png" alt="LIVE-IN Guru" draggable="false" onError={() => setImgOk(false)} /> : <div className="gw-fallback" aria-hidden="true">🧠</div>}
        {imgOk && <canvas className="gw-mouth" width={MOUTH.canvasW} height={MOUTH.canvasH} ref={cvRef} style={{ left: MOUTH.left + '%', top: MOUTH.top + '%', width: MOUTH.width + '%' }} />}
      </div></div>
    </div>
  )

  return (
    <>
      {!open && (
        <div className="gw-host" ref={hostRef} style={{ right: pos.r, bottom: pos.b }}>
          <div className="gw-col">
            <button type="button" className={'gw-hello' + (hello ? ' show' : '')} onClick={openWin}>{HELLO}</button>
            {figure}
            <button type="button" className="gw-pill" onClick={openWin}>Opýtať sa LIVE-IN Guru</button>
          </div>
        </div>
      )}
      {open && (
        <div className="gw-win" role="dialog" aria-label="Chat s LIVE-IN Guru" onKeyDown={(e) => { if (e.key === 'Escape') closeWin() }}>
          <div className="gw-head">
            {figure}
            <div className="gw-ht"><b>LIVE-IN Guru</b><span>Interný asistent tímu{first ? ` · ${first}` : ''}</span></div>
            <div className="gw-hb">
              <button type="button" className="gw-ib" aria-label={muted ? 'Zapnúť hlas' : 'Vypnúť hlas'} onClick={() => { const m = !muted; setMuted(m); if (m) stopSpeech(true) }}>{muted ? ICON_OFF : ICON_ON}</button>
              <button type="button" className="gw-ib" aria-label="Zbaliť" onClick={closeWin}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg></button>
            </div>
          </div>
          <div className="gw-msgs" ref={msgsRef} aria-live="polite">
            {msgs.map((m) => m.thinking
              ? <div key={m.id} className="gw-m a"><span className="gw-dots"><i /><i /><i /></span></div>
              : <div key={m.id} className={'gw-m ' + m.role}>{m.words ? m.words.map((w, i) => <span key={i} className={'gw-w' + (i < (m.shown ?? m.words.length) ? '' : ' off')}>{w}{i < m.words.length - 1 ? ' ' : ''}</span>) : m.text}</div>)}
          </div>
          <div className={'gw-chips' + (msgs.length > 1 ? ' row' : '')}>
            {CHIPS.map((c) => <button key={c} type="button" className="gw-chip" disabled={busy} onClick={() => ask(c)}>{c}</button>)}
          </div>
          <form className="gw-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} maxLength={4000} placeholder="Napíš alebo povedz…" aria-label="Tvoja otázka" />
            {SR && <button type="button" className={'gw-ib' + (rec ? ' rec' : '')} aria-label="Hovoriť" onClick={mic}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>}
            <button type="submit" className="gw-ib send" aria-label="Odoslať" disabled={busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
          </form>
          <div className="gw-foot">Len pre tím LIVE-IN. Celá história a nastavenia: <a href="/guru">stránka Guru</a>.</div>
        </div>
      )}
    </>
  )
}
