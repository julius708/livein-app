import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import NoAccess from '@/components/NoAccess'
import { canKeys } from '@/lib/keys-core'
import '../kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče · história' }

const ACT = { take: ['zobral/a', 'take'], return: ['vrátil/a', 'return'], adjust: ['náprava stavu', 'adjust'] }
const fmt = (iso) => new Date(iso).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export default async function KeysHistoryPage({ searchParams }) {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login?next=/kluce/historia')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) redirect('/kluce')
  const sp = (await searchParams) || {}
  const q = String(sp.q || '').trim().slice(0, 80)
  let qry = s.from('key_moves').select('id,listing_name,hook_no,action,sets,person_name,package_date,source,note,created_at').order('created_at', { ascending: false }).limit(400)
  if (q) qry = /^\d+$/.test(q) ? qry.eq('hook_no', Number(q)) : qry.or(`listing_name.ilike.%${q.replace(/[%,()]/g, '')}%,person_name.ilike.%${q.replace(/[%,()]/g, '')}%`)
  const { data: moves } = await qry
  return (
    <main className="kl-kiosk">
      <header className="kl-kiosk-head"><a href="/" aria-label="LIVE-IN domov"><img src="/logo.png" alt="LIVE-IN" /></a><span className="kl-kiosk-title">História kľúčov</span><span className="kl-sp" /><nav className="kl-tabs" aria-label="Kľúče"><a href="/kluce" className="">Kľúče</a><a href="/kluce/sprava" className="">Nastavenia</a><a href="/kluce/historia" className="on">História</a></nav></header>
      <div className="kl-page">
        <section className="card">
          <form className="row" action="/kluce/historia"><input type="search" name="q" defaultValue={q} placeholder="Byt, osoba alebo číslo pozície" aria-label="Hľadať v histórii" /><button className="btn line" type="submit">Hľadať</button>{q && <a className="btn line" href="/kluce/historia">Zrušiť filter</a>}</form>
          <div className="kl-table hist" role="table">
            <div className="kl-tr head" role="row"><span>Kedy</span><span>Kto</span><span>Čo</span><span>Byt</span><span>Pozícia</span><span>Zdroj</span></div>
            {(moves || []).map((m) => <div className={`kl-tr ${m.action}`} role="row" key={m.id}><span>{fmt(m.created_at)}</span><span className="nm">{m.person_name}</span><span><i className={`kl-dot ${m.action === 'take' ? 'out' : m.action === 'return' ? 'ok' : 'part'}`} />{ACT[m.action] ? ACT[m.action][0] : m.action}{m.sets > 1 ? ` ×${m.sets}` : ''}{m.package_date ? ' · z tašiek' : ''}{m.note ? <em> · {m.note}</em> : null}</span><span className="nm">{m.listing_name}</span><span>{m.hook_no != null ? m.hook_no : '–'}</span><span>{m.source === 'kiosk' ? 'kiosk' : m.source === 'api' ? 'zámok' : 'appka'}</span></div>)}
            {!(moves || []).length && <p className="hint">Zatiaľ žiadne pohyby.</p>}
          </div>
        </section>
      </div>
    </main>
  )
}
