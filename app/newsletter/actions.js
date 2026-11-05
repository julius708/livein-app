'use server'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { adminClientAsync } from '@/lib/supabase-admin'
import { AUDIENCE_IDS, pickRecipients, renderEmail, htmlToText, sanitizeHtml, extractJson, parseEmails } from '@/lib/newsletter'
import { unsubscribeUrl } from '@/lib/newsletter-server'
import { mailReady, sendBatch } from '@/lib/mailer'
import { PLAN } from '@/lib/plan-2027'

const LEAD_COLS = 'id,name,email,kind,stage,city_group,email_optout,marketing_ok'
async function viewer() {
  const v = await getViewer()
  if (!v.user || v.blocked) return { error: 'Najprv sa prihlás.' }
  if (!(v.me.roles || []).includes('newsletter')) return { error: 'Newsletter je len pre Júliusa a Simonu.' }
  return v
}
async function bot() { try { return await adminClientAsync() } catch (e) { return null } }
/** Príjemcovia podľa publika (číta cez servisný účet, lebo leady vidí len CRM rola). */
export async function resolveAudience(audience) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const a = await bot(); if (!a) return { ok: false, error: 'Servisný účet nie je nastavený (CRM_BOT_EMAIL / CRM_BOT_PASSWORD).' }
  const aud = cleanAudience(audience)
  const [{ data: leads, error }, { data: unsubs }] = await Promise.all([a.from('leads').select(LEAD_COLS).not('email', 'is', null).limit(5000), a.from('newsletter_unsubscribes').select('email')])
  if (error) return { ok: false, error: error.message }
  const list = pickRecipients(leads || [], aud, { unsubscribed: (unsubs || []).map((u) => u.email) })
  return { ok: true, count: list.length, sample: list.slice(0, 8).map((r) => r.name || r.email), audience: aud }
}
function cleanAudience(x) {
  const kind = AUDIENCE_IDS.includes(x?.kind) ? x.kind : 'clients'
  return { kind, city_group: String(x?.city_group || 'Bratislava').slice(0, 40), emails: kind === 'custom' ? parseEmails(x?.emails).slice(0, 2000).join(', ') : '' }
}
export async function saveNewsletter(id, form) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const row = { subject: String(form.subject || '').slice(0, 200), preheader: String(form.preheader || '').slice(0, 300), body_html: sanitizeHtml(form.body_html).slice(0, 60000), audience: cleanAudience(form.audience), updated_at: new Date().toISOString() }
  if (id) {
    const { data, error } = await v.s.from('newsletters').update(row).eq('id', id).eq('status', 'draft').select('id').maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Tento newsletter je už odoslaný, nedá sa upravovať.' }
    revalidatePath('/newsletter'); return { ok: true, id }
  }
  const { data, error } = await v.s.from('newsletters').insert({ ...row, created_by: v.user.email.toLowerCase(), created_by_name: v.me.name || null }).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/newsletter'); return { ok: true, id: data.id }
}
export async function duplicateNewsletter(id) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  const { data: src } = await v.s.from('newsletters').select('subject,preheader,body_html,audience').eq('id', id).maybeSingle()
  if (!src) return { ok: false, error: 'Newsletter sa nenašiel.' }
  const { data, error } = await v.s.from('newsletters').insert({ ...src, subject: src.subject ? `${src.subject} (kópia)` : '', created_by: v.user.email.toLowerCase(), created_by_name: v.me.name || null }).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/newsletter'); return { ok: true, id: data.id }
}

async function claude(system, user, max_tokens = 2500) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Chýba ANTHROPIC_API_KEY.')
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(55000), body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens, system, messages: [{ role: 'user', content: user }] }) })
  if (!r.ok) throw new Error('AI služba je dočasne nedostupná.')
  const j = await r.json()
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
}
async function companyContext(s) {
  const { data } = await s.from('config').select('value').eq('key', 'company_facts').maybeSingle()
  const facts = data?.value ? JSON.stringify(data.value).slice(0, 3000) : ''
  return `LIVE-IN je správca bytov na krátkodobý prenájom (Bratislava, Košice, Trnava). Majiteľom bytov zabezpečuje kompletnú prevádzku: hostia, upratovanie, ceny, údržba, výplaty. Veta pre majiteľov: „Každodennú prevádzku riešime my. Vy vidíte, čo Vám zostáva.“ Cieľ: 160 až 170 bytov do konca roka 2026, ~345 bytov v správe na konci roka 2027.\nFakty o firme: ${facts}\nPlán 2027 (skratka): ${JSON.stringify({ vision: PLAN.vision, numbers: PLAN.numbers, sentence: PLAN.sentence, success: PLAN.success, rule: PLAN.rule }).slice(0, 2500)}`
}
const RULES = 'Píš po slovensky, ľudsky, bez marketingových fráz a bez vykričníkov v každej vete. Vykaj. Krátke vety. Konkrétne čísla a príklady z prevádzky, nie všeobecné reči. Nikdy nevymýšľaj čísla, ktoré nie sú v podkladoch; ak chýbajú, nechaj zátvorku [doplniť].'
/** 5 nápadov na tému newslettera. */
export async function generateIdeas(brief) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  try {
    const { data: past } = await v.s.from('newsletters').select('subject').eq('status', 'sent').order('sent_at', { ascending: false }).limit(10)
    const ctx = await companyContext(v.s)
    const txt = await claude(`Si redaktor newslettera LIVE-IN pre majiteľov bytov. ${RULES}\n${ctx}\nUž odoslané témy (neopakuj): ${(past || []).map((p) => p.subject).join('; ') || 'žiadne'}`, `Navrhni 5 tém na ďalší newsletter pre majiteľov bytov. Mesiac: ${new Date().toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' })}. Zadanie od tímu: ${String(brief || '').slice(0, 1500) || 'bez zadania'}.\nOdpovedz iba JSON poľom objektov: [{"title":"názov témy (do 8 slov)","hook":"prvá veta e-mailu","why":"prečo teraz, 1 veta","outline":["3 až 4 body obsahu"]}]`, 2000)
    const ideas = extractJson(txt)
    if (!Array.isArray(ideas)) return { ok: false, error: 'Model nevrátil nápady. Skús znova.' }
    return { ok: true, ideas: ideas.slice(0, 6).map((i) => ({ title: String(i.title || '').slice(0, 120), hook: String(i.hook || '').slice(0, 300), why: String(i.why || '').slice(0, 300), outline: Array.isArray(i.outline) ? i.outline.map((o) => String(o).slice(0, 200)).slice(0, 5) : [] })) }
  } catch (e) { return { ok: false, error: e.message } }
}
/** Návrh celého e-mailu z témy (predmet, preheader, HTML telo). */
export async function draftNewsletter(idea, notes) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  try {
    const ctx = await companyContext(v.s)
    const txt = await claude(`Si redaktor newslettera LIVE-IN pre majiteľov bytov. ${RULES}\n${ctx}\nFormát tela: jednoduché HTML len so značkami h1, h2, p, ul, li, strong, a, blockquote. Oslovenie na začiatku: "Dobrý deň, {{meno}}," (zástupný text {{meno}} nechaj presne takto). Dĺžka 180 až 350 slov. Jedna jasná výzva na konci (odpovedať na e-mail alebo zavolať). Bez podpisu, ten dopĺňa šablóna.`, `Téma: ${String(idea?.title || '').slice(0, 200)}\nPrvá veta: ${String(idea?.hook || '').slice(0, 300)}\nBody: ${(idea?.outline || []).join('; ').slice(0, 800)}\nPoznámky od tímu: ${String(notes || '').slice(0, 2000) || 'žiadne'}\nOdpovedz iba JSON objektom: {"subject":"predmet do 60 znakov","preheader":"text náhľadu do 90 znakov","body_html":"HTML telo"}`, 3000)
    const d = extractJson(txt)
    if (!d || !d.body_html) return { ok: false, error: 'Model nevrátil návrh. Skús znova.' }
    return { ok: true, draft: { subject: String(d.subject || '').slice(0, 200), preheader: String(d.preheader || '').slice(0, 300), body_html: sanitizeHtml(d.body_html) } }
  } catch (e) { return { ok: false, error: e.message } }
}
/** Testovací e-mail na vlastnú adresu (a voliteľne ďalšie). */
export async function sendTest(id, extra) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (!mailReady()) return { ok: false, error: 'Odosielanie nie je zapnuté: chýba RESEND_API_KEY vo Verceli.' }
  const { data: n } = await v.s.from('newsletters').select('*').eq('id', id).maybeSingle()
  if (!n) return { ok: false, error: 'Newsletter sa nenašiel.' }
  const to = [v.user.email.toLowerCase(), ...parseEmails(extra)].slice(0, 5)
  const html = (e) => renderEmail({ subject: n.subject, preheader: n.preheader, bodyHtml: n.body_html, unsubscribeUrl: unsubscribeUrl(e), name: v.me.name || '' })
  let r
  try { r = await sendBatch(to.map((e) => ({ to: e, subject: `[TEST] ${n.subject || 'bez predmetu'}`, html: html(e), text: htmlToText(n.body_html) }))) } catch (e) { return { ok: false, error: 'Odoslanie testu zlyhalo: ' + String(e.message || e).slice(0, 160) } }
  const bad = r.find((x) => !x.ok)
  if (bad) return { ok: false, error: bad.error }
  await v.s.from('newsletters').update({ test_sent_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/newsletter')
  return { ok: true, to }
}
/** Ostré odoslanie: vyžaduje potvrdenie textom ODOSLAŤ. Zapíše každého príjemcu do newsletter_sends. */
export async function sendNewsletter(id, confirm) {
  const v = await viewer(); if (v.error) return { ok: false, error: v.error }
  if (String(confirm || '').trim().toUpperCase() !== 'ODOSLAŤ') return { ok: false, error: 'Napíš ODOSLAŤ pre potvrdenie.' }
  if (!mailReady()) return { ok: false, error: 'Odosielanie nie je zapnuté: chýba RESEND_API_KEY vo Verceli.' }
  const a = await bot(); if (!a) return { ok: false, error: 'Servisný účet nie je nastavený.' }
  const { data: n } = await a.from('newsletters').select('*').eq('id', id).maybeSingle()
  if (!n) return { ok: false, error: 'Newsletter sa nenašiel.' }
  if (n.status !== 'draft') return { ok: false, error: 'Tento newsletter už bol odoslaný.' }
  if (!n.subject || !n.body_html) return { ok: false, error: 'Chýba predmet alebo text.' }
  const [{ data: leads }, { data: unsubs }] = await Promise.all([a.from('leads').select(LEAD_COLS).not('email', 'is', null).limit(5000), a.from('newsletter_unsubscribes').select('email')])
  const { data: already } = await a.from('newsletter_sends').select('email').eq('newsletter_id', id).eq('status', 'sent')
  const done = new Set((already || []).map((x) => String(x.email).toLowerCase()))
  const list = pickRecipients(leads || [], n.audience, { unsubscribed: (unsubs || []).map((u) => u.email) }).filter((p) => !done.has(p.email))
  if (!list.length) return { ok: false, error: 'Publikum je prázdne.' }
  // zámok proti dvojitému odoslaniu
  const { data: locked } = await a.from('newsletters').update({ status: 'sending', recipients_count: list.length + done.size, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'draft').select('id')
  if (!locked?.length) return { ok: false, error: 'Odosielanie už beží.' }
  let sent = done.size, failed = 0
  try {
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50)
    const r = await sendBatch(chunk.map((p) => ({ to: p.email, subject: n.subject, html: renderEmail({ subject: n.subject, preheader: n.preheader, bodyHtml: n.body_html, unsubscribeUrl: unsubscribeUrl(p.email), name: p.name }), text: htmlToText(n.body_html), unsubscribeUrl: unsubscribeUrl(p.email) })))
    const now = new Date().toISOString()
    await a.from('newsletter_sends').insert(chunk.map((p, k) => ({ newsletter_id: id, email: p.email, lead_id: p.lead_id, status: r[k].ok ? 'sent' : 'failed', provider_id: r[k].id || null, error: r[k].ok ? null : String(r[k].error || '').slice(0, 300), sent_at: r[k].ok ? now : null })))
    sent += r.filter((x) => x.ok).length; failed += r.filter((x) => !x.ok).length
    await a.from('newsletters').update({ sent_count: sent, failed_count: failed }).eq('id', id)
  }
  } catch (e) {
    // výpadok Resendu alebo siete: newsletter vrátime do návrhu s počtami, čo sa stihlo, aby sa dal poslať znova
    await a.from('newsletters').update({ status: 'draft', sent_count: sent, failed_count: failed, updated_at: new Date().toISOString() }).eq('id', id)
    revalidatePath('/newsletter')
    return { ok: false, error: `Odosielanie zlyhalo po ${sent} správach: ${String(e.message || e).slice(0, 160)}. Skús znova, už odoslaným sa e-mail nepošle druhýkrát.` }
  }
  await a.from('newsletters').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed }).eq('id', id)
  revalidatePath('/newsletter')
  return { ok: true, sent, failed, total: list.length + done.size }
}
