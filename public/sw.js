/* Service worker hlavnej appky LIVE-IN: push notifikácie (CRM) a otvorenie karty leadu po ťuknutí. Bez cache. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(data.title || 'LIVE-IN', { body: data.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: data.tag || undefined, renotify: !!data.tag, data: { url: data.url || '/crm' }, vibrate: [120, 60, 120] }))
})
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription || null
  const key = (old && old.options && old.options.applicationServerKey) || (event.newSubscription && event.newSubscription.options && event.newSubscription.options.applicationServerKey) || null
  event.waitUntil((async () => {
    const sub = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null)
    if (!sub) return
    const j = sub.toJSON()
    await fetch('/api/push/subscription', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, oldEndpoint: old ? old.endpoint : null }) })
  })().catch(() => {}))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/crm'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => { for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus() } } return self.clients.openWindow(url) }))
})
