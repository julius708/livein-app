// „Môj deň“: načítanie údajov pre karty. Beží s prihlásením človeka (platia RLS), každá časť je izolovaná: keď zlyhá, karta sa len nezobrazí.
import { addDays } from './cl-core.js'
import { unreadInbox } from './core-server.js'

const safe = async (fn) => { try { return await fn() } catch { return null } }

/** @param {{s:any, user:{email:string}, isAdmin:boolean, roles:string[], today:string, hf:any, hw:any, unseen:any[]}} a */
export async function loadMyDay({ s, user, isAdmin, roles, today, hf, hw, unseen }) {
  const email = user.email.toLowerCase()
  const tomorrow = addDays(today, 1)
  const canLeads = isAdmin || roles.includes('crm')
  const canOps = isAdmin || roles.some((r) => ['operations', 'customer_service', 'assistant'].includes(r))
  const seenKey = null
  void seenKey
  const staff = await safe(async () => { const { data } = await s.from('cl_staff').select('role, active').eq('email', email).maybeSingle(); return data && data.active ? data : null })
  const isManager = isAdmin || (staff && staff.role === 'manager')
  const isCleaner = !!staff && staff.role === 'cleaner'
  const [cleaner, manager, leads, maint, inbox] = await Promise.all([
    isCleaner ? safe(async () => {
      const { data } = await s.from('cl_tasks').select('id, listing_name, date, status, assigned_at, alert_kind').eq('cleaner_email', email).gte('date', today).lte('date', tomorrow).neq('status', 'cancelled').order('date').order('listing_name')
      const rows = data || []
      const dayAgo = new Date(Date.now() - 36 * 3600e3).toISOString()
      return { today: rows.filter((t) => t.date === today), tomorrow: rows.filter((t) => t.date === tomorrow), fresh: rows.filter((t) => t.status === 'todo' && t.assigned_at && t.assigned_at > dayAgo).length }
    }) : null,
    isManager ? safe(async () => {
      const [t, al, pr, ap] = await Promise.all([
        s.from('cl_tasks').select('id, date, status, cleaner_email').gte('date', today).lte('date', tomorrow).neq('status', 'cancelled'),
        s.from('cl_tasks').select('id', { count: 'exact', head: true }).not('alert_kind', 'is', null).in('status', ['todo', 'in_progress']),
        s.from('cl_tasks').select('id', { count: 'exact', head: true }).not('problem_text', 'is', null).gte('date', addDays(today, -7)),
        s.from('cl_applications').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      ])
      if (t.error) return null
      const rows = t.data || []
      const td = rows.filter((x) => x.date === today)
      return { unassigned: rows.filter((x) => !x.cleaner_email && x.status === 'todo').length, total: td.length, done: td.filter((x) => x.status === 'done').length, inProgress: td.filter((x) => x.status === 'in_progress').length, alerts: al.count || 0, problems: pr.count || 0, applications: ap.count || 0 }
    }) : null,
    canLeads ? safe(async () => {
      const since = new Date(Date.now() - 3 * 864e5).toISOString()
      const [f, o] = await Promise.all([
        s.from('leads').select('id', { count: 'exact', head: true }).eq('kind', 'lead').eq('stage', 'new').gte('received_at', since),
        s.from('leads').select('id', { count: 'exact', head: true }).eq('kind', 'lead').eq('stage', 'new').is('first_contact_at', null).lt('due_at', new Date().toISOString()).gte('received_at', new Date(Date.now() - 30 * 864e5).toISOString()),
      ])
      return { fresh: f.count || 0, overdue: o.count || 0 }
    }) : null,
    canOps ? safe(async () => { const { count } = await s.from('maint_cases').select('id', { count: 'exact', head: true }).is('closed_at', null); return count || 0 }) : null,
    unreadInbox(s, email),
  ])
  return { cleaner, manager, hf: hf || null, hw: hw || null, leads, maint: maint || 0, mentions: (unseen || []).length, inbox }
}
