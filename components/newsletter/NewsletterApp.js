'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AUDIENCES, audienceOf, renderEmail, fmtDT } from '@/lib/newsletter'
import { CITY_GROUPS } from '@/lib/crm'
import { resolveAudience, saveNewsletter, duplicateNewsletter, generateIdeas, draftNewsletter, sendTest, sendNewsletter } from '@/app/newsletter/actions'

const STATUS = { draft: ['Návrh', 's-draft'], sending: ['Odosiela sa', 's-sending'], sent: ['Odoslaný', 's-sent'] }

export default function NewsletterApp({ list, open, me, status }) {
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [busy, start] = useTransition()
  const newDraft = () => start(async () => { const r = await saveNewsletter(null, { subject: '', preheader: '', body_html: '', audience: { kind: 'clients' } }); if (r.ok) router.push(`/newsletter?id=${r.id}`); else setMsg(r.error) })
  const sentCount = list.filter((n) => n.status === 'sent').length
  return (
    <div className="nl">
      <section className="li-page-intro nl-intro">
        <div>
          <span className="li-eyebrow">Newsletter · majitelia bytov</span>
          <h1>{open ? (open.status === 'sent' ? 'Odoslaný newsletter' : 'Pripravujeme newsletter') : 'Newsletter pre majiteľov.'}</h1>
          <p>Nápad, text, publikum, test na seba a až potom ostré odoslanie s potvrdením. Odhlásenie funguje jedným klikom a zapíše sa do HubSpotu.</p>
        </div>
        <div className="nl-intro-side">
          {open && <button className="btn line" onClick={() => router.push('/newsletter')}>← Všetky</button>}
          {!open && <button className="btn" onClick={newDraft} disabled={busy}>+ Nový newsletter</button>}
        </div>
      </section>
      <div className="nl-status">
        <Badge ok={status.ai} label="Nápady a návrhy (AI)" off="chýba ANTHROPIC_API_KEY" />
        <Badge ok={status.bot} label="Publikum z HubSpotu" off="chýba servisný účet" />
        <Badge ok={status.mail} label="Odosielanie e-mailov" off="chýba RESEND_API_KEY" />
        <span className="nl-low">Odhlásených: {status.unsubs} · odoslaných newsletterov: {sentCount}</span>
      </div>
      {msg && <div className="nl-msg" onClick={() => setMsg('')}>{msg}</div>}
      {open ? <Editor key={open.id} n={open} me={me} status={status} setMsg={setMsg} /> : <History list={list} router={router} setMsg={setMsg} />}
    </div>
  )
}
function Badge({ ok, label, off }) { return <span className={'nl-badge ' + (ok ? 'ok' : 'off')} title={ok ? 'zapnuté' : off}>{ok ? '●' : '○'} {label}{!ok && <small> · {off}</small>}</span> }

function History({ list, router, setMsg }) {
  const [busy, start] = useTransition()
  if (!list.length) return <section className="card nl-empty"><h3>Zatiaľ žiadny newsletter</h3><p>Klikni na „Nový newsletter“. Guru navrhne témy a napíše prvý text.</p></section>
  return (
    <section className="nl-list">
      {list.map((n) => { const [t, cls] = STATUS[n.status] || STATUS.draft; const a = audienceOf(n.audience?.kind); return (
        <article key={n.id} className="card nl-row">
          <div className="nl-row-main">
            <div className="nl-row-head"><a className="nl-subject" href={`/newsletter?id=${n.id}`}>{n.subject || <i>bez predmetu</i>}</a><span className={'nl-pill ' + cls}>{t}</span></div>
            <div className="nl-meta">{a.title}{n.audience?.kind === 'clients_city' ? ` · ${n.audience.city_group}` : ''} · {n.status === 'sent' ? `odoslané ${fmtDT(n.sent_at)} · ${n.sent_count} doručených${n.failed_count ? `, ${n.failed_count} chýb` : ''}` : `upravené ${fmtDT(n.updated_at)}`} · {n.created_by_name || ''}</div>
          </div>
          <div className="nl-row-actions">
            <button className="btn line" onClick={() => router.push(`/newsletter?id=${n.id}`)}>{n.status === 'sent' ? 'Pozrieť' : 'Upraviť'}</button>
            <button className="btn line" disabled={busy} onClick={() => start(async () => { const r = await duplicateNewsletter(n.id); if (r.ok) router.push(`/newsletter?id=${r.id}`); else setMsg(r.error) })}>Kópia</button>
          </div>
        </article>) })}
    </section>
  )
}

function Editor({ n, me, status, setMsg }) {
  const router = useRouter()
  const locked = n.status !== 'draft'
  const [f, setF] = useState({ subject: n.subject || '', preheader: n.preheader || '', body_html: n.body_html || '', audience: { kind: 'clients', city_group: 'Bratislava', emails: '', ...(n.audience || {}) } })
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState(n.body_html ? 'text' : 'ideas')
  const [brief, setBrief] = useState('')
  const [ideas, setIdeas] = useState([])
  const [picked, setPicked] = useState(null)
  const [notes, setNotes] = useState('')
  const [aud, setAud] = useState({ count: null, sample: [] })
  const [testTo, setTestTo] = useState('')
  const [confirm, setConfirm] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, start] = useTransition()
  const [working, setWorking] = useState('')
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setDirty(true) }
  const setA = (k, v) => { setF((x) => ({ ...x, audience: { ...x.audience, [k]: v } })); setDirty(true) }
  const preview = useMemo(() => renderEmail({ subject: f.subject, preheader: f.preheader, bodyHtml: f.body_html, unsubscribeUrl: '#', name: me.name }), [f.subject, f.preheader, f.body_html, me.name])
  const run = (label, fn) => start(async () => { setWorking(label); try { await fn() } finally { setWorking('') } })
  const save = async () => { const r = await saveNewsletter(n.id, f); if (!r.ok) { setMsg(r.error); return false } setDirty(false); return true }
  // publikum: počet po každej zmene
  useEffect(() => { let on = true; const t = setTimeout(async () => { const r = await resolveAudience(f.audience); if (on) setAud(r.ok ? { count: r.count, sample: r.sample } : { count: null, sample: [], error: r.error }) }, 400); return () => { on = false; clearTimeout(t) } }, [f.audience.kind, f.audience.city_group, f.audience.emails]) // eslint-disable-line react-hooks/exhaustive-deps
  const a = audienceOf(f.audience.kind)
  return (
    <div className="nl-editor">
      <div className="nl-tabs">
        {[['ideas', '💡 Nápady'], ['text', '✍️ Text'], ['audience', '👥 Publikum'], ['send', '🚀 Test a odoslanie']].map(([k, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}
        {!locked && <button className="btn nl-save" disabled={busy || !dirty} onClick={() => run('Ukladám…', save)}>{dirty ? 'Uložiť' : 'Uložené'}</button>}
      </div>
      {locked && <div className="nl-note">Tento newsletter bol odoslaný {fmtDT(n.sent_at)} ({n.sent_count} doručených{n.failed_count ? `, ${n.failed_count} chýb` : ''}). Už sa nedá upravovať; sprav kópiu.</div>}
      {working && <div className="nl-working">{working}</div>}

      {tab === 'ideas' && (
        <section className="card nl-pane">
          <h3>Čo poslať majiteľom?</h3>
          <p className="nl-help">Napíš, čo sa u nás deje (čísla sezóny, nový byt, zmena v cenách, tip pre majiteľov). Guru navrhne 5 tém. Vyber jednu a nechá ti napísať celý e-mail.</p>
          <textarea rows={3} placeholder="napr. október: obsadenosť 78 %, pribudli 4 byty v Košiciach, od novembra nové fotky…" value={brief} onChange={(e) => setBrief(e.target.value)} />
          <div className="nl-actions"><button className="btn" disabled={busy || !status.ai} onClick={() => run('Guru vymýšľa témy…', async () => { const r = await generateIdeas(brief); if (r.ok) setIdeas(r.ideas); else setMsg(r.error) })}>Navrhni témy</button></div>
          {ideas.length > 0 && <div className="nl-ideas">{ideas.map((i, k) => <button key={k} className={'nl-idea ' + (picked === k ? 'on' : '')} onClick={() => setPicked(k)}><b>{i.title}</b><span>{i.hook}</span><small>{i.why}</small>{i.outline?.length > 0 && <ul>{i.outline.map((o, j) => <li key={j}>{o}</li>)}</ul>}</button>)}</div>}
          {picked != null && !locked && <div className="nl-draftbox">
            <textarea rows={2} placeholder="Poznámky pre text (čísla, mená, čo zdôrazniť)…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn" disabled={busy} onClick={() => run('Guru píše e-mail…', async () => { const r = await draftNewsletter(ideas[picked], notes); if (r.ok) { setF((x) => ({ ...x, ...r.draft })); setDirty(true); setTab('text') } else setMsg(r.error) })}>Napíš e-mail z tejto témy</button>
          </div>}
        </section>
      )}

      {tab === 'text' && (
        <section className="nl-split">
          <div className="card nl-pane">
            <label>Predmet<input value={f.subject} disabled={locked} onChange={(e) => set('subject', e.target.value)} placeholder="napr. Október v číslach a čo chystáme na zimu" /><small>{f.subject.length}/60 znakov je ideál</small></label>
            <label>Text náhľadu (preheader)<input value={f.preheader} disabled={locked} onChange={(e) => set('preheader', e.target.value)} placeholder="Jedna veta, ktorú vidno v schránke pod predmetom." /></label>
            <label>Telo e-mailu (HTML: h1, h2, p, ul, li, strong, a)<textarea rows={18} value={f.body_html} disabled={locked} onChange={(e) => set('body_html', e.target.value)} placeholder={'<h1>Dobrý deň, {{meno}},</h1>\n<p>…</p>'} /><small>{'{{meno}}'} sa nahradí krstným menom majiteľa.</small></label>
          </div>
          <div className="card nl-pane nl-preview"><div className="nl-preview-head">Náhľad <span>tak to uvidí majiteľ</span></div><iframe title="Náhľad" srcDoc={preview} sandbox="" /></div>
        </section>
      )}

      {tab === 'audience' && (
        <section className="card nl-pane">
          <h3>Komu to pošleme</h3>
          <div className="nl-aud">{AUDIENCES.map((x) => <label key={x.id} className={'nl-aud-opt ' + (f.audience.kind === x.id ? 'on' : '') + (x.id === 'leads_open' ? ' warn' : '')}><input type="radio" name="aud" disabled={locked} checked={f.audience.kind === x.id} onChange={() => setA('kind', x.id)} /><b>{x.title}</b><span>{x.desc}</span></label>)}</div>
          {f.audience.kind === 'clients_city' && <label>Mesto<select value={f.audience.city_group} disabled={locked} onChange={(e) => setA('city_group', e.target.value)}>{CITY_GROUPS.map((c) => <option key={c}>{c}</option>)}</select></label>}
          {f.audience.kind === 'custom' && <label>E-maily<textarea rows={5} value={f.audience.emails} disabled={locked} onChange={(e) => setA('emails', e.target.value)} placeholder="jana@…, peter@…" /></label>}
          <div className="nl-count">{aud.error ? <span className="nl-err">{aud.error}</span> : aud.count == null ? 'Počítam…' : <><b>{aud.count}</b> príjemcov{aud.sample.length > 0 && <small> · napr. {aud.sample.join(', ')}</small>}</>}</div>
          <p className="nl-help">Vynechávame: bez e-mailu, odhlásených v HubSpote (hs_email_optout), odhlásených cez odkaz v newsletteri a duplicity. Leady nikdy nie sú v predvolenom publiku.</p>
        </section>
      )}

      {tab === 'send' && (
        <section className="card nl-pane">
          <h3>1. Test na seba</h3>
          <p className="nl-help">Najprv si to pošli na {me.email}. Skontroluj predmet, oslovenie a odkazy na telefóne.</p>
          <div className="nl-actions"><input placeholder="ďalšie adresy (voliteľné)" value={testTo} onChange={(e) => setTestTo(e.target.value)} /><button className="btn line" disabled={busy || !status.mail} onClick={() => run('Posielam test…', async () => { if (dirty && !(await save())) return; const r = await sendTest(n.id, testTo); setMsg(r.ok ? `Test poslaný na ${r.to.join(', ')}.` : r.error) })}>Poslať test</button></div>
          {n.test_sent_at && <small className="nl-low">Posledný test: {fmtDT(n.test_sent_at)}</small>}
          <h3 style={{ marginTop: 18 }}>2. Ostré odoslanie</h3>
          <p className="nl-help">Publikum: <b>{a.title}</b>{f.audience.kind === 'clients_city' ? ` (${f.audience.city_group})` : ''} · <b>{aud.count ?? '…'}</b> príjemcov. Každý dostane vlastné oslovenie a odkaz na odhlásenie.</p>
          {!status.mail && <div className="nl-note">Odosielanie zatiaľ nie je zapnuté (chýba RESEND_API_KEY vo Verceli). Text aj publikum sú uložené; po doplnení kľúča stačí kliknúť.</div>}
          {!locked && !asking && <button className="btn" disabled={busy || !status.mail || !aud.count} onClick={() => setAsking(true)}>Odoslať {aud.count ?? ''} príjemcom…</button>}
          {!locked && asking && <div className="nl-confirm">
            <p>Naozaj poslať „{f.subject || 'bez predmetu'}“ na <b>{aud.count}</b> adries? Toto sa nedá vrátiť.</p>
            <input placeholder="napíš ODOSLAŤ" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <div className="nl-actions"><button className="btn line" onClick={() => { setAsking(false); setConfirm('') }}>Zrušiť</button><button className="btn danger" disabled={busy || confirm.trim().toUpperCase() !== 'ODOSLAŤ'} onClick={() => run('Odosielam…', async () => { if (dirty && !(await save())) return; const r = await sendNewsletter(n.id, confirm); if (r.ok) { setMsg(`Hotovo: ${r.sent} doručených z ${r.total}${r.failed ? `, ${r.failed} chýb` : ''}.`); router.refresh() } else setMsg(r.error) })}>Áno, odoslať</button></div>
          </div>}
          {locked && <div className="nl-count"><b>{n.sent_count}</b> doručených z {n.recipients_count}{n.failed_count ? ` · ${n.failed_count} chýb` : ''} · {fmtDT(n.sent_at)}</div>}
        </section>
      )}
    </div>
  )
}
