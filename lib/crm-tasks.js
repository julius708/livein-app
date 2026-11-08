// CRM úlohy k leadu: úvodný e-mail podľa typu služby (náhľad, úprava, odoslanie), obhliadka (termín, navigácia, notifikácie), vlastná úloha.
import { callClaude } from './anthropic.js'

export const SERVICES = { management: 'Správa bytu (management)', rent_to_rent: 'Garantovaný nájom (rent-to-rent)', other: 'Iné / ešte nevieme' }
export const TASK_KINDS = { intro_email: 'Úvodný e-mail', viewing: 'Obhliadka', custom: 'Úloha' }
const first = (name) => String(name || '').trim().split(/\s+/)[0] || ''
/** Oslovenie: krstné meno v 5. páde zjednodušene (Ján → Ján, Peter → Peter); bez skloňovania, ale zdvorilo. */
export const greeting = (lead) => { const f = first(lead.name); return f && !/@|\d/.test(f) ? `Dobrý deň, ${f}` : 'Dobrý deň' }

/** Šablóny úvodného e-mailu podľa služby (SK). {{personal}} doplní AI z poznámok, inak sa vynechá. */
export const TEMPLATES = {
  management: {
    subject: 'LIVE-IN: správa vášho bytu bez starostí',
    body: `{{greeting}},

ďakujeme za váš záujem o správu bytu s LIVE-IN. {{personal}}

Ako to u nás funguje:
• Postaráme sa o všetko: inzercia na Booking, Airbnb a ďalších portáloch, komunikácia s hosťami 24/7, upratovanie, údržba a vyúčtovanie.
• Vy dostávate mesačný výpis a peniaze na účet, bez starostí s hosťami.
• Naša provízia je zo skutočného príjmu, takže záleží nám na tom, aby byt zarábal čo najviac.

Rád/rada vám pripravím nezáväzný odhad výnosu pre váš byt a prejdeme si detaily na krátkej obhliadke. Napíšte mi prosím, kedy sa vám to hodí, alebo mi zavolajte.

S pozdravom
{{signature}}`,
  },
  rent_to_rent: {
    subject: 'LIVE-IN: garantovaný nájom za váš byt',
    body: `{{greeting}},

ďakujeme za váš záujem o garantovaný nájom s LIVE-IN. {{personal}}

Ako to u nás funguje:
• Byt si od vás prenajmeme na dlhšie obdobie a platíme pevný nájom každý mesiac, bez ohľadu na obsadenosť.
• O hostí, upratovanie a bežnú údržbu sa staráme my; byt vraciame v stave, v akom sme ho prevzali.
• Zmluva je jasná a férová, všetko si prejdeme vopred.

Rád/rada vám pripravím ponuku nájmu a dohodneme si obhliadku. Napíšte mi prosím, kedy sa vám to hodí, alebo mi zavolajte.

S pozdravom
{{signature}}`,
  },
  other: {
    subject: 'LIVE-IN: ďakujeme za váš dopyt',
    body: `{{greeting}},

ďakujeme za váš dopyt. {{personal}}

LIVE-IN sa stará o byty na krátkodobý prenájom v Bratislave, Košiciach a Trnave: od správy bytu s províziou po garantovaný nájom s pevnou mesačnou platbou. Rád/rada vám poradím, ktorá možnosť je pre váš byt výhodnejšia.

Napíšte mi prosím, kedy sa vám hodí krátky telefonát alebo obhliadka.

S pozdravom
{{signature}}`,
  },
}
export function signatureFor(me) { return [me.name || 'Tím LIVE-IN', 'LIVE-IN International', me.phone || '', me.email || '', 'www.live-in.international'].filter(Boolean).join('\n') }
export function fillTemplate(tpl, { lead, me, personal = '' }) {
  const g = greeting(lead)
  const body = tpl.body.replace('{{greeting}}', g).replace('{{personal}}', personal ? personal.trim() : '').replace('{{signature}}', signatureFor(me)).replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
  return { subject: tpl.subject, body }
}
/** Návrh úvodného e-mailu: šablóna podľa služby + osobný odsek z poznámok (AI), vždy ako editovateľný náhľad. */
export async function draftIntroEmail({ lead, me, notes = [], service }) {
  const tpl = TEMPLATES[service] || TEMPLATES.other
  let personal = '', ai = false
  const key = process.env.ANTHROPIC_API_KEY
  const noteText = notes.map((n) => `- ${n.text}`).join('\n').slice(0, 3000)
  if (key && noteText) {
    try {
      const r = await callClaude(key, { max_tokens: 400, system: 'Si asistent obchodníčky LIVE-IN (správa bytov na krátkodobý prenájom na Slovensku). Z poznámok z telefonátu napíš JEDEN krátky odsek (1 až 3 vety) do úvodného e-mailu majiteľovi bytu: zhrň, čo o jeho byte a potrebách vieme (napr. počet izieb, lokalita, od kedy je voľný, čo ho zaujíma) a nadviaž na to. Píš po slovensky, zdvorilo, vykaj, bez pozdravu a bez podpisu, bez vymyslených údajov. Ak v poznámkach nič užitočné nie je, vráť prázdny reťazec. Odpovedz len textom odseku.', messages: [{ role: 'user', content: `Meno: ${lead.name || ''}\nMesto: ${lead.city || lead.city_group || ''}\nSlužba: ${SERVICES[service] || 'nevieme'}\nPoznámky z hovorov:\n${noteText}` }] }, { timeoutMs: 20000 })
      if (r.ok) { const t = (r.json.content || []).map((c) => c.text || '').join('').trim(); if (t && t.length < 700) { personal = t; ai = true } }
    } catch { /* bez AI, šablóna */ }
  }
  return { ...fillTemplate(tpl, { lead, me, personal }), ai, service: TEMPLATES[service] ? service : 'other' }
}

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export const textToHtml = (text) => `<!doctype html><html lang="sk"><body style="margin:0;background:#F6F2EA;font-family:Figtree,Arial,sans-serif;color:#1F2A24"><div style="max-width:600px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:16px;padding:22px;line-height:1.55;font-size:15px;white-space:pre-wrap">${esc(text)}</div><p style="color:#5c6b63;font-size:12px;margin-top:16px">LIVE-IN International · live-in.international</p></div></body></html>`
export const crmFrom = (me) => (me.email && /@live-in\.international$/.test(me.email) ? `${me.name || 'LIVE-IN'} <${me.email}>` : process.env.CRM_FROM || 'LIVE-IN <info@live-in.international>')
/** Odoslanie e-mailu cez Resend (reply-to na odosielateľa). Vracia { ok, id | error }. */
export async function sendCrmMail({ to, subject, text, me }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'E-mail nie je nastavený (RESEND_API_KEY).' }
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: crmFrom(me), to: [to], reply_to: me.email || undefined, subject, text, html: textToHtml(text), tags: [{ name: 'kind', value: 'crm' }] }), cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${String(j.message || 'chyba').slice(0, 160)}` }
  return { ok: true, id: j.id || null }
}

export const mapsLink = (address) => (address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : '')
export const fmtWhen = (iso) => new Date(iso).toLocaleString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' })
/** E-mail klientovi s potvrdením obhliadky. */
export function viewingEmail({ lead, at, address, withName, me, note }) {
  const when = fmtWhen(at)
  return { subject: `Potvrdenie obhliadky: ${when}`, text: `${greeting(lead)},

potvrdzujeme termín obhliadky vášho bytu:

Kedy: ${when}
Kde: ${address || 'podľa dohody'}
Kto príde: ${withName || me.name || 'LIVE-IN'}${note ? `\n\n${note}` : ''}

Ak by vám termín nevyhovoval, stačí odpovedať na tento e-mail alebo zavolať.

S pozdravom
${signatureFor(me)}` }
}
