// Spoločný záznam udalostí a schránka: volania databázy s prihlásením človeka. Nikdy nehádžu výnimku: záznam je doplnok, nie podmienka práce.
import { rpc } from './cl-server.js'

/** Zapíše udalosť „kto, čo, kedy“. Autor je vždy prihlásený človek (určuje databáza). */
export async function track(s, module, event, subject, data) {
  try {
    const r = await rpc(s, 'core_log', { p_module: module, p_event: event, p_subject_type: subject && subject.type || null, p_subject_id: subject && subject.id != null ? String(subject.id) : null, p_data: data || {} })
    return r.ok === true
  } catch { return false }
}

/** Pošle správu do schránky jedného človeka. */
export async function deliver(s, to, { module, title, body, href, kind }) {
  try {
    const r = await rpc(s, 'core_notify', { p_to: to, p_module: module, p_title: title, p_body: body || null, p_href: href || null, p_kind: kind || 'info' })
    return r.ok === true
  } catch { return false }
}

/** Správy do schránky pre viac ľudí naraz (každému jedna, bez duplicít). */
export async function deliverMany(s, emails, msg) {
  const uniq = [...new Set((emails || []).filter(Boolean).map((e) => e.toLowerCase()))]
  const out = await Promise.all(uniq.map((e) => deliver(s, e, msg)))
  return out.filter(Boolean).length
}

export async function loadInbox(s, { limit = 100 } = {}) {
  try {
    const { data, error } = await s.from('core_inbox').select('id, at, from_email, module, kind, title, body, href, read_at').order('at', { ascending: false }).limit(limit)
    return error ? [] : data || []
  } catch { return [] }
}

export async function unreadInbox(s, email) {
  try {
    const { data, count, error } = await s.from('core_inbox').select('title, kind', { count: 'exact' }).eq('to_email', email.toLowerCase()).is('read_at', null).order('at', { ascending: false }).limit(3)
    return error ? { n: 0, items: [] } : { n: count || 0, items: data || [] }
  } catch { return { n: 0, items: [] } }
}

export async function recentEvents(s, { module, limit = 100 } = {}) {
  try {
    let q = s.from('core_events').select('id, at, actor_email, module, event, subject_type, subject_id, data').order('at', { ascending: false }).limit(limit)
    if (module) q = q.eq('module', module)
    const { data, error } = await q
    return error ? [] : data || []
  } catch { return [] }
}
