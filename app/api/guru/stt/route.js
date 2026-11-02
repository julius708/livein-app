import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { sameOrigin } from '@/lib/guru-memory'

// Prepis hlasu pre Guru: nahrávka z mikrofónu → ElevenLabs Speech to Text (Scribe). Funguje vo všetkých prehliadačoch,
// na rozdiel od rozpoznávania reči v prehliadači. Kľúč ELEVENLABS_API_KEY nastavuje Július vo Verceli.
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  const { user, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false, error: 'Najprv sa prihlás.' }, { status: 403 })
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'stt_not_configured' }, { status: 503 })
  let form
  try { form = await request.formData() } catch { return NextResponse.json({ ok: false, error: 'no_audio' }, { status: 400 }) }
  const audio = form.get('audio')
  if (!audio || typeof audio.arrayBuffer !== 'function' || audio.size < 800) return NextResponse.json({ ok: false, error: 'no_audio' }, { status: 400 })
  if (audio.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'too_long' }, { status: 413 })
  try {
    const out = new FormData()
    out.append('file', audio, audio.name || 'audio.webm')
    out.append('model_id', 'scribe_v1')
    out.append('language_code', 'slk')
    out.append('tag_audio_events', 'false')
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: out, signal: AbortSignal.timeout(25000) })
    if (!r.ok) return NextResponse.json({ ok: false, error: 'stt_failed', status: r.status }, { status: 502 })
    const j = await r.json()
    const text = String(j.text || '').trim()
    return NextResponse.json({ ok: true, text }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'stt_failed' }, { status: 502 })
  }
}
