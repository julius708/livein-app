'use client'
import { payrollSummary, fmtEur, weekDays, dayLabel } from '@/lib/cl-core'

export default function PayTab({ data, date }) {
  const days = weekDays(date)
  const tasks = data.tasks.filter((t) => t.date >= days[0] && t.date <= days[6])
  const r = payrollSummary(tasks, data.staff, data.flats)
  return (
    <div className="up-wrap">
      <section className="up-panel">
        <h2>Náklady na upratovanie: {dayLabel(days[0])} – {dayLabel(days[6])}</h2>
        <p className="up-hint">Prehľad pre manažérku, nie výplatná páska. „Hotové“ sú dokončené upratovania (za hodinu podľa skutočného času, inak podľa ceny bytu alebo sadzby za upratovanie). „Odhad“ sú ešte neurobené priradené byty. Sadzby a ceny bytov nastavíš v Tíme a v Bytoch.</p>
        <div className="up-gridwrap">
          <table className="up-grid">
            <thead><tr><th>Upratovačka</th><th>Hotové úlohy</th><th>Odpracované</th><th>Hotové (€)</th><th>Odhad ďalších (€)</th><th>Bez sadzby</th></tr></thead>
            <tbody>
              {r.list.map((x) => <tr key={x.email}><th>{x.name}</th><td>{x.done}</td><td>{x.minutes ? `${Math.floor(x.minutes / 60)} h ${x.minutes % 60} min` : '—'}</td><td><b>{fmtEur(x.doneCents)}</b></td><td>{fmtEur(x.estCents)}</td><td>{x.missing || '—'}</td></tr>)}
              {r.list.length === 0 && <tr><td colSpan="6">V tomto týždni zatiaľ nie je nič priradené.</td></tr>}
            </tbody>
            {r.list.length > 0 && <tfoot><tr><th>Spolu</th><td>{r.total.done}</td><td></td><td><b>{fmtEur(r.total.doneCents)}</b></td><td>{fmtEur(r.total.estCents)}</td><td></td></tr></tfoot>}
          </table>
        </div>
      </section>
    </div>
  )
}
