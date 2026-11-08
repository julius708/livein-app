'use server'
import { headers } from 'next/headers'
import { submitQuote, decideApproval } from '@/lib/maint-server'

/** Dodávateľ: ponuka alebo odmietnutie cez časovo obmedzený odkaz. */
export async function submitQuoteAction(token, form) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(token || ''))) return { ok: false, error: 'Odkaz nie je platný.' }
  try { return await submitQuote(token, form || {}) } catch (e) { console.error('[udrzba] quote', e && e.message); return { ok: false, error: 'Ponuku sa nepodarilo uložiť, skúste znova.' } }
}
/** Majiteľ: rozhodnutie výslovným POST (schváliť / odmietnuť / otázka). GET nikdy nerozhoduje. */
export async function decideAction(token, action, note) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(token || ''))) return { ok: false, error: 'invalid_token' }
  const h = await headers()
  try { return await decideApproval(token, String(action || ''), String(note || ''), { ua: h.get('user-agent') || '' }) } catch (e) { console.error('[udrzba] decide', e && e.message); return { ok: false, error: 'server' } }
}
