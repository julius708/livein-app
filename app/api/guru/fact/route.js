import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TOPICS = ['krátkodobý prenájom a Airbnb', 'Bratislava (história, miesta, zaujímavosti)', 'Košice (história, miesta, zaujímavosti)', 'pohostinnosť a spokojnosť hostí', 'psychológia a komunikácia v tíme', 'produktivita a zvyky', 'bývanie, interiér a dizajn', 'cestovanie a turizmus vo svete', 'technológie, ktoré pomáhajú správe bytov', 'slovenčina a jazyky', 'zdravie a energia počas pracovného dňa', 'peniaze a ekonomika prenájmov', 'história hotelierstva', 'príroda a Slovensko', 'veda a objavy, ktoré ovplyvnili bývanie', 'správanie hostí a recenzie']

/** Nová zaujímavosť pre prihláseného človeka pri každom otvorení appky; neopakuje sa (pamätá si jeho predchádzajúce). */
export async function GET() {
  const { s, user, me, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false }, { status: 403 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'nokey' })

  const [{ data: mine, error: e1 }, { data: team }] = await Promise.all([
    s.from('guru_facts').select('text,topic,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(150),
    s.from('guru_facts').select('text').order('created_at', { ascending: false }).limit(60),
  ])
  if (e1) console.error('[guru fact] read', e1.message)
  const recentTopics = new Set((mine || []).slice(0, 6).map((f) => f.topic))
  const pool = TOPICS.filter((t) => !recentTopics.has(t))
  const topic = (pool.length ? pool : TOPICS)[Math.floor(Math.random() * (pool.length ? pool.length : TOPICS.length))]
  const used = [...new Set([...(mine || []).map((f) => f.text), ...(team || []).map((f) => f.text)])].slice(0, 180).map((t) => '- ' + t).join('\n')
  const first = String(me?.name || '').split(' ')[0]
  const prompt = `Napíš jednu novú zaujímavosť pre ${first || 'kolegu'} z tímu LIVE-IN (správa krátkodobých prenájmov bytov v Bratislave a Košiciach). Téma: ${topic}.
Pravidlá: po slovensky, 1 až 2 vety, 120 až 220 znakov, pravdivé a overiteľné, bez emoji, bez úvodu typu „Vedeli ste“ a bez oslovenia. Má byť milá, prekvapivá alebo prakticky užitočná. Nesmie sa opakovať ani podobať na tieto už použité:
${used || '(zatiaľ žiadne)'}
Odpovedz iba JSON: {"topic":"krátky názov témy","text":"zaujímavosť"}`
  let out = null, why = ''
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(22000),
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!r.ok) why = 'api ' + r.status + ' ' + (await r.text()).slice(0, 200)
    else {
      const j = await r.json()
      const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) why = 'nojson stop=' + j.stop_reason + ' blocks=' + (j.content || []).map((b) => b.type + ':' + String(b.text || b.thinking || '').length).join(',') + ' text=' + text.slice(0, 200)
      else { let o = null; try { o = JSON.parse(m[0]) } catch {} if (o && typeof o.text === 'string' && o.text.trim()) out = { topic: String(o.topic || topic).slice(0, 80), text: o.text.trim().slice(0, 300) }; else why = 'empty ' + text.slice(0, 200) }
      if (!out && !m && text.length > 40 && text.length < 400) out = { topic, text: text.replace(/^["„]|["“]$/g, '').trim() }
    }
  } catch (e) { why = 'fetch ' + (e && e.message) }
  if (!out) { console.error('[guru fact] generate failed:', why); return NextResponse.json({ ok: false, error: 'generate' }) }
  const ins = await s.from('guru_facts').insert({ user_id: user.id, text: out.text, topic: out.topic })
  if (ins.error) console.error('[guru fact] insert', ins.error.message)
  console.log('[guru fact] ok', first, '·', out.topic)
  return NextResponse.json({ ok: true, text: out.text, topic: out.topic })
}
