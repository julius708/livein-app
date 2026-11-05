import { createHmac, timingSafeEqual } from 'node:crypto'

export const APP_URL = (process.env.APP_URL || 'https://app.live-in.international').replace(/\/$/, '')
const secret = () => process.env.NEWSLETTER_SECRET || process.env.CRM_WEBHOOK_SECRET || ''
const b64 = (s) => Buffer.from(String(s)).toString('base64url')
export const unsubToken = (email) => createHmac('sha256', secret()).update(String(email).toLowerCase()).digest('hex').slice(0, 32)
export const unsubscribeUrl = (email) => `${APP_URL}/api/newsletter/unsubscribe?e=${b64(String(email).toLowerCase())}&t=${unsubToken(email)}`
export function verifyUnsub(eParam, tParam) {
  if (!secret() || !eParam || !tParam) return null
  let email
  try { email = Buffer.from(String(eParam), 'base64url').toString('utf8').toLowerCase() } catch { return null }
  const a = Buffer.from(unsubToken(email)), b = Buffer.from(String(tParam))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return email
}
