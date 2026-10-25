import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from './env'

/**
 * Klient pre e-mailové odkazy (prihlasovací odkaz, obnova hesla) v implicitnom režime.
 * Odkaz z e-mailu sa na telefóne otvorí v prehliadači, nie v nainštalovanej appke, takže
 * sa nedá spoliehať na cookie z pôvodného okna (PKCE). V implicitnom režime príde session
 * priamo v odkaze (#access_token) a prihlasovacia stránka ju uloží.
 */
export const mailAuth = () => createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
