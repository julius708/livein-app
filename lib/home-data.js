// Údaje pre domovskú stránku a hlavičku: každé volanie sa v rámci jednej požiadavky vykoná najviac raz (React cache), nech ho použije viac častí stránky.
import { cache } from 'react'

const data = (r) => (r && !r.error ? r.data : null)

export const moduleUrls = cache(async (s) => {
  const r = await s.from('config').select('value').eq('key', 'module_urls').maybeSingle()
  return (data(r) && data(r).value) || {}
})
export const homeFacts = cache(async (s) => data(await s.rpc('home_facts')))
export const homeWork = cache(async (s) => data(await s.rpc('home_work')))
export const homeDash = cache(async (s) => data(await s.rpc('home_dashboard')))
export const homeNums = cache(async (s) => data(await s.rpc('home_numbers')))
export const todayOverview = cache(async (s) => data(await s.rpc('today_overview')))
export const boardNotes = cache(async (s, since) => data(await s.from('board_notes').select('id,text,author_name,date,created_at').is('removed_at', null).gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(60)) || [])
export const myMentions = cache(async (s, email) => data(await s.from('board_note_mentions').select('note_id,seen_at').ilike('email', email)) || [])
export const teamRows = cache(async (s) => data(await s.from('app_users').select('name,email').eq('active', true).order('name')) || [])
