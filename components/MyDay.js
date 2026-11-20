import Link from 'next/link'
import { loadMyDay } from '@/lib/myday-server'
import { buildCards, daySummary } from '@/lib/myday'
import './myday.css'

/** Skeleton, kým sa karty načítajú (domovská stránka sa ukáže hneď). */
export function MyDaySkeleton() {
  return <section className="myday" aria-busy="true" aria-label="Môj deň"><div className="md-head"><h2>Môj deň</h2></div><div className="md-grid">{[0, 1, 2].map((i) => <div key={i} className="md-card skel" />)}</div></section>
}

/** Môj deň: karty podľa roly, najnaliehavejšie hore. Zlyhanie načítania nikdy nezhodí domovskú stránku. */
export default async function MyDay(props) {
  let cards = []
  try { cards = buildCards(await loadMyDay(props), { roles: props.roles, isAdmin: props.isAdmin }) } catch { cards = [] }
  return <MyDayView cards={cards} />
}

/** Samotné zobrazenie kariet (oddelené kvôli testom a náhľadu). */
export function MyDayView({ cards }) {
  if (!cards.length) return null
  return (
    <section className="myday" aria-label="Môj deň">
      <div className="md-head"><h2>Môj deň</h2><p>{daySummary(cards)}</p></div>
      <div className="md-grid">
        {cards.map((c) => {
          const Tag = c.cta.href.startsWith('#') ? 'a' : Link
          return (
            <Tag key={c.id} href={c.cta.href} className={'md-card ' + (c.tone || '') + (c.urgent ? ' urgent' : '')} aria-label={`${c.title}: ${c.big.value} ${c.big.label}. ${c.cta.label}`}>
              <div className="md-top"><span className="md-ic" aria-hidden="true">{c.icon}</span><b>{c.title}</b>{c.urgent && <i className="md-dot" aria-label="vyžaduje pozornosť" />}</div>
              <div className="md-big"><strong>{c.big.value}</strong><span>{c.big.label}</span></div>
              {c.stats.length > 0 && <div className="md-stats">{c.stats.map((s, i) => <span key={i} className={s.hot ? 'hot' : ''}><b>{s.v}</b> {s.l}</span>)}</div>}
              {c.items.length > 0 && <ul className="md-items">{c.items.map((it, i) => <li key={i}>{it.text}{it.tag ? <em>{it.tag}</em> : null}</li>)}</ul>}
              <span className="md-cta">{c.cta.label} →</span>
            </Tag>
          )
        })}
      </div>
    </section>
  )
}
