import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import UdrzbaNav from '@/components/udrzba/Nav'
import { canMaint, callMetrics } from '@/lib/maint'
import { maintSettings } from '@/lib/maint-data'
import '../udrzba.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prehľad hovorov · Údržba' }

const hrs = (ms) => (ms == null ? '–' : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${(ms / 3600e3).toFixed(1)} h`)
/** Dashboard: hovory s AI (prichádzajúce) s dennými a týždennými filtrami podľa témy, jazyka a verzie; hovory majiteľom zvlášť. */
export default async function DashPage({ searchParams }) {
  const sp = await searchParams
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canMaint(me)) redirect('/udrzba')
  const range = sp.range === 'week' ? 'week' : 'day'
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day || '') ? sp.day : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bratislava' })
  const from = new Date(day + 'T00:00:00+01:00'); if (range === 'week') from.setDate(from.getDate() - 6)
  const to = new Date(day + 'T23:59:59+01:00')
  let q = s.from('maint_call_sessions').select('*').gte('started_at', from.toISOString()).lte('started_at', to.toISOString())
  if (sp.topic) q = q.eq('topic', sp.topic); if (sp.lang) q = q.eq('lang', sp.lang); if (sp.ver) q = q.eq('agent_version', sp.ver)
  const [{ data: sessions }, settings, { data: owners }, { data: ownerCalls }] = await Promise.all([q, maintSettings(s),
    s.from('maint_approvals').select('status,sent_at,delivered_at,decided_at,created_at').gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
    s.from('maint_calls').select('status,attempts').eq('direction', 'outbound').gte('created_at', from.toISOString()).lte('created_at', to.toISOString())])
  const ids = (sessions || []).map((x) => x.call_id)
  const { data: events } = ids.length ? await s.from('maint_call_events').select('call_id,event').in('call_id', ids) : { data: [] }
  const m = callMetrics(sessions || [], events || [])
  const { data: allS } = await s.from('maint_call_sessions').select('topic,lang,agent_version').limit(2000)
  const uniq = (k) => [...new Set((allS || []).map((x) => x[k]).filter(Boolean))]
  const o = owners || []
  const decided = o.filter((a) => ['approved', 'declined', 'question'].includes(a.status) && a.decided_at)
  const avgDecision = decided.length ? decided.reduce((acc, a) => acc + (Date.parse(a.decided_at) - Date.parse(a.sent_at || a.created_at)), 0) / decided.length : null
  const oc = ownerCalls || []
  const Tile = ({ n, l }) => <div className="ud-metric"><b>{n}</b><span>{l}</span></div>
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="udrzba" hideFooter>
      <div className="ud">
        <UdrzbaNav active="dash" pilot={settings.pilot} />
        <section className="card">
          <form className="row" method="get">
            <label>Deň<input type="date" name="day" defaultValue={day} /></label>
            <label>Rozsah<select name="range" defaultValue={range}><option value="day">deň</option><option value="week">týždeň (7 dní do dňa)</option></select></label>
            <label>Téma<select name="topic" defaultValue={sp.topic || ''}><option value="">všetky</option>{uniq('topic').map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Jazyk<select name="lang" defaultValue={sp.lang || ''}><option value="">všetky</option>{uniq('lang').map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Verzia agenta<select name="ver" defaultValue={sp.ver || ''}><option value="">všetky</option>{uniq('agent_version').map((t) => <option key={t}>{t}</option>)}</select></label>
            <button className="btn line">Zobraziť</button>
          </form>
        </section>
        <section className="card">
          <h2>Prichádzajúce hovory s AI ({range === 'day' ? day : `7 dní do ${day}`})</h2>
          <div className="ud-metrics">
            <Tile n={m.calls} l="hovorov s AI" /><Tile n={m.resolved} l="vyriešené AI (potvrdené)" /><Tile n={`${m.successPct} %`} l="úspešnosť AI = potvrdené / všetky" />
            <Tile n={m.transferRequested} l="transfer žiadaný" /><Tile n={m.transferConnected} l="transfer spojený" /><Tile n={`${m.transferPctOfAll} %`} l="spojených s CS zo všetkých" /><Tile n={`${m.transferSuccessPct} %`} l="úspešnosť transferu z pokusov" />
            <Tile n={m.casesCreated} l="prípad vytvorený" /><Tile n={m.unresolved} l="nedokončené" /><Tile n={m.errors} l="technické chyby" /><Tile n={m.unknown} l="neznámy výsledok (samostatne)" />
            <Tile n={m.uniqueCallers} l="unikátnych overených volajúcich" /><Tile n={m.repeats} l="opakovaný kontakt do 24 h" />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Za vyriešený sa počíta iba potvrdený výsledok (udalosť „potvrdené vyriešenie“) alebo objektívne dokončená požiadavka. Koniec hovoru bez transferu nestačí a ostáva v „neznámy výsledok“ alebo „nedokončené“.</p>
        </section>
        <section className="card">
          <h2>Hovory majiteľom (odchádzajúce, zvlášť)</h2>
          <div className="ud-metrics">
            <Tile n={o.filter((a) => ['sent', 'delivered', 'approved', 'declined', 'question', 'no_response'].includes(a.status)).length} l="e-mailov so súhlasom odoslaných" /><Tile n={o.filter((a) => a.delivered_at).length} l="doručených" /><Tile n={o.filter((a) => a.status === 'bounced').length} l="nedoručených" />
            <Tile n={oc.filter((k) => ['answered', 'completed'].includes(k.status)).length} l="zdvihnutých hovorov" /><Tile n={oc.filter((k) => ['no_answer', 'busy', 'voicemail', 'failed'].includes(k.status)).length} l="nezdvihnutých / zlyhaných" />
            <Tile n={o.filter((a) => a.status === 'approved').length} l="schválené" /><Tile n={o.filter((a) => a.status === 'declined').length} l="odmietnuté" /><Tile n={o.filter((a) => a.status === 'question').length} l="otázka" /><Tile n={o.filter((a) => a.status === 'no_response').length} l="bez odpovede" /><Tile n={hrs(avgDecision)} l="priemerný čas do rozhodnutia" />
          </div>
        </section>
      </div>
    </Shell>
  )
}
