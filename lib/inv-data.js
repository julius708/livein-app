// Investície – čítanie dát pre stránky (cez klienta používateľa, takže platí RLS). Pred nasadením migrácie vracia prázdne dáta namiesto chyby.
import { loadSettings } from './inv-store.js'
import { freshness } from './inv-core.js'

const rows = (r) => (r && !r.error && r.data) || []
export const missingTable = (r) => !!(r && r.error && /relation .* does not exist|schema cache|inv_/i.test(r.error.message || ''))

/** Zoznam nehnuteľností s krátkym súhrnom výpočtu a počtom zhôd. */
export async function propertyList(s) {
  const pr = await s.from('inv_properties').select('id,status,title,city,district,address,rooms,area_interior,area_exterior,price,floor,condition,last_checked_at,last_confirmed_at,first_seen_at,updated_at,calc_id,type,features').is('merged_into', null).order('updated_at', { ascending: false }).limit(2000)
  if (missingTable(pr)) return { ready: false, props: [], calcs: {}, counts: {}, listings: {} }
  const props = rows(pr)
  const ids = props.map((p) => p.calc_id).filter(Boolean)
  const calcs = {}
  for (let i = 0; i < ids.length; i += 200) {
    const c = rows(await s.from('inv_calcs').select('id,quality_score,quality_level,known_total:result->investment->>known_total,complete:result->investment->>complete,yield:result->metrics->base->>yield_total_pct,prov:result->metrics->base->>provisional,unknown:result->investment->unknown').in('id', ids.slice(i, i + 200)))
    for (const x of c) calcs[x.id] = { quality: x.quality_score, level: x.quality_level, total: x.known_total != null ? Number(x.known_total) : null, complete: x.complete === 'true', yield: x.yield != null ? Number(x.yield) : null, provisional: x.prov === 'true', unknown: Array.isArray(x.unknown) ? x.unknown.length : 0 }
  }
  const ms = rows(await s.from('inv_matches').select('property_id,category,decision').limit(20000))
  const counts = {}
  for (const m of ms) { const c = (counts[m.property_id] = counts[m.property_id] || { match: 0, outside: 0 }); if (m.category === 'match' && m.decision !== 'rejected') c.match++; else if (m.category === 'outside') c.outside++ }
  const ls = rows(await s.from('inv_listings').select('property_id,source_key,state').limit(10000))
  const listings = {}
  for (const l of ls) (listings[l.property_id] = listings[l.property_id] || []).push(l)
  return { ready: true, props, calcs, counts, listings }
}
export async function propertyDetail(s, id) {
  const p = (await s.from('inv_properties').select('*').eq('id', id).maybeSingle()).data
  if (!p) return null
  const [listings, hist, events, versions, tasks, cands] = await Promise.all([
    s.from('inv_listings').select('id,source_key,external_id,url,title,state,price,missing_checks,first_seen_at,last_seen_at,last_checked_at').eq('property_id', id).order('first_seen_at'),
    s.from('inv_price_history').select('price,at,source').eq('property_id', id).order('at', { ascending: false }).limit(50),
    s.from('inv_events').select('id,type,payload,user_email,at,inquiry_id').eq('property_id', id).order('at', { ascending: false }).limit(60),
    s.from('inv_calcs').select('id,version,created_at,quality_score,quality_level,calc_version').eq('property_id', id).order('version', { ascending: false }).limit(20),
    s.from('inv_tasks').select('*').eq('property_id', id).order('status').order('due', { nullsFirst: false }),
    s.from('inv_merge_candidates').select('*').or(`property_a.eq.${id},property_b.eq.${id}`).eq('status', 'pending'),
  ])
  const calc = p.calc_id ? (await s.from('inv_calcs').select('id,version,created_at,result').eq('id', p.calc_id).maybeSingle()).data : null
  const matches = rows(await s.from('inv_matches').select('id,inquiry_id,category,score,decision,decision_reason,needs_review,result').eq('property_id', id))
  const inqs = matches.length ? rows(await s.from('inv_inquiries').select('id,lead_id,label,status').in('id', matches.map((m) => m.inquiry_id))) : []
  const leads = inqs.length ? rows(await s.from('leads').select('id,name').in('id', inqs.map((q) => q.lead_id))) : []
  const others = rows(cands) ; const otherIds = others.map((c) => (c.property_a === id ? c.property_b : c.property_a))
  const otherProps = otherIds.length ? rows(await s.from('inv_properties').select('id,city,address,district,price,area_interior,rooms').in('id', otherIds)) : []
  const settings = await loadSettings(s)
  return { p, listings: rows(listings), hist: rows(hist), events: rows(events), versions: rows(versions), tasks: rows(tasks), calc, matches, inqs, leads, candidates: others.map((c) => ({ ...c, other: otherProps.find((x) => x.id === (c.property_a === id ? c.property_b : c.property_a)) })), settings, fresh: freshness(p, Date.now(), settings.freshness) }
}
export async function inquiryDetail(s, id) {
  const q = (await s.from('inv_inquiries').select('*').eq('id', id).maybeSingle()).data
  if (!q) return null
  const lead = (await s.from('leads').select('id,name,phone,email,assigned_to,hubspot_contact_id').eq('id', q.lead_id).maybeSingle()).data
  const matches = rows(await s.from('inv_matches').select('*').eq('inquiry_id', id).order('score', { ascending: false }))
  const props = matches.length ? rows(await s.from('inv_properties').select('id,status,city,district,address,rooms,area_interior,price,last_checked_at,last_confirmed_at,calc_id,merged_into').in('id', matches.map((m) => m.property_id))) : []
  const [offers, tasks, events] = await Promise.all([
    s.from('inv_offers').select('id,status,created_at,reviewed_by,reviewed_at,match_ids,calc_snapshot').eq('inquiry_id', id).order('created_at', { ascending: false }),
    s.from('inv_tasks').select('*').eq('inquiry_id', id).order('status').order('due', { nullsFirst: false }),
    s.from('inv_events').select('id,type,payload,user_email,at,property_id').eq('inquiry_id', id).order('at', { ascending: false }).limit(40),
  ])
  const people = rows(await s.from('app_users').select('email,name').eq('active', true).contains('roles', ['crm']))
  return { q, lead, matches, props, offers: rows(offers), tasks: rows(tasks), events: rows(events), people: people.filter((p) => !p.email.startsWith('crm-bot')) }
}
