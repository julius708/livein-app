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

/** Jedna správa s prílohou (Resend /emails; dávkové rozhranie prílohy nepodporuje). Každý príjemca dostane vlastnú správu. */
export async function sendWithAttachment({ to, subject, html, text, filename, content }) {
  if (!mailReady()) return { email: to, ok: false, error: 'Chýba RESEND_API_KEY' }
  const body = { from: mailFrom(), to: [to], subject, html, text, reply_to: process.env.NEWSLETTER_REPLY_TO || 'info@live-in.international', attachments: [{ filename, content: Buffer.from(content).toString('base64') }] }
  try {
    const res = await fetch(`${API}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(30000) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { email: to, ok: false, error: `Resend ${res.status}: ${String(j.message || j.name || 'chyba').slice(0, 200)}` }
    return { email: to, ok: true, id: j.id || null }
  } catch {
    return { email: to, ok: false, error: 'Odoslanie zlyhalo (sieť).' }
  }
}

/** Obyčajná správa jednému príjemcovi (pozvánky); bez prílohy, bez odhlasovacej hlavičky. */
export async function sendMail({ to, subject, html, text }) {
  if (!mailReady()) return { email: to, ok: false, error: 'Chýba RESEND_API_KEY' }
  try {
    const res = await fetch(`${API}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, text, reply_to: process.env.NEWSLETTER_REPLY_TO || 'info@live-in.international' }), cache: 'no-store', signal: AbortSignal.timeout(30000) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { email: to, ok: false, error: `Resend ${res.status}: ${String(j.message || j.name || 'chyba').slice(0, 200)}` }
    return { email: to, ok: true, id: j.id || null }
  } catch {
    return { email: to, ok: false, error: 'Odoslanie zlyhalo (sieť).' }
  }
}
