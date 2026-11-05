import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from './env'

/**
 * Serverový klient pre webhooky a cron. Keď je SUPABASE_SERVICE_ROLE_KEY, obchádza RLS.
 * Inak sa prihlási servisný účet CRM_BOT_EMAIL / CRM_BOT_PASSWORD (app_users: roly crm + bot) a platia preň RLS politiky.
 */
let bot = { client: null, at: 0 }
export const adminReady = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.CRM_BOT_EMAIL && process.env.CRM_BOT_PASSWORD))

export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  if (!bot.client) throw new Error('Servisný účet nie je prihlásený: zavolaj adminClientAsync()')
  return bot.client
}
export async function adminClientAsync() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) return adminClient()
  const email = process.env.CRM_BOT_EMAIL, password = process.env.CRM_BOT_PASSWORD
  if (!email || !password) throw new Error('Chýba SUPABASE_SERVICE_ROLE_KEY alebo CRM_BOT_EMAIL / CRM_BOT_PASSWORD')
  // session platí hodinu; obnovíme po 40 minútach
  if (bot.client && Date.now() - bot.at < 40 * 60e3) return bot.client
  const c = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Servisný účet sa nepodarilo prihlásiť: ' + error.message)
  bot = { client: c, at: Date.now() }
  return c
}
