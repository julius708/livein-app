'use client'
import { dayLabel, fmtKm, distanceKm, taskView } from '@/lib/cl-core'
import { orderStops, routeStats, travelMinutes, fmtDuration, googleRouteUrl, dayWorkMinutes } from '@/lib/cl-route'
import { avatarColor, dayState, dayLoad } from '@/lib/cl-plan'
import { ALERT_ICON } from '@/lib/cl-notify'

/** Pohľad „Deň a trasy“: pre vybraný deň kto kam ide v akom poradí, koľko práce a cesty ju čaká a odkaz na trasu v mape. Prehľadné aj na telefóne. */
export default function DayView({ day, days, today, tasks, staffList, flats, matchTask, onPickDay, onOpen }) {
  const list = tasks.filter((t) => t.status !== 'cancelled' && t.date === day && matchTask(t))
  const unassigned = list.filter((t) => !t.cleaner_email)
  const stopOf = (t) => ({ ...(flats[t.listing_id] || {}), id: t.id, name: t.listing_name })
  return (
    <div className="up-dayview">
      <div className="up-daypick" role="tablist" aria-label="Deň">
        {days.map((d) => { const n = tasks.filter((t) => t.status !== 'cancelled' && t.date === d).length; return <button key={d} type="button" role="tab" aria-selected={d === day} className={(d === day ? 'on' : '') + (d === today ? ' today' : '')} onClick={() => onPickDay(d)}><b>{dayLabel(d)}</b><small>{n}</small></button> })}
      </div>

      <section className={'up-panel up-daycard' + (unassigned.length ? ' un' : '')}>
        <h2>Nepriradené <small>{unassigned.length ? `${unassigned.length} čaká na priradenie` : 'všetko priradené'}</small></h2>
        {unassigned.length > 0 && <div className="up-stoplist">{unassigned.map((t) => <StopRow key={t.id} t={t} flat={flats[t.listing_id] || {}} onOpen={onOpen} />)}</div>}
      </section>

      {staffList.map((s) => {
        const mine = list.filter((t) => t.cleaner_email === s.email)
        const st = dayState(s, day)
        const order = orderStops(s, mine.map(stopOf))
        const sorted = order.map((o) => mine.find((t) => t.id === o.id))
        const stats = routeStats(s, order, { back: true })
        const url = googleRouteUrl(s, order)
        const load = dayLoad(tasks, s.email, day)
        return (
          <section key={s.email} className={'up-panel up-daycard' + (st !== 'ok' ? ' ' + st : '') + (load > (s.max_per_day || 4) ? ' over' : '')}>
            <div className="up-row">
              <span className="up-av" style={{ background: avatarColor(s.email) }} aria-hidden="true">{s.name.slice(0, 1)}</span>
              <h2 style={{ flex: '1 1 160px' }}>{s.name}<small>{st === 'off' ? ' · má voľno' : st === 'rest' ? ' · v tento deň nepracuje' : ''}</small></h2>
              <span className="up-meta" style={{ margin: 0 }}>{load}/{s.max_per_day}{mine.length ? ` · práca ~${fmtDuration(dayWorkMinutes(mine, flats))}` : ''}{mine.length > 1 && stats.km > 0 ? ` · cesta ~${String(stats.km).replace('.', ',')} km (${fmtDuration(travelMinutes(stats.km))})` : ''}</span>
              {url && mine.length > 0 && <a className="btn o" href={url} target="_blank" rel="noopener noreferrer">🧭 Trasa</a>}
            </div>
            {mine.length === 0 ? <p className="up-hint" style={{ margin: '6px 0 0' }}>{st === 'ok' ? 'Žiadne byty.' : 'Nič nie je priradené.'}</p> : (
              <div className="up-stoplist">{sorted.map((t, i) => <StopRow key={t.id} t={t} n={i + 1} flat={flats[t.listing_id] || {}} leg={i > 0 ? distanceKm(stopOf(sorted[i - 1]), stopOf(t)) : distanceKm(s, stopOf(t))} onOpen={onOpen} />)}</div>
            )}
          </section>
        )
      })}
      {staffList.length === 0 && <p className="up-hint">Zatiaľ nie je žiadna aktívna upratovačka.</p>}
    </div>
  )
}

function StopRow({ t, flat, n, leg, onOpen }) {
  const v = taskView(t)
  return (
    <button type="button" className={'up-stop s-' + t.status + (t.problem_text || t.alert_kind ? ' prob' : '')} onClick={() => onOpen(t.id)}>
      {n ? <span className="up-n">{n}</span> : <span className="up-n un">?</span>}
      <span className="body"><b>{t.listing_name}</b>
        <small>{flat.city || flat.address || 'bez adresy'}{leg != null && n ? ` · ${fmtKm(leg)} od ${n === 1 ? 'bydliska' : 'predošlého'}` : ''}{v.people != null ? ` · 👥 ${v.people}` : ''}{flat.est_minutes ? ` · ~${flat.est_minutes} min` : ''}</small></span>
      {t.alert_kind && <b className="al" title="Upozornenie od upratovačky">{ALERT_ICON[t.alert_kind]}</b>}
      {t.problem_text && <b className="al" title="Nahlásený problém">!</b>}
      <span className="st">{t.status === 'done' ? '✓' : t.status === 'in_progress' ? '●' : ''}</span>
    </button>
  )
}
