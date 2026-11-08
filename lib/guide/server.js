// Sprievodca bytom: serverové operácie nad Supabase. Verejné stránky číta servisný účet (rola bot), tím pracuje pod vlastným prihlásením.
import { createHmac, createHash } from 'node:crypto'
import { adminClientAsync } from '../supabase-admin'
import { randomCode, isCode, wifiDecision, rateLimited, WIFI_LIMITS, anonLog, issuePlan, visibleEvents, guideUrl, reviewUrl, TEMPLATE_VERSION } from './core.js'
import { reservationByCode } from '../guesty'
import { renderLabel } from './label.js'

const iso = (d = Date.now()) => new Date(d).toISOString()
const secret = () => process.env.GUIDE_SECRET || process.env.CRON_SECRET || 'dev-only-secret'
const h = (s) => createHash('sha256').update(secret() + '|' + String(s || '')).digest('hex').slice(0, 32)
export const baseUrl = async (s) => { const g = await settings(s); return (g.general.base_url || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.live-in.international').replace(/\/+$/, '') }

export async function settings(s) {
  const { data } = await s.from('guide_settings').select('key,value')
  const o = {}; for (const r of data || []) o[r.key] = r.value || {}
  return { general: o.general || {}, pilot: o.pilot || {} }
}

/** Jednotka pre listing: ak chýba, vytvorí sa s trvalým náhodným kódom (kolízia sa rieši novým kódom). */
export async function ensureUnit(s, listing, who = 'system') {
  const { data: ex } = await s.from('guide_units').select('*').eq('listing_id', listing.guesty_id).maybeSingle()
  if (ex) return ex
  for (let i = 0; i < 5; i++) {
    const row = { listing_id: listing.guesty_id, public_code: randomCode(), name: listing.name || listing.title || null, city: listing.city || null, listing_verified: true, status: 'draft' }
    const { data, error } = await s.from('guide_units').insert(row).select('*').single()
    if (!error) return data
    if (!/public_code|unique|duplicate/i.test(error.message)) throw new Error(error.message)
    if (/listing_id/i.test(error.message)) { const { data: again } = await s.from('guide_units').select('*').eq('listing_id', listing.guesty_id).maybeSingle(); if (again) return again }
  }
  throw new Error('Nepodarilo sa prideliť unikátny kód.')
}

/** Verejný obsah sprievodcu podľa kódu (bez Wi-Fi hesla, bez kódov). */
export async function guideByCode(code) {
  if (!isCode(code)) return null
  const s = await adminClientAsync()
  const { data: u } = await s.from('guide_units').select('listing_id,public_code,name,address,city,status,support_phone,gbp_url').eq('public_code', code).maybeSingle()
  if (!u || u.status === 'inactive') return null
  const city = (u.city || '').split(/[\s-]/)[0]
  const [{ data: card }, { data: rules }, { data: tips }, { data: events }, g] = await Promise.all([
    s.from('guide_cards').select('address,address_note,map_url,lat,lng,parking,rules_override,checkout_time,checkout,arrival,help,approved').eq('listing_id', u.listing_id).maybeSingle(),
    s.from('guide_rules').select('city,body,sort').eq('active', true).order('sort'),
    s.from('guide_tips').select('city,category,title,body,url,sort').eq('active', true).ilike('city', `${city}%`).order('sort'),
    s.from('guide_events').select('city,title,body,place,url,starts_at,ends_at,active').ilike('city', `${city}%`).gte('ends_at', iso()).order('starts_at'),
    settings(s),
  ])
  const unit = { ...u, listing_id: undefined }
  return { unit, card: card || {}, rules: (rules || []).filter((r) => !r.city || String(u.city || '').toLowerCase().startsWith(String(r.city).toLowerCase())), tips: tips || [], events: visibleEvents(events || []), support_phone: u.support_phone || g.general.support_phone || '', has_wifi: true }
}

async function count(s, bucket, minutes) {
  const { count: n } = await s.from('guide_wifi_attempts').select('id', { count: 'exact', head: true }).eq('bucket', bucket).gte('at', iso(Date.now() - minutes * 60e3))
  return n || 0
}
/** Wi-Fi: overenie e-mailu a čísla rezervácie v Guesty. Odpoveď nikdy neprezradí, či rezervácia existuje. */
export async function wifiRequest({ code, email, reservationCode, ip }) {
  const generic = { ok: false }
  if (!isCode(code)) return generic
  const s = await adminClientAsync()
  const buckets = { ip: `ip:${h(ip)}`, reservation: `res:${h(String(reservationCode || '').trim().toUpperCase())}`, unit: `unit:${code}` }
  const counts = { ip: await count(s, buckets.ip, WIFI_LIMITS.ip.minutes), reservation: await count(s, buckets.reservation, WIFI_LIMITS.reservation.minutes), unit: await count(s, buckets.unit, WIFI_LIMITS.unit.minutes) }
  await s.from('guide_wifi_attempts').insert(Object.values(buckets).map((bucket) => ({ bucket })))
  if (Math.random() < 0.05) await s.from('guide_wifi_attempts').delete().lt('at', iso(Date.now() - 24 * 3600e3))
  if (rateLimited(counts)) { await s.from('guide_wifi_log').insert(anonLog({ code, outcome: 'limited' })); return generic }
  const { data: unit } = await s.from('guide_units').select('listing_id,public_code,status').eq('public_code', code).maybeSingle()
  if (!unit || unit.status === 'inactive') { await s.from('guide_wifi_log').insert(anonLog({ code, outcome: 'fail' })); return generic }
  let reservation = null
  try { reservation = await reservationByCode(reservationCode) } catch (e) { console.error('[guide] guesty', String(e && e.message).slice(0, 60)); await s.from('guide_wifi_log').insert(anonLog({ code, outcome: 'error' })); return generic }
  const d = wifiDecision({ unit, reservation, email, today: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bratislava' }) })
  if (!d.ok) { await s.from('guide_wifi_log').insert(anonLog({ code, outcome: 'fail' })); return generic }
  const { data: wifi } = await s.from('guide_wifi').select('ssid,password').eq('listing_id', unit.listing_id).maybeSingle()
  if (!wifi) { await s.from('guide_wifi_log').insert(anonLog({ code, outcome: 'error' })); return generic }
  await s.from('guide_wifi_log').insert(anonLog({ code, outcome: 'success' }))
  const em = String(email).trim().toLowerCase()
  await s.from('guide_guest_emails').upsert({ listing_id: unit.listing_id, reservation_id: d.reservationId, email: em }, { onConflict: 'reservation_id,email', ignoreDuplicates: true })
  // krátkodobý podpis na potvrdenie e-mailu a súhlas s newsletterom (len v pamäti klienta, nie v URL)
  const exp = Date.now() + 2 * 3600e3
  const sig = createHmac('sha256', secret()).update(`${d.reservationId}|${em}|${exp}`).digest('hex')
  return { ok: true, ssid: wifi.ssid, password: wifi.password, confirm: Buffer.from(JSON.stringify({ r: d.reservationId, e: em, x: exp, s: sig })).toString('base64url') }
}
/** Potvrdenie e-mailu po pripojení a samostatný súhlas s newsletterom. */
export async function confirmGuestEmail(token, { newsletter = false } = {}) {
  let t; try { t = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString()) } catch { return { ok: false } }
  if (!t || !t.r || !t.e || !t.x || Date.now() > Number(t.x)) return { ok: false }
  const sig = createHmac('sha256', secret()).update(`${t.r}|${t.e}|${t.x}`).digest('hex')
  if (sig !== t.s) return { ok: false }
  const s = await adminClientAsync()
  const { error } = await s.from('guide_guest_emails').update({ verified_at: iso(), newsletter_consent: !!newsletter, consent_at: newsletter ? iso() : null }).eq('reservation_id', t.r).eq('email', t.e)
  return { ok: !error }
}
export async function saveFeedback(code, { rating, text, contact, lang }) {
  if (!isCode(code)) return { ok: false }
  const s = await adminClientAsync()
  const { data: unit } = await s.from('guide_units').select('listing_id').eq('public_code', code).maybeSingle()
  if (!unit) return { ok: false }
  const r = Number(rating); const txt = String(text || '').trim().slice(0, 2000)
  if (!txt && !(r >= 1 && r <= 5)) return { ok: false, error: 'empty' }
  const { error } = await s.from('guide_feedback').insert({ listing_id: unit.listing_id, public_code: code, rating: r >= 1 && r <= 5 ? r : null, text: txt || null, contact: String(contact || '').trim().slice(0, 200) || null, lang: lang === 'en' ? 'en' : 'sk' })
  return { ok: !error }
}

/** Kontrola oboch produkčných odkazov pre ten istý byt (stránka existuje a nesie kód). */
export async function checkLinks(base, code, { fetchImpl = fetch } = {}) {
  const out = { guide_ok: false, review_ok: false }
  for (const [k, url] of [['guide_ok', guideUrl(base, code)], ['review_ok', reviewUrl(base, code)]]) {
    try { const r = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'livein-guide-check' } }); const t = r.ok ? await r.text() : ''; out[k] = r.ok && t.includes(`data-code="${code}"`) } catch { out[k] = false }
  }
  return out
}
/** Vydanie štítku: všetky podmienky, idempotentne podľa listing_id + verzia šablóny; oznámenie len raz. */
export async function issueLabel(s, listingId, who = 'system', { checkLinksImpl = checkLinks, notifyImpl = notify } = {}) {
  const [{ data: unit }, { data: card }, g, { data: existing }, { data: listing }] = await Promise.all([
    s.from('guide_units').select('*').eq('listing_id', listingId).maybeSingle(),
    s.from('guide_cards').select('address,approved').eq('listing_id', listingId).maybeSingle(),
    settings(s),
    s.from('guide_label_issues').select('id,listing_id,template_version,notified_at,issued_at').eq('listing_id', listingId),
    s.from('listings').select('guesty_id,active').eq('guesty_id', listingId).maybeSingle(),
  ])
  if (!unit) return { ok: false, error: 'Jednotka neexistuje.' }
  const base = await baseUrl(s)
  const supportPhone = unit.support_phone || (g.general.support_phone_verified ? g.general.support_phone : '')
  const u = { ...unit, listing_verified: !!(listing && listing.active), address: unit.address || (card && card.address) }
  const links = u.listing_verified && isCode(u.public_code) ? await checkLinksImpl(base, u.public_code) : { guide_ok: false, review_ok: false }
  const plan = issuePlan({ unit: u, card, support_phone: supportPhone, links, existing: existing || [], templateVersion: Number(g.general.template_version) || TEMPLATE_VERSION })
  if (plan.status === 'review') {
    await s.from('guide_units').update({ status: 'review', review_reason: plan.reasons.join('; ') }).eq('listing_id', listingId)
    return { ok: false, status: 'review', reasons: plan.reasons }
  }
  if (plan.status === 'issued') {
    if (plan.notify) await notifyImpl(s, unit, plan.existing)
    return { ok: true, status: 'issued', existing: plan.existing.id, duplicate: true }
  }
  const tv = Number(g.general.template_version) || TEMPLATE_VERSION
  const { bytes } = await renderLabel({ address: u.address, name: unit.name, code: unit.public_code, supportPhone, baseUrl: base, variant: g.general.label_variant === 'inverted' ? 'inverted' : 'standard' })
  const { data: issue, error } = await s.from('guide_label_issues').insert({ listing_id: listingId, template_version: tv, variant: g.general.label_variant === 'inverted' ? 'inverted' : 'standard', address: u.address, support_phone: supportPhone, pdf: '\\x' + Buffer.from(bytes).toString('hex'), pdf_bytes: bytes.length, issued_by: who }).select('id,listing_id,template_version,notified_at').single()
  if (error) {
    if (/duplicate|unique/i.test(error.message)) { const { data: ex } = await s.from('guide_label_issues').select('id,listing_id,template_version,notified_at').eq('listing_id', listingId).eq('template_version', tv).maybeSingle(); return { ok: true, status: 'issued', existing: ex && ex.id, duplicate: true } }
    return { ok: false, error: error.message }
  }
  await s.from('guide_units').update({ status: 'active', review_reason: null }).eq('listing_id', listingId)
  await notifyImpl(s, unit, issue)
  return { ok: true, status: 'issued', issue: issue.id }
}
/** Oznámenie s odkazom na tlač do schváleného interného kanála: in-app notifikácie tímu (a voliteľne webhook). Len raz. */
export async function notify(s, unit, issue) {
  if (!issue || issue.notified_at) return false
  const { data: lock } = await s.from('guide_label_issues').update({ notified_at: iso(), notify_channel: process.env.GUIDE_NOTIFY_WEBHOOK ? 'app+webhook' : 'app' }).eq('id', issue.id).is('notified_at', null).select('id')
  if (!lock || !lock.length) return false
  const base = await baseUrl(s)
  const url = `${base}/sprievodca/stitok/${issue.id}`
  const { data: people } = await s.from('app_users').select('email,roles').eq('active', true)
  const to = (people || []).filter((p) => (p.roles || []).some((r) => ['admin', 'operations'].includes(r)) && !p.email.startsWith('crm-bot')).map((p) => p.email)
  if (to.length) await s.from('notifications').insert(to.map((user_email) => ({ user_email, kind: 'guide', title: `Štítok na tlač: ${unit.name || unit.listing_id}`, body: `Verzia ${issue.template_version} · ${unit.address || ''}`, url: `/sprievodca/stitok/${issue.id}` })))
  if (process.env.GUIDE_NOTIFY_WEBHOOK) { try { await fetch(process.env.GUIDE_NOTIFY_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `Štítok na tlač: ${unit.name || unit.listing_id} (v${issue.template_version}) ${url}` }), signal: AbortSignal.timeout(8000) }) } catch (e) { console.error('[guide] webhook', e && e.message) } }
  return true
}
/** Synchronizácia portfólia: pre každý aktívny listing bez jednotky vytvorí záznam; pre pripravené jednotky skúsi vydať štítok. */
export async function syncUnits({ issue = true } = {}) {
  const s = await adminClientAsync()
  const { data: listings } = await s.from('listings').select('guesty_id,name,title,city,active').eq('active', true).limit(2000)
  const { data: units } = await s.from('guide_units').select('listing_id,status')
  const have = new Set((units || []).map((u) => u.listing_id))
  const g = await settings(s)
  const pilot = new Set((g.pilot.units || []).map((x) => String(x.listing_id || x)))
  let created = 0, issued = 0, review = 0
  for (const l of listings || []) { if (!have.has(l.guesty_id)) { await ensureUnit(s, l); created++ } }
  if (issue && pilot.size) {
    for (const id of pilot) { const r = await issueLabel(s, id, 'sync'); if (r.ok && !r.duplicate) issued++; else if (r.status === 'review') review++ }
  }
  return { listings: (listings || []).length, created, issued, review, pilot_units: pilot.size }
}
