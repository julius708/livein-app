import { fmtEur } from '@/lib/cl-core'
import { MONTHS } from '@/lib/cl-report'

const hm = (min) => (min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : '—')
const shift = (ym, n) => { const d = new Date(ym + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }
const avg = (c) => (c.ratings ? (Math.round((c.ratingSum / c.ratings) * 10) / 10).toString().replace('.', ',') : '—')

/** Náklady a mesačný report: mesiac alebo ľubovoľné obdobie od–do, súhrn po upratovačkách a bytoch, Excel pre všetkých aj pre jednu upratovačku. Údaje (model) pripraví server. */
export default function PayTab({ model, ym, thisMonth, range, demo }) {
  const m = model
  const q = range ? `from=${range.from}&to=${range.to}` : `m=${ym}`
  const xl = (cleaner) => `/upratovanie/export?${q}${cleaner ? '&cleaner=' + encodeURIComponent(cleaner) : ''}`
  return (
    <div className="up-wrap">
      <nav className="up-weeknav" aria-label="Mesiac">
        <a className="btn o" href={`?tab=pay&m=${shift(ym, -1)}`}>← {MONTHS[Number(shift(ym, -1).slice(5, 7)) - 1]}</a>
        <b>{m.label}</b>
        <a className="btn o" href={`?tab=pay&m=${thisMonth}`}>Tento mesiac</a>
        <a className="btn o" href={`?tab=pay&m=${shift(ym, 1)}`}>{MONTHS[Number(shift(ym, 1).slice(5, 7)) - 1]} →</a>
      </nav>
      <section className="up-panel">
        <form method="get" className="up-row" aria-label="Obdobie od–do">
          <input type="hidden" name="tab" value="pay" />
          <label className="up-f inline"><span>Od</span><input type="date" name="from" defaultValue={range ? range.from : ''} required /></label>
          <label className="up-f inline"><span>Do</span><input type="date" name="to" defaultValue={range ? range.to : ''} required /></label>
          <button className="btn o">Zobraziť obdobie</button>
          <small className="up-hint">Napríklad od 1. do 15. v mesiaci. Najviac 400 dní.</small>
        </form>
      </section>
      <section className="up-panel">
        <div className="up-row">
          <h2>Upratovanie: {m.label}</h2>
          {demo ? <span className="up-hint">Export je v ukážkovom režime vypnutý.</span> : <a className="btn" href={xl()}>⬇ Excel: všetky upratovačky</a>}
        </div>
        <p className="up-hint">Prehľad pre manažéra, nie výplatná páska. „Hotové“ sú dokončené upratovania (za hodinu podľa skutočného času, inak cena bytu alebo sadzba za upratovanie). „Odhad“ sú ešte neurobené priradené byty. Excel jednej upratovačky (hodiny, suma, byty, problémy, checklist, fotky, recenzie hostí) stiahneš tlačidlom v jej riadku. Mesačný report príde e-mailom 1. v mesiaci.</p>
        <div className="up-gridwrap">
          <table className="up-grid">
            <thead><tr><th>Upratovačka</th><th>Hotové</th><th>Nehotové</th><th>Odpracované</th><th>Hotové (€)</th><th>Odhad (€)</th><th>Bez sadzby</th><th>Problémy</th><th>Recenzie (priemer)</th><th>Excel</th></tr></thead>
            <tbody>
              {m.cleaners.map((c) => <tr key={c.name}><th>{c.name}</th><td>{c.done}</td><td>{c.open}</td><td>{hm(c.minutes)}</td><td><b>{fmtEur(c.doneCents)}</b></td><td>{fmtEur(c.estCents)}</td><td>{c.missing || '—'}</td><td>{c.problems || '—'}</td><td>{c.ratings ? `${c.ratings} (${avg(c)}${c.lowRatings ? `, zlé: ${c.lowRatings}` : ''})` : '—'}</td><td>{c.email && !demo ? <a className="btn o" href={xl(c.email)}>⬇ Excel</a> : '—'}</td></tr>)}
              {m.cleaners.length === 0 && <tr><td colSpan="10">V tomto období zatiaľ nič nie je.</td></tr>}
            </tbody>
            {m.cleaners.length > 0 && <tfoot><tr><th>Spolu</th><td>{m.total.done}</td><td>{m.total.open}</td><td>{hm(m.total.minutes)}</td><td><b>{fmtEur(m.total.doneCents)}</b></td><td>{fmtEur(m.total.estCents)}</td><td>{m.total.missing || '—'}</td><td>{m.total.problems || '—'}</td><td></td><td></td></tr></tfoot>}
          </table>
        </div>
      </section>
      {m.flats.length > 0 && (
        <section className="up-panel">
          <h2>Podľa bytov</h2>
          <div className="up-gridwrap"><table className="up-grid"><thead><tr><th>Byt</th><th>Hotové</th><th>Nehotové</th><th>Odpracované</th><th>Suma (€)</th></tr></thead>
            <tbody>{m.flats.slice(0, 60).map((f) => <tr key={f.name}><th>{f.name}</th><td>{f.done}</td><td>{f.open}</td><td>{hm(f.minutes)}</td><td>{fmtEur(f.cents)}</td></tr>)}</tbody></table></div>
          {m.flats.length > 60 && <p className="up-hint">Prvých 60 z {m.flats.length}; celý zoznam je v Exceli.</p>}
        </section>
      )}
      {m.problems.length > 0 && (
        <section className="up-panel"><h2>Nahlásené problémy ({m.problems.length})</h2>
          <ul className="up-items">{m.problems.map((r) => <li key={r.id}>{r.date.split('-').reverse().join('. ')} · {r.listing_name} · {r.cleaner || '—'}: {r.problem_text}</li>)}</ul></section>
      )}
    </div>
  )
}
