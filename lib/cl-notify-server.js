// Upratovanie: odosielanie upozornení ľuďom. Najprv push (ak má človek zapnutý odber a sú nastavené VAPID kľúče), inak e-mail (ak je Resend).
// Beží len na serveri s právomocou servisu (adminClientAsync). Chyby sa nikdy nehádžu: upozornenie je doplnok, nie podmienka práce.
import { emailFor } from './cl-notify.js'

async function pusher() {
  const w = (await import('web-push')).default
  w.setVapidDetails(process.env.WEB_PUSH_SUBJECT || 'mailto:info@live-in.international', process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY, process.env.WEB_PUSH_PRIVATE_KEY)
  return w
}

/**
 * @param {Array<{email:string,title:string,body:string,url?:string,tag?:string}>} items  jedna správa pre jedného človeka
 * @returns {{push:number,email:number,failed:number}}
 */
export async function notifyPeople(items, origin, deps = {}) {
  const out = { push: 0, email: 0, failed: 0 }
  const list = (items || []).filter((x) => x && x.email)
  if (!list.length) return out
  try {
    const s = deps.admin || (await (await import('./supabase-admin.js')).adminClientAsync())
    const pushOk = deps.pushReady || (await import('./crm-push.js')).pushReady
    const mail = deps.mailReady && deps.sendMail ? { mailReady: deps.mailReady, sendMail: deps.sendMail } : await import('./mailer.js')
    const emails = [...new Set(list.map((x) => x.email.toLowerCase()))]
    const delivered = new Set()
    if (pushOk()) {
      const w = await (deps.pusher || pusher)()
      const { data: subs } = await s.from('push_subscriptions').select('id,user_email,endpoint,p256dh,auth').eq('app', 'app').is('failed_at', null).in('user_email', emails)
      const now = new Date().toISOString()
      for (const it of list) {
        for (const sub of (subs || []).filter((x) => (x.user_email || '').toLowerCase() === it.email.toLowerCase())) {
          try {
            await w.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: it.title, body: it.body, url: it.url || '/uprat', tag: it.tag }))
            delivered.add(it.email.toLowerCase()); out.push++
            await s.from('push_subscriptions').update({ last_ok_at: now }).eq('id', sub.id)
          } catch (e) {
            if (e && (e.statusCode === 404 || e.statusCode === 410)) await s.from('push_subscriptions').update({ failed_at: now }).eq('id', sub.id)
            else out.failed++
          }
        }
      }
    }
    if (mail.mailReady()) {
      for (const it of list) {
        if (delivered.has(it.email.toLowerCase())) continue
        const r = await mail.sendMail({ to: it.email, ...emailFor(it, origin) })
        if (r.ok) out.email++; else out.failed++
      }
    }
  } catch (e) {
    console.error('[upratovanie] upozornenia', String(e && e.message).slice(0, 120))
    out.failed++
  }
  return out
}
