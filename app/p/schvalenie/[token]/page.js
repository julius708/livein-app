import { approvalByToken } from '@/lib/maint-server'
import ApprovalForm from '@/components/udrzba/ApprovalForm'
import { categoryOf, approvalMatches } from '@/lib/maint'
import '../../../udrzba/udrzba.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Schválenie opravy · LIVE-IN', robots: { index: false } }

const eur = (n) => `${Number(n || 0).toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €`
const VAT = { with_vat: 's DPH', without_vat: 'bez DPH (+23 %)', not_vat_payer: 'dodávateľ nie je platca DPH' }
/** Verejná stránka majiteľa: GET len zobrazí ponuku, nič nerozhoduje. Rozhoduje až výslovné odoslanie formulára. */
export default async function ApprovalPage({ params }) {
  const { token } = await params
  const a = /^[A-Za-z0-9_-]{20,}$/.test(token) ? await approvalByToken(token) : null
  const c = a && a.maint_cases, q = a && a.maint_quotes
  const open = a && ['sent', 'delivered', 'question', 'pending', 'no_response'].includes(a.status) && Date.parse(a.expires_at) > Date.now() && approvalMatches(a, q)
  const snap = (c && c.approver_snapshot) || {}
  return (
    <main className="pub ud">
      <div className="pub-brand"><img src="/logo.png" alt="" />LIVE-IN · Schválenie opravy</div>
      {!a && <section className="card"><h1>Odkaz nie je platný</h1><p>Skontrolujte odkaz z e-mailu alebo sa ozvite LIVE-IN.</p></section>}
      {a && <section className="card">
        <h1>{c.ref}: {categoryOf(c.category).label} · {c.listing_name || 'váš byt'}</h1>
        <div className="ud-kv" style={{ marginTop: 10 }}>
          <b>Dopad</b><span>{{ none: 'bez dopadu na hostí', limited: 'obmedzený dopad na pobyt', blocking: 'hosť nemôže byt plnohodnotne používať' }[c.guest_impact]}{c.guest_present ? ', hosť je v byte' : ''}</span>
          <b>Čo sa deje</b><span style={{ whiteSpace: 'pre-wrap' }}>{c.symptoms}</span>
          <b>Rozsah</b><span>{q.kind === 'replacement' ? 'výmena' : 'oprava'} · {q.maint_vendors ? q.maint_vendors.name : 'dodávateľ'}{q.eta ? ` · termín ${q.eta}` : ''}</span>
          {q.items && q.items.length > 0 && <><b>Položky</b><ul className="ud-items">{q.items.map((it, i) => <li key={i}>{it.name} × {it.qty} à {eur(it.price)}</li>)}</ul></>}
          <b>Výjazd / diagnostika / materiál</b><span>{eur(q.callout)} / {eur(q.diagnostics)} / {eur(q.material)}</span>
          {q.replacement && <><b>Výmena</b><span>{q.replacement.reason} · {q.replacement.model} · zariadenie {eur(q.replacement.price)}, montáž {eur(q.replacement.installation)}, odvoz {eur(q.replacement.disposal)}</span></>}
          <b>Strop</b><span><b>{eur(a.quote_total)}</b> ({VAT[q.vat_mode]}) · verzia ponuky {a.quote_version}</span>
          {snap.routine_limit > 0 && <><b>Váš limit</b><span>{eur(c.severity === 'emergency' ? snap.emergency_limit : snap.routine_limit)} bez súhlasu, táto ponuka ho prekračuje</span></>}
          {q.attachments && q.attachments.length > 0 && <><b>Prílohy</b><span>{q.attachments.map((x, i) => <a key={i} href={x.url || '#'} target="_blank" rel="noreferrer">{x.name || `príloha ${i + 1}`} </a>)}</span></>}
          <b>Platnosť odkazu</b><span>{new Date(a.expires_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })}</span>
        </div>
      </section>}
      {a && open && <ApprovalForm token={token} total={eur(a.quote_total)} />}
      {a && !open && <section className="card"><h2>{{ approved: 'Táto ponuka je už schválená.', declined: 'Túto ponuku ste odmietli.', invalidated: 'Ponuka sa zmenila, tento odkaz už neplatí. Pošleme vám nový.', bounced: 'Odkaz neplatí.', suppressed: 'Odkaz neplatí.' }[a.status] || (Date.parse(a.expires_at) <= Date.now() ? 'Platnosť odkazu uplynula.' : 'Tento odkaz už neplatí.')}</h2><p>V prípade otázok sa ozvite LIVE-IN.</p></section>}
      <footer>LIVE-IN · odkaz je určený len oprávnenému schvaľovateľovi. Zobrazenie stránky nič neschvaľuje.</footer>
    </main>
  )
}
