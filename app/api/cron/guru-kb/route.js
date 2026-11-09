import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminClientAsync } from '@/lib/supabase-admin'
import { buildKbDocs } from '@/lib/asana-kb'
import { guideDocs, appDocs, schemaDoc, importDocs } from '@/lib/guru-kb'
import { baseUrl } from '@/lib/guide/server'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/env'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Každých 6 hodín: znalosti Guru nanovo – Asana Portfolio & SOPs, karty Sprievodcu, dokumentácia appiek, mapa databázy. ?only=asana|guide|docs|schema. */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!process.env.KB_IMPORT_SECRET) return NextResponse.json({ ok: false, error: 'chýba KB_IMPORT_SECRET' }, { status: 500 })
  const only = u.searchParams.get('only') || ''
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
  const admin = await adminClientAsync()
  const started = new Date().toISOString(); const stats = {}; const errors = []
  const step = async (name, fn) => { if (only && only !== name) return; try { stats[name] = await fn() } catch (e) { errors.push(name + ': ' + String(e && e.message).slice(0, 160)) } }
  await step('asana', async () => (process.env.ASANA_TOKEN ? importDocs(anon, await buildKbDocs(), 'asana/portfolio/') : 'bez ASANA_TOKEN'))
  await step('guide', async () => importDocs(anon, await guideDocs(admin, await baseUrl(admin)), 'guide/'))
  await step('docs', async () => importDocs(anon, appDocs(), 'docs/'))
  await step('schema', async () => importDocs(anon, [await schemaDoc(admin)], 'schema/'))
  try { await admin.from('sync_runs').insert({ job: 'guru-kb', trigger: request.headers.get('authorization') ? 'cron' : 'manual', started_at: started, finished_at: new Date().toISOString(), ok: errors.length === 0, error: errors.join(' | ') || null, stats }) } catch {}
  return NextResponse.json({ ok: errors.length === 0, stats, errors })
}
