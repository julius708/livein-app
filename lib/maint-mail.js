// E-maily pilotu údržby (Resend). Test režim: len povolené adresy, inak sa správa uloží ako „potlačená“ a nič neodíde.
import { mailReady } from './mailer'
const API = 'https://api.resend.com'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (n, cur = 'EUR') => new Intl.NumberFormat('sk-SK', { style: 'currency', currency: cur }).format(Number(n) || 0)
export const maintFrom = () => process.env.MAINT_FROM || 'LIVE-IN Údržba <udrzba@live-in.international>'
export const maintReplyTo = () => process.env.MAINT_REPLY_TO || 'management@live-in.international'
/** Adresa, na ktorú odpovedajú dodávatelia: prijíma ju Resend (MX subdomény) a posiela webhookom do appky. */
export const maintInboundTo = () => process.env.MAINT_INBOUND_EMAIL || 'opravy@udrzba.live-in.international'

/** Pošle jeden e-mail. Vráti { ok, id, error }. Bez kľúča vráti ok:false (nič neodíde). */
export async function sendMail({ to, subject, html, text, tag, replyTo }) {
  if (!mailReady()) return { ok: false, error: 'Chýba RESEND_API_KEY' }
  const res = await fetch(`${API}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: maintFrom(), to: [to], subject, html, text, reply_to: replyTo || maintReplyTo(), tags: tag ? [{ name: 'kind', value: tag }] : undefined }), cache: 'no-store' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${String(j.message || j.name || 'chyba').slice(0, 200)}` }
  return { ok: true, id: j.id || null }
}

const shell = (title, body) => `<!doctype html><html lang="sk"><body style="margin:0;background:#F6F2EA;font-family:Figtree,Arial,sans-serif;color:#1F2A24"><div style="max-width:600px;margin:0 auto;padding:24px 16px"><div style="background:#173E2C;color:#fff;border-radius:16px 16px 0 0;padding:18px 22px;font-weight:800;font-size:18px">LIVE-IN · Údržba</div><div style="background:#fff;border-radius:0 0 16px 16px;padding:22px;line-height:1.55;font-size:15px"><h1 style="font-size:20px;margin:0 0 12px;color:#173E2C">${esc(title)}</h1>${body}<p style="color:#5c6b63;font-size:12px;margin-top:22px">LIVE-IN International · Tento e-mail sa týka opravy vo Vašom byte. Odpoveď cez tlačidlo je záväzná až po potvrdení na stránke.</p></div></div></body></html>`

/** E-mail so žiadosťou o súhlas: dopad, čo tím skúsil, rozsah a položky, strop, termín, prílohy, tlačidlo Zobraziť ponuku. */
export function approvalEmail({ ref, listingName, ownerName, impact, tried, quote, vendorName, limit, due, url, items = [], attachments = [] }) {
  const rows = (items || []).map((it) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #eee">${esc(it.name)}</td><td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right">${esc(it.qty || 1)}×</td><td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right">${money(it.price, quote.currency)}</td></tr>`).join('')
  const extras = [['Výjazd', quote.callout], ['Diagnostika', quote.diagnostics], ['Materiál', quote.material]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `<tr><td style="padding:4px 6px" colspan="2">${k}</td><td style="padding:4px 6px;text-align:right">${money(v, quote.currency)}</td></tr>`).join('')
  const vat = { with_vat: 's DPH', without_vat: 'bez DPH', not_vat_payer: 'dodávateľ nie je platca DPH' }[quote.vat_mode] || ''
  const att = (attachments || []).map((a) => `<li><a href="${esc(a.url)}">${esc(a.name || 'príloha')}</a></li>`).join('')
  const subject = `Súhlas s opravou ${ref}: ${listingName}, ${money(quote.total, quote.currency)} ${vat}`
  const html = shell(`Oprava v byte ${listingName}`, `
    <p>Dobrý deň${ownerName ? ', ' + esc(ownerName) : ''},</p>
    <p><b>Dopad:</b> ${esc(impact)}</p>
    <p><b>Čo sme skúsili:</b> ${esc(tried || 'Interný údržbár poruchu preveril, oprava vyžaduje odborný servis.')}</p>
    <p><b>Rozsah${quote.kind === 'replacement' ? ' (výmena)' : ''}:</b> ${esc(quote.note || '')}${vendorName ? ` · dodávateľ ${esc(vendorName)}` : ''}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}${extras}<tr><td style="padding:8px 6px;font-weight:800;border-top:2px solid #173E2C" colspan="2">Spolu (${vat})</td><td style="padding:8px 6px;font-weight:800;text-align:right;border-top:2px solid #173E2C">${money(quote.total, quote.currency)}</td></tr></table>
    <p><b>Strop:</b> ${money(quote.total, quote.currency)} (suma sa bez Vášho nového súhlasu nezvýši)${limit ? ` · Váš bežný limit ${money(limit, quote.currency)}` : ''}<br><b>Termín:</b> ${esc(quote.eta || due || 'po Vašom súhlase najbližší voľný termín')}${quote.valid_until ? `<br><b>Platnosť ponuky:</b> ${esc(quote.valid_until)}` : ''}</p>
    ${att ? `<p><b>Prílohy:</b></p><ul>${att}</ul>` : ''}
    <p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:#F46D16;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Zobraziť ponuku a rozhodnúť</a></p>
    <p style="color:#5c6b63;font-size:13px">Odkaz je osobný, platí obmedzený čas. Na stránke môžete opravu schváliť, odmietnuť alebo položiť otázku. Otvorenie odkazu nič nerozhoduje.</p>`)
  const text = `Oprava ${ref} v byte ${listingName}. Dopad: ${impact}. Rozsah: ${quote.note || ''}. Spolu ${money(quote.total, quote.currency)} ${vat}. Termín: ${quote.eta || due || ''}. Rozhodnite tu: ${url}`
  return { subject, html, text }
}

export function reminderEmail({ ref, listingName, url, n }) {
  return { subject: `Pripomienka ${n}: súhlas s opravou ${ref} (${listingName})`, html: shell('Čakáme na Vaše rozhodnutie', `<p>Pred časom sme Vám poslali ponuku na opravu v byte <b>${esc(listingName)}</b> (${esc(ref)}). Bez Vášho rozhodnutia opravu neobjednáme.</p><p><a href="${esc(url)}" style="display:inline-block;background:#F46D16;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Zobraziť ponuku a rozhodnúť</a></p>`), text: `Pripomienka: ponuka na opravu ${ref} v byte ${listingName} čaká na rozhodnutie: ${url}` }
}

/** Dopyt dodávateľovi: odkaz na formulár ponuky s obmedzenou platnosťou. */
export function vendorRequestEmail({ ref, tag, listingName, locality, category, symptoms, severity, url, expiresAt }) {
  return { subject: `Dopyt na opravu ${tag} ${category}, ${locality || listingName}`, html: shell(`Dopyt na opravu ${esc(ref)}`, `<p><b>Byt:</b> ${esc(listingName)}${locality ? ', ' + esc(locality) : ''}<br><b>Kategória:</b> ${esc(category)} · <b>naliehavosť:</b> ${esc(severity)}</p><p><b>Popis:</b> ${esc(symptoms)}</p><p>Prosíme o cenovú ponuku alebo odmietnutie cez odkaz (platí do ${esc(expiresAt)}):</p><p><a href="${esc(url)}" style="display:inline-block;background:#173E2C;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Poslať ponuku</a></p><p style="color:#5c6b63;font-size:13px">Odpoveď e-mailom spracujeme tiež, ponechajte v predmete značku ${esc(tag)}.</p>`), text: `Dopyt ${tag}: ${listingName}, ${category}. ${symptoms}. Ponuka: ${url}` }
}
