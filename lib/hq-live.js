// Ústredňa – načítanie živých údajov z existujúcich modulov appky (len čítanie). Samotné skladanie je v lib/hq-live-core.js.
// Všetko ide cez klienta prihláseného admina (platia jeho práva v databáze) a beží súbežne; zlyhanie jedného zdroja nezhodí ostatné.
// Vonkajšie API sa volá len jedno: otvorené úlohy Asany, ktoré si appka už sama drží v 5-minútovej medzipamäti. Guesty a HubSpot sa priamo nevolajú.
import 'server-only'
import { fetchOpenDamageTasks, asanaConfigured } from './asana'
import { OPEN_STATUSES } from './maint'
import { billingPeriods, billingItems } from './billing-server'
import { billingStats } from './billing-core'
import { buildLive } from './hq-live-core'
import { economySummary } from './hq-economy'
import { gunzipSync } from 'node:zlib'

const OPEN_STAGES = ['new', 'contacted', 'viewing', 'offer']
const TIMEOUT = 8000
// Finančný prehľad sa počíta z veľkého podkladu Ekonomiky; drží sa v pamäti servera, kým sa podklad nezmení (kľúč = čas jeho aktualizácie).
const ecoCache = new Map()

/** Jeden dotaz s časovým limitom: vráti { data } alebo { error }, nikdy nevyhodí výnimku. */
async function q(fn) {
  try {
    const r = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('časový limit')), TIMEOUT))])
    if (r && typeof r === 'object' && 'error' in r && r.error) return { error: r.error.message || String(r.error) }
    return { data: r && typeof r === 'object' && 'data' in r ? r.data : r }
  } catch (e) { return { error: String((e && e.message) || e) } }
}

export async function hqLive(s, { now = Date.now() } = {}) {
  const since = new Date(now - 14 * 86400e3).toISOString().slice(0, 10)
  const nowIso = new Date(now).toISOString()
  const day = (n) => new Date(now - n * 86400e3).toISOString()
  const count = async (build) => { const r = await build(s.from('leads').select('id', { count: 'exact', head: true }).eq('kind', 'lead')); if (r.error) throw new Error(r.error.message); return r.count || 0 }
  const [facts, dash, work, numbers, leadStats, activity, leadCounts, overdue, leadTasks, crmSync, queue, maint, damages, economy, billing, invProps, invInq, invSources, ideas, newsletter, kb, board] = await Promise.all([
    q(() => s.rpc('home_facts')), q(() => s.rpc('home_dashboard')), q(() => s.rpc('home_work')), q(() => s.rpc('home_numbers')),
    q(async () => ({ data: { new7: await count((x) => x.gte('received_at', day(7))), prev7: await count((x) => x.gte('received_at', day(14)).lt('received_at', day(7))), recentNew: await count((x) => x.eq('stage', 'new').gte('received_at', day(30))), oldNew: await count((x) => x.eq('stage', 'new').lt('received_at', day(30))), clients: await (async () => { const r = await s.from('leads').select('id', { count: 'exact', head: true }).eq('stage', 'client'); if (r.error) throw new Error(r.error.message); return r.count || 0 })() } })),
    q(() => s.rpc('livein_activity_events')),
    q(async () => { const out = {}; for (const st of OPEN_STAGES) { const r = await s.from('leads').select('id', { count: 'exact', head: true }).eq('kind', 'lead').eq('stage', st); if (r.error) return r; out[st] = r.count || 0 } return { data: out } }),
    q(async () => { const r = await s.from('leads').select('id,name,city,assigned_to,due_at', { count: 'exact' }).eq('kind', 'lead').eq('stage', 'new').lt('due_at', nowIso).order('due_at', { ascending: true }).limit(20); return r.error ? r : { data: { rows: r.data || [], count: r.count } } }),
    q(() => s.from('lead_tasks').select('id,lead_id,kind,title,due_at,status,payload').eq('status', 'open').order('due_at', { ascending: true }).limit(300)),
    q(async () => { const r = await s.from('config').select('value').eq('key', 'crm_sync').maybeSingle(); return r.error ? r : { data: (r.data && r.data.value) || {} } }),
    q(() => s.from('crm_sync_queue').select('id,last_error').is('done_at', null).limit(500)),
    q(() => s.from('maint_cases').select('id,ref,listing_name,category,symptoms,severity,status,assignee_email,due_at,created_at').in('status', OPEN_STATUSES).order('created_at', { ascending: false }).limit(200)),
    asanaConfigured() ? q(async () => { const t = await fetchOpenDamageTasks(); if (!t) throw new Error('Asana nevrátila úlohy'); return { data: t } }) : Promise.resolve({ data: null }),
    q(async () => {
      // podklad Ekonomiky vidí len vedenie (RLS); kto ho nevidí, nedostane ani súhrn z pamäte
      const head = await s.from('economics_snapshots').select('updated_at').eq('id', 'current').maybeSingle()
      if (head.error) return head
      if (!head.data) return { data: null }
      const key = head.data.updated_at
      if (!ecoCache.has(key)) {
        const full = await s.from('economics_snapshots').select('payload_gzip_base64').eq('id', 'current').maybeSingle()
        if (full.error || !full.data) return { data: { updated_at: key, summary: null } }
        let summary = null
        try { summary = economySummary(JSON.parse(gunzipSync(Buffer.from(full.data.payload_gzip_base64, 'base64')).toString('utf8'))) } catch (e) { console.error('[hq] ekonomika', String(e && e.message).slice(0, 120)) }
        ecoCache.clear(); ecoCache.set(key, summary)
      }
      return { data: { updated_at: key, summary: ecoCache.get(key) } }
    }),
    q(async () => { const periods = await billingPeriods(s); const p = periods && periods[0]; if (!p) throw new Error('žiadne obdobie'); return { data: { month: p.month, status: p.status, stats: billingStats(await billingItems(s, p.id)) } } }),
    q(() => s.from('inv_properties').select('status').is('merged_into', null).limit(3000)),
    q(() => s.from('inv_inquiries').select('status').limit(2000)),
    q(() => s.from('inv_sources').select('key,name,enabled,last_ok_at,last_error,last_error_at')),
    q(() => s.from('content_ideas').select('status,created_at').limit(2000)),
    q(() => s.from('newsletters').select('subject,sent_at,sent_count,status').eq('status', 'sent').order('sent_at', { ascending: false }).limit(1)),
    q(() => s.from('sync_runs').select('finished_at,ok,error').eq('job', 'guru-kb').order('finished_at', { ascending: false }).limit(1)),
    q(() => s.from('board_notes').select('id,text,author_name,date,created_at').is('removed_at', null).gte('date', since).order('created_at', { ascending: false }).limit(8)),
  ])
  // mená a mestá k obhliadkam: len leady, ktorých sa otvorené úlohy týkajú
  const ids = [...new Set(((leadTasks.data || []).filter((t) => t.kind === 'viewing').map((t) => t.lead_id)).filter(Boolean))].slice(0, 200)
  const taskLeads = ids.length ? await q(() => s.from('leads').select('id,name,city,assigned_to').in('id', ids)) : { data: [] }
  return buildLive({ facts, dash, work, numbers, leadStats, activity, leadCounts, overdue, taskLeads, leadTasks, crmSync, queue, maint, damages, economy, billing, invProps, invInq, invSources, ideas, newsletter, kb, board }, now)
}
