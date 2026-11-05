// Push notifikácie CRM (web-push, VAPID kľúče hlavnej appky). Posiela nevybavené riadky z notifications.
import { ASSIGNEES, dueReminders } from './crm'
export const pushReady = () => !!(process.env.WEB_PUSH_PRIVATE_KEY && process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY)

async function sender() {
  const w = (await import('web-push')).default
  w.setVapidDetails(process.env.WEB_PUSH_SUBJECT || 'mailto:julius@live-in.co.uk', process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY, process.env.WEB_PUSH_PRIVATE_KEY)
  return w
}
/** Pošle všetky notifikácie bez pushed_at (max 100) na zariadenia daných ľudí. */
export async function pushPending(s) {
  const { data: rows } = await s.from('notifications').select('id,user_email,title,body,url,kind').is('pushed_at', null).order('id').limit(100)
  if (!rows || !rows.length) return { sent: 0 }
  const ids = rows.map((r) => r.id), now = new Date().toISOString()
  if (!pushReady()) { await s.from('notifications').update({ pushed_at: now }).in('id', ids); return { sent: 0, skipped: rows.length } }
  const w = await sender()
  const emails = [...new Set(rows.map((r) => r.user_email.toLowerCase()))]
  const { data: subs } = await s.from('push_subscriptions').select('id,user_email,endpoint,p256dh,auth').eq('app', 'app').is('failed_at', null).in('user_email', emails)
  let sent = 0
  for (const r of rows) {
    for (const sub of (subs || []).filter((x) => (x.user_email || '').toLowerCase() === r.user_email.toLowerCase())) {
      try {
        await w.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: r.title, body: r.body, url: r.url || '/crm', tag: 'crm-' + (r.kind || 'n') + '-' + r.id }), { TTL: 24 * 3600 })
        sent++; await s.from('push_subscriptions').update({ last_ok_at: now }).eq('id', sub.id)
      } catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await s.from('push_subscriptions').update({ failed_at: now }).eq('id', sub.id) }
    }
  }
  await s.from('notifications').update({ pushed_at: now }).in('id', ids)
  return { sent }
}
/** Pripomienky (12 h, 20 h, 24 h, každé 4 h po lehote, eskalácia): zapíše notifikácie a označí ich v leads.reminders. */
export async function createReminders(s) {
  const now = Date.now()
  const { data: leads } = await s.from('leads').select('id,name,city_group,city,source,stage,kind,alarm_hours,received_at,due_at,reminders,assigned_to').eq('stage', 'new').eq('kind', 'lead').not('due_at', 'is', null).lte('due_at', new Date(now + 13 * 3600e3).toISOString()).limit(500)
  let made = 0
  for (const l of leads || []) {
    const due = dueReminders(l, now)
    if (!due.length) continue
    const rem = { ...(l.reminders || {}) }
    for (const r of due) {
      const to = r.escalate ? [ASSIGNEES.escalate] : [l.assigned_to || ASSIGNEES.default]
      await s.from('notifications').insert(to.map((user_email) => ({ user_email, lead_id: l.id, kind: r.escalate ? 'escalation' : 'reminder', title: `${r.title}: ${l.name}`, body: [l.city_group !== 'Iné' ? l.city_group : l.city || '', l.source].filter(Boolean).join(' · '), url: `/crm/lead/${l.id}` })))
      rem[r.key] = 1; made++
    }
    await s.from('leads').update({ reminders: rem }).eq('id', l.id)
  }
  return { made }
}
