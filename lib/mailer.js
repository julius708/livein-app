// Odosielanie e-mailov cez Resend (RESEND_API_KEY). Kľúč len na serveri; do logov nejdú adresy.
const API = 'https://api.resend.com'
export const mailReady = () => !!process.env.RESEND_API_KEY
export const mailFrom = () => process.env.NEWSLETTER_FROM || 'LIVE-IN <newsletter@live-in.international>'

/** Pošle dávku (max 100) správ. Vráti pole { email, ok, id?, error? } v poradí vstupu. */
export async function sendBatch(messages) {
  if (!mailReady()) return messages.map((m) => ({ email: m.to, ok: false, error: 'Chýba RESEND_API_KEY' }))
  const payload = messages.map((m) => ({ from: mailFrom(), to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: process.env.NEWSLETTER_REPLY_TO || 'info@live-in.international', headers: m.unsubscribeUrl ? { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined }))
  const res = await fetch(`${API}/emails/batch`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(30000) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) { const err = `Resend ${res.status}: ${String(j.message || j.name || 'chyba').slice(0, 200)}`; return messages.map((m) => ({ email: m.to, ok: false, error: err })) }
  const ids = Array.isArray(j.data) ? j.data : []
  return messages.map((m, i) => ({ email: m.to, ok: true, id: ids[i]?.id || null }))
}
