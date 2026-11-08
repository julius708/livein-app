import { requestByToken } from '@/lib/maint-server'
import VendorQuoteForm from '@/components/udrzba/VendorQuoteForm'
import { categoryOf, SEVERITIES } from '@/lib/maint'
import '../../../udrzba/udrzba.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dopyt na opravu · LIVE-IN', robots: { index: false } }

/** Verejná stránka dodávateľa: dopyt s časovo obmedzeným odkazom (bez prístupových údajov k bytu). */
export default async function RequestPage({ params }) {
  const { token } = await params
  const r = /^[A-Za-z0-9_-]{20,}$/.test(token) ? await requestByToken(token) : null
  const c = r && r.maint_cases
  const expired = r && (Date.parse(r.expires_at) < Date.now() || ['expired', 'cancelled'].includes(r.status))
  return (
    <main className="pub ud">
      <div className="pub-brand"><img src="/logo.png" alt="" />LIVE-IN · Údržba</div>
      {!r && <section className="card"><h1>Odkaz nie je platný</h1><p>Skontrolujte odkaz z e-mailu alebo sa ozvite LIVE-IN.</p></section>}
      {r && expired && <section className="card"><h1>Platnosť dopytu uplynula</h1><p>Dopyt {c.ref} už nie je otvorený. Ak máte záujem, ozvite sa LIVE-IN.</p></section>}
      {r && !expired && <>
        <section className="card">
          <h1>Dopyt {c.ref}: {categoryOf(c.category).label}</h1>
          <div className="ud-kv" style={{ marginTop: 10 }}>
            <b>Byt</b><span>{c.listing_name || 'byt LIVE-IN'}{r.maint_vendors && r.maint_vendors.locality ? ` · ${r.maint_vendors.locality}` : ''}</span>
            <b>Závažnosť</b><span>{SEVERITIES[c.severity]?.label}</span>
            <b>Príznaky</b><span style={{ whiteSpace: 'pre-wrap' }}>{c.symptoms}</span>
            {c.photos && c.photos.length > 0 && <><b>Fotky</b><span>{c.photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer">foto {i + 1} </a>)}</span></>}
            <b>Odpovedať do</b><span>{new Date(r.expires_at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })}</span>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Presnú adresu a prístup dostanete po objednaní, na dohodnutý čas.</p>
        </section>
        {['offered', 'declined'].includes(r.status) ? <section className="card"><h2>{r.status === 'offered' ? 'Ponuku sme už prijali.' : 'Dopyt ste odmietli.'}</h2><p>{r.status === 'offered' ? 'Ak ju chcete upraviť, pošlite novú ponuku cez ten istý odkaz; nahradí predchádzajúcu verziu.' : ''}</p>{r.status === 'offered' && <VendorQuoteForm token={token} req={r} />}</section> : <VendorQuoteForm token={token} req={r} />}
      </>}
      <footer>LIVE-IN · odkaz je určený len vám a platí obmedzený čas.</footer>
    </main>
  )
}
