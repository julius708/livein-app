'use server'
import { saveFeedback, confirmGuestEmail } from '@/lib/guide/server'

export async function feedbackAction(code, form) {
  try { return await saveFeedback(String(code || ''), form || {}) } catch (e) { console.error('[guide] feedback', e && e.message); return { ok: false } }
}
export async function confirmEmailAction(token, opts) {
  try { return await confirmGuestEmail(String(token || ''), { newsletter: !!(opts && opts.newsletter) }) } catch (e) { console.error('[guide] confirm', e && e.message); return { ok: false } }
}
