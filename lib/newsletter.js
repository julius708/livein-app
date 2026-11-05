// Newsletter pre majiteľov: čisté funkcie (publikum, šablóna, čistenie HTML). Bez serverových závislostí, aby sa dali testovať.
import { OPEN_STAGES } from './crm.js'
import { fmtDateTime } from './fmt.js'

export const AUDIENCES = [
  { id: 'clients', title: 'Klienti (majitelia bytov)', desc: 'Predvolené publikum: všetci klienti s e-mailom, ktorí sa neodhlásili.' },
  { id: 'clients_city', title: 'Klienti z jedného mesta', desc: 'Klienti podľa mesta (Bratislava, Košice, Trnava, Iné).' },
  { id: 'leads_open', title: 'Rozpracované leady (opatrne)', desc: 'Leady v štádiách Nový až Ponuka. Leady nikdy nie sú v predvolenom publiku; posielaj im len cielené správy.' },
  { id: 'custom', title: 'Vlastný zoznam e-mailov', desc: 'Vlož adresy oddelené čiarkou alebo riadkom. Odhlásení sa vynechajú.' },
]
export const AUDIENCE_IDS = AUDIENCES.map((a) => a.id)
export const audienceOf = (id) => AUDIENCES.find((a) => a.id === id) || AUDIENCES[0]

export const normEmail = (e) => String(e || '').trim().toLowerCase()
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e))
export function parseEmails(text) {
  const out = new Set()
  for (const t of String(text || '').split(/[\s,;]+/)) { const e = normEmail(t); if (validEmail(e)) out.add(e) }
  return [...out]
}

/** Vyberie príjemcov z leadov (klienti/leady) podľa publika. Vynechá bez e-mailu, odhlásených (HubSpot aj vlastné odhlásenie) a duplicity. */
export function pickRecipients(leads, audience, { unsubscribed = [] } = {}) {
  const a = audience || { kind: 'clients' }
  const blocked = new Set((unsubscribed || []).map(normEmail))
  const okLead = (l) => l.email && validEmail(l.email) && !l.email_optout && l.marketing_ok !== false && !blocked.has(normEmail(l.email))
  let pool = []
  if (a.kind === 'clients') pool = leads.filter((l) => l.kind === 'client')
  else if (a.kind === 'clients_city') pool = leads.filter((l) => l.kind === 'client' && (l.city_group || 'Iné') === (a.city_group || 'Bratislava'))
  else if (a.kind === 'leads_open') pool = leads.filter((l) => l.kind === 'lead' && OPEN_STAGES.includes(l.stage))
  else if (a.kind === 'custom') {
    const byEmail = new Map(leads.filter((l) => l.email).map((l) => [normEmail(l.email), l]))
    return parseEmails(a.emails).filter((e) => !blocked.has(e)).map((e) => { const l = byEmail.get(e); return l && (l.email_optout || l.marketing_ok === false) ? null : { email: e, name: l?.name || '', lead_id: l?.id || null } }).filter(Boolean)
  }
  const seen = new Set(), out = []
  for (const l of pool) { if (!okLead(l)) continue; const e = normEmail(l.email); if (seen.has(e)) continue; seen.add(e); out.push({ email: e, name: l.name || '', lead_id: l.id }) }
  return out
}

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''
/** {{meno}} → krstné meno alebo oslovenie. */
export const personalize = (html, name) => String(html || '').replace(/\{\{\s*meno\s*\}\}/gi, firstName(name) || 'majiteľ')

/** Povolíme len bezpečné značky z návrhu (žiadne skripty, štýly, udalosti). */
const ALLOWED = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'img', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'span', 'div']
export function sanitizeHtml(html) {
  let s = String(html || '')
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
    const t = tag.toLowerCase()
    if (!ALLOWED.includes(t)) return ''
    if (m.startsWith('</')) return `</${t}>`
    let keep = ''
    if (t === 'a') { const h = /href\s*=\s*["']?([^"'\s>]+)/i.exec(attrs); if (h && /^(https?:|mailto:|tel:)/i.test(h[1])) keep = ` href="${h[1].replace(/"/g, '')}"` }
    if (t === 'img') { const src = /src\s*=\s*["']?([^"'\s>]+)/i.exec(attrs); if (!src || !/^https:/i.test(src[1])) return ''; const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(attrs); keep = ` src="${src[1].replace(/"/g, '')}" alt="${alt ? alt[1] : ''}" style="max-width:100%;height:auto;border-radius:10px"` }
    return `<${t}${keep}>`
  })
  return s.trim()
}
export const htmlToText = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h1|h2|h3|li|tr|div|blockquote)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim()

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/** Celý e-mail vo farbách LIVE-IN (tabuľková šablóna, funguje v Gmaile aj Outlooku). */
export function renderEmail({ subject, preheader = '', bodyHtml, unsubscribeUrl = '#', name = '' }) {
  const body = personalize(sanitizeHtml(bodyHtml), name)
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F2F3EE;font-family:Helvetica,Arial,sans-serif;color:#233E31">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F2F3EE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%">
<tr><td style="background:#173E2C;border-radius:18px 18px 0 0;padding:22px 28px;color:#fff"><span style="font-size:22px;font-weight:800;letter-spacing:.04em">LIVE-IN</span><span style="font-size:12px;opacity:.8;margin-left:10px">newsletter pre majiteľov</span></td></tr>
<tr><td style="background:#ffffff;padding:28px 28px 8px;font-size:16px;line-height:1.6">
<style>h1{font-size:26px;line-height:1.2;margin:0 0 14px;color:#173E2C}h2{font-size:20px;margin:22px 0 8px;color:#173E2C}p{margin:0 0 14px}a{color:#F46D16}ul,ol{margin:0 0 14px 22px;padding:0}li{margin:0 0 6px}blockquote{margin:0 0 14px;padding:10px 16px;border-left:4px solid #F46D16;background:#FFF3E8;border-radius:8px}hr{border:0;border-top:1px solid #e3e6df;margin:20px 0}</style>
${body}
</td></tr>
<tr><td style="background:#ffffff;padding:8px 28px 28px;font-size:14px;line-height:1.6;color:#58665D">Srdečne,<br><strong style="color:#173E2C">tím LIVE-IN</strong><br><a href="https://live-in.international" style="color:#F46D16">live-in.international</a></td></tr>
<tr><td style="background:#E9EDE6;border-radius:0 0 18px 18px;padding:16px 28px;font-size:12px;line-height:1.5;color:#66716A">Tento e-mail dostávate, lebo ste majiteľom bytu v správe LIVE-IN alebo ste nás oslovili. <a href="${esc(unsubscribeUrl)}" style="color:#66716A">Odhlásiť sa z newslettera</a></td></tr>
</table></td></tr></table></body></html>`
}

/** Z odpovede modelu vytiahne JSON (aj keď je obalený textom alebo ```json). */
export function extractJson(text) {
  const t = String(text || '')
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  const cand = [fence ? fence[1] : null, t.slice(t.indexOf('['), t.lastIndexOf(']') + 1), t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)].filter(Boolean)
  for (const c of cand) { try { return JSON.parse(c) } catch {} }
  return null
}
export const fmtDT = (iso) => fmtDateTime(iso, '')
