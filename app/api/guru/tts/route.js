import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { sameOrigin } from '@/lib/guru-memory'
import { speechText } from '@/lib/guru-widget-core'

// Hlas Gura: ElevenLabs s časovaním znakov (rovnaký vzor ako api/tts.js asistenta Adama).
// Kľúče ELEVENLABS_API_KEY a ELEVENLABS_VOICE_ID nastavuje Július vo Verceli; v kóde nikdy nie sú.
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  const { user, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false, error: 'Najprv sa prihlás.' }, { status: 403 })
  const key = process.env.ELEVENLABS_API_KEY
  const voice = process.env.ELEVENLABS_VOICE_ID
  if (!key || !voice) return NextResponse.json({ ok: false, error: 'tts_not_configured' }, { status: 503 })

  let body
  try { body = await request.json() } catch { body = {} }
  const text = speechText(typeof body.text === 'string' ? body.text : '', 700)
  if (!text) return NextResponse.json({ ok: false, error: 'no_text' }, { status: 400 })

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
      }),
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: 'tts_failed' }, { status: 502 })
    const j = await r.json()
    return NextResponse.json({ ok: true, audio: j.audio_base64, alignment: j.normalized_alignment || j.alignment || null }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'tts_failed' }, { status: 502 })
  }
}
