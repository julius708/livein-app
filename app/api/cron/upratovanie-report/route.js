import { NextResponse } from 'next/server'
import { adminClientAsync } from '@/lib/supabase-admin'
import { rpc, isMissingTable } from '@/lib/cl-server'
import { monthRange, prevMonth, isMonth, reportModel, reportSheets, reportEmail, reportFileName } from '@/lib/cl-report'
import { buildXlsx } from '@/lib/xlsx-lite'
import { sendWithAttachment, mailReady } from '@/lib/mailer'
import { todayBa } from '@/lib/cl-core'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * 1. v mesiaci ráno: pošle e-mailom Excel s upratovaním za predošlý mesiac príjemcom z Nastavení (cl_settings.report.recipients).
 * Bez príjemcov alebo bez RESEND_API_KEY nerobí nič. Report za rovnaký mesiac sa neposiela dvakrát (udalosť report_sent); ?force=1 to obíde.
 */
export async function GET(request) {
  const u = new URL(request.url)
  const ok = process.env.CRON_SECRET && (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` || u.searchParams.get('k') === process.env.CRON_SECRET)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ym = isMonth(u.searchParams.get('m')) ? u.searchParams.get('m') : prevMonth(todayBa())
  const force = u.searchParams.get('force') === '1'
  try {
    const s = await adminClientAsync()
    const { from, to } = monthRange(ym)
    const data = await rpc(s, 'cl_report_data', { p_from: from, p_to: to })
    if (data.demo) return NextResponse.json({ ok: true, skipped: 'Upratovanie nie je v databáze.' })
    if (!data.ok) return NextResponse.json({ ok: false, error: data.error || 'Údaje sa nepodarilo načítať.' }, { status: 500 })
    if (data.sent && !force) return NextResponse.json({ ok: true, month: ym, skipped: 'Report za tento mesiac už odišiel.' })
    const to_ = [...new Set((data.recipients || []).map((x) => String(x).trim().toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 10)
    if (!to_.length) return NextResponse.json({ ok: true, month: ym, skipped: 'Nie sú nastavení príjemcovia (Upratovanie → Nastavenia).' })
    if (!mailReady()) return NextResponse.json({ ok: true, month: ym, skipped: 'Chýba RESEND_API_KEY.' })
    const model = reportModel(data, ym)
    const buf = buildXlsx(reportSheets(model))
    const mail = reportEmail(model)
    const results = []
    for (const to of to_) results.push(await sendWithAttachment({ to, ...mail, filename: reportFileName(ym), content: buf }))
    const sent = results.filter((r) => r.ok).length
    if (sent === results.length) await rpc(s, 'cl_report_mark', { p_month: ym })
    else console.error('[upratovanie] report: odoslané', sent, 'z', results.length)
    return NextResponse.json({ ok: sent === results.length, month: ym, sent, failed: results.length - sent })
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ ok: true, skipped: 'Upratovanie nie je v databáze.' })
    console.error('[upratovanie] report cron', String(e && e.message).slice(0, 160))
    return NextResponse.json({ ok: false, error: 'Beh zlyhal.' }, { status: 500 })
  }
}
