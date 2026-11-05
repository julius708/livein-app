// HubSpot (portál 48987752): token HUBSPOT_TOKEN len na serveri. Do logov nikdy nejdú e-maily ani telefóny.
const API = 'https://api.hubapi.com'
export const CONTACT_PROPS = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'city', 'lifecyclestage', 'hs_lead_status', 'createdate', 'lastmodifieddate', 'hs_object_source_label', 'hs_object_source_detail_1', 'hs_analytics_source', 'hs_email_optout', 'hs_marketable_status', 'hubspot_owner_id', 'address', 'zip', 'company']
export const hubspotReady = () => !!process.env.HUBSPOT_TOKEN

async function hs(path, { method = 'GET', body, retry = 1 } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (res.status === 429 && retry > 0) { await new Promise((r) => setTimeout(r, 1500)); return hs(path, { method, body, retry: retry - 1 }) }
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(`HubSpot ${res.status}: ${String(j.message || j.category || 'chyba').slice(0, 160)}`); e.status = res.status; throw e }
  return j
}

const search = (filters, { properties = CONTACT_PROPS, limit = 10, after, sorts } = {}) => hs('/crm/v3/objects/contacts/search', { method: 'POST', body: { filterGroups: filters, properties, limit, ...(after ? { after } : {}), ...(sorts ? { sorts } : {}) } })

export async function findContactByEmail(email) {
  if (!email) return null
  const j = await search([{ filters: [{ propertyName: 'email', operator: 'EQ', value: String(email).trim().toLowerCase() }] }], { limit: 1 })
  return (j.results || [])[0] || null
}
export async function findContactByPhone(phone) {
  if (!phone) return null
  const j = await search([{ filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] }, { filters: [{ propertyName: 'mobilephone', operator: 'EQ', value: phone }] }], { limit: 1 })
  return (j.results || [])[0] || null
}
export const createContact = (properties) => hs('/crm/v3/objects/contacts', { method: 'POST', body: { properties } })
export const updateContact = (id, properties) => hs(`/crm/v3/objects/contacts/${id}`, { method: 'PATCH', body: { properties } })
export const getContact = (id) => hs(`/crm/v3/objects/contacts/${id}?properties=${CONTACT_PROPS.join(',')}`)

/** Poznámka na karte kontaktu (asociácia 202 = note → contact). */
export const addNote = (contactId, text) => hs('/crm/v3/objects/notes', { method: 'POST', body: { properties: { hs_timestamp: new Date().toISOString(), hs_note_body: String(text).slice(0, 5000) }, associations: [{ to: { id: String(contactId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] } })

/** Všetky kontakty po stránkach (na import). */
export async function* allContacts(properties = CONTACT_PROPS) {
  let after = ''
  for (let i = 0; i < 200; i++) {
    const j = await hs(`/crm/v3/objects/contacts?limit=100&properties=${properties.join(',')}${after ? `&after=${after}` : ''}`)
    for (const c of j.results || []) yield c
    after = j.paging && j.paging.next && j.paging.next.after
    if (!after) break
  }
}
/** Kontakty zmenené od času (na pravidelný sync), max 1 000. */
export async function contactsModifiedSince(sinceIso) {
  const out = []; let after
  for (let i = 0; i < 10; i++) {
    const j = await search([{ filters: [{ propertyName: 'lastmodifieddate', operator: 'GT', value: String(Date.parse(sinceIso)) }] }], { limit: 100, after, sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }] })
    out.push(...(j.results || []))
    after = j.paging && j.paging.next && j.paging.next.after
    if (!after) break
  }
  return out
}
export const optedOut = (p) => String(p.hs_email_optout) === 'true'
export const marketable = (p) => !optedOut(p) && String(p.hs_marketable_status || 'true') !== 'false'
/** Odhlásenie zo všetkých e-mailových odberov (GDPR). Použije sa po kliknutí na „Odhlásiť sa“ v newsletteri. */
export const unsubscribeAll = (email) => hs('/communication-preferences/v3/unsubscribe-all', { method: 'POST', body: { emailAddress: String(email).toLowerCase() } })

/** Bez tokenu: zápis cez Zapier (catch hook → HubSpot účet pripojený v Zapieri). Výsledok príde späť na /api/crm/hubspot-callback. */
export const zapierReady = () => !!process.env.HUBSPOT_ZAPIER_HOOK_URL
export async function viaZapier(payload) {
  const base = (process.env.APP_URL || 'https://app.live-in.international').replace(/\/$/, '')
  const res = await fetch(process.env.HUBSPOT_ZAPIER_HOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'sync', ...payload, callbackUrl: `${base}/api/crm/hubspot-callback`, callbackSecret: process.env.CRM_WEBHOOK_SECRET || '' }), cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Zapier hook ${res.status}`)
  return res.json().catch(() => ({}))
}
export const writeReady = () => hubspotReady() || zapierReady()
