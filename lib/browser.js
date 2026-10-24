'use client'
import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON } from './env'
export const browserClient = () => createBrowserClient(SUPABASE_URL, SUPABASE_ANON)
