import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'
/** Serverový klient so service role (webhooky, cron, notifikácie). Kľúč SUPABASE_SERVICE_ROLE_KEY nastavuje Július vo Verceli. */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Chýba SUPABASE_SERVICE_ROLE_KEY')
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export const adminReady = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY
