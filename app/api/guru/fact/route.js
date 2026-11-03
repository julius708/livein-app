import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TOPICS = ['krátkodobý prenájom a Airbnb', 'Bratislava a Košice (história, miesta, zaujímavosti)', 'pohostinnosť a spokojnosť hostí', 'psychológia a komunikácia v tíme', 'produktivita a zvyky', 'bývanie, interiér a dizajn', 'cestovanie a turizmus', 'technológie, ktoré pomáhajú správe bytov', 'slovenčina a jazyky', 'zdravie a energia počas pracovného dňa', 'peniaze a ekonomika prenájmov', 'história LIVE-IN typu firiem a hotelierstva']

const todayBA = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bratislava' })

/** Zaujímavosť dňa: jedna pre celý tím na deň, generuje sa pri prvom otvorení a neopakuje témy posledných dní. */
export async function GET() {
  const { s, user, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false }, { status: 403 })
  const day = todayBA()
  const { data: existing } = await s.from('guru_daily_facts').select('day,text,topic').eq('day', day).maybeSingle()
  if (existing) return NextResponse.json({ ok: true, day, text: existing.text, topic: existing.topic })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'nokey' })
  const { data: prev } = await s.from('guru_daily_facts').select('day,text,topic').order('day', { ascending: false }).limit(90)
  const used = (prev || []).map((p) => `${p.day}: [${p.topic || '-'}] ${p.text}`).join('\n')
  const n = Math.floor((Date.parse(day) / 86400000) % TOPICS.length)
  const topic = TOPICS[n]
  const prompt = `Napíš jednu zaujímavosť na dnes (${day}) pre tím firmy LIVE-IN (správa krátkodobých prenájmov bytov v Bratislave a Košiciach). Téma na dnes: ${topic}.
Pravidlá: po slovensky, 1 až 2 vety, max 220 znakov, pravdivé a overiteľné, bez emoji, bez úvodu typu „Vedeli ste“. Má byť milá, prekvapivá alebo prakticky užitočná. Nesmie sa opakovať ani podobať na tieto už použité:
${used || '(zatiaľ žiadne)'}
Odpovedz iba JSON: {"topic":"krátky názov témy","text":"zaujímavosť"}`
  let out = null
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
    if (r.ok) {
      const j = await r.json()
      const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
      const m = text.match(/\{[\s\S]*\}/)
      if (m) { const o = JSON.parse(m[0]); if (o && typeof o.text === 'string' && o.text.trim()) out = { topic: String(o.topic || topic).slice(0, 80), text: o.text.trim().slice(0, 300) } }
    }
  } catch {}
  if (!out) return NextResponse.json({ ok: false, error: 'generate' })
  // Prvý, kto dnes appku otvorí, zaujímavosť uloží; ostatní ju už len čítajú (pri súbehu vyhrá uložená).
  const ins = await s.from('guru_daily_facts').insert({ day, text: out.text, topic: out.topic }).select('day').maybeSingle()
  if (ins.error) {
    const { data: again } = await s.from('guru_daily_facts').select('day,text,topic').eq('day', day).maybeSingle()
    if (again) return NextResponse.json({ ok: true, day, text: again.text, topic: again.topic })
  }
  return NextResponse.json({ ok: true, day, text: out.text, topic: out.topic })
}
