import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import Shell from '@/components/Shell'
import NoAccess from '@/components/NoAccess'
import KeysNav from '@/components/kluce/Nav'
import { canKeys } from '@/lib/keys-core'
import '../kluce.css'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kľúče · história' }

const ACT = { take: ['zobral/a', 'take'], return: ['vrátil/a', 'return'], adjust: ['náprava stavu', 'adjust'] }
const fmt = (iso) => new Date(iso).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export default async function KeysHistoryPage({ searchParams }) {
  const { s, user, me, isAdmin, blocked } = await getViewer()
  if (!user) redirect('/login')
  if (blocked) return <NoAccess email={user.email} />
  if (!canKeys(me)) redirect('/kluce')
  const sp = (await searchParams) || {}
  const q = String(sp.q || '').trim().slice(0, 80)
  let qry = s.from('key_moves').select('id,listing_name,hook_no,action,sets,person_name,package_date,source,note,created_at').order('created_at', { ascending: false }).limit(400)
  if (q) qry = /^\d+$/.test(q) ? qry.eq('hook_no', Number(q)) : qry.or(`listing_name.ilike.%${q.replace(/[%,()]/g, '')}%,person_name.ilike.%${q.replace(/[%,()]/g, '')}%`)
  const { data: moves } = await qry
  return (
    <Shell me={me} user={user} isAdmin={isAdmin} active="kluce" hideFooter>
      <div className="kl-page">
        <section className="li-page-intro kl-intro"><div><span className="li-eyebrow">Kľúče</span><h1>História pohybov</h1><p>Každý pohyb: kto, kedy, ktorý byt a pozícia v tom čase. Posledných 400 záznamov.</p></div><KeysNav active="history" isAdmin={isAdmin} /></section>
        <section className="card">
          <form className="row" action="/kluce/historia"><input type="search" name="q" defaultValue={q} placeholder="Byt, osoba alebo číslo pozície" aria-label="Hľadať v histórii" /><button className="btn line" type="submit">Hľadať</button>{q && <a className="btn line" href="/kluce/historia">Zrušiť filter</a>}</form>
          <div className="kl-table hist" role="table">
            <div className="kl-tr head" role="row"><span>Kedy</span><span>Kto</span><span>Čo</span><span>Byt</span><span>Pozícia</span><span>Zdroj</span></div>
            {(moves || []).map((m) => <div className={`kl-tr ${m.action}`} role="row" key={m.id}><span>{fmt(m.created_at)}</span><span className="nm">{m.person_name}</span><span><i className={`kl-dot ${m.action === 'take' ? 'out' : m.action === 'return' ? 'ok' : 'part'}`} />{ACT[m.action] ? ACT[m.action][0] : m.action}{m.sets > 1 ? ` ×${m.sets}` : ''}{m.package_date ? ' · z tašiek' : ''}{m.note ? <em> · {m.note}</em> : null}</span><span className="nm">{m.listing_name}</span><span>{m.hook_no != null ? m.hook_no : '–'}</span><span>{m.source === 'kiosk' ? 'kiosk' : m.source === 'api' ? 'zámok' : 'appka'}</span></div>)}
            {!(moves || []).length && <p className="hint">Zatiaľ žiadne pohyby.</p>}
          </div>
        </section>
      </div>
    </Shell>
  )
}
