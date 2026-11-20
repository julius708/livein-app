'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { assignAction, addTaskAction } from '@/app/upratovanie/actions'
import { dayLabel, weekDays, addDays, taskView } from '@/lib/cl-core'
import { assignWarnings, canMove, cellLoad, dayState, weekLoad, avatarColor } from '@/lib/cl-plan'
import { useRun, Msg, Field } from './ui'
import Modal from './Modal'
import TaskDrawer from './TaskDrawer'
import AutoAssign from './AutoAssign'
import DayView from './DayView'
import { ALERT_ICON } from '@/lib/cl-notify'

const DOT = { todo: 'Čaká', in_progress: 'Prebieha', done: 'Hotovo' }

/**
 * Týždenný kalendár upratovania: upratovačky v riadkoch, dni v stĺpcoch, hore nepriradené byty.
 * Upratovanie sa dá chytiť a presunúť na inú upratovačku (v ten istý deň), alebo kliknúť pre detail a odporúčanie.
 */
export default function PlanTab({ data, today, date, demo, autoDay = null }) {
  const days = useMemo(() => weekDays(date), [date])
  const staffAll = useMemo(() => data.staff.filter((s) => s.role === 'cleaner' && s.active), [data.staff])
  const [local, setLocal] = useState({})
  useEffect(() => { setLocal({}) }, [data.tasks])
  const tasks = useMemo(() => data.tasks.map((t) => (local[t.id] !== undefined ? { ...t, cleaner_email: local[t.id] || null } : t)), [data.tasks, local])
  const [sel, setSel] = useState(null)
  const [auto, setAuto] = useState(!!autoDay && !demo)
  const [autoRange, setAutoRange] = useState(autoDay ? [autoDay, autoDay] : null)
  const [view, setView] = useState('week')
  const [dayPick, setDayPick] = useState(weekDays(date).includes(today) ? today : weekDays(date)[0])
  const [loc, setLoc] = useState('')
  const [adding, setAdding] = useState(false)
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const [q, setQ] = useState('')
  const [who, setWho] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const { pending, run } = useRun()
  const toastTimer = useRef(null)
  const say = (text, ok = false) => { setToast({ text, ok }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 5000) }

  const live = tasks.filter((t) => t.status !== 'cancelled')
  const inWeek = live.filter((t) => t.date >= days[0] && t.date <= days[6])
  const localities = useMemo(() => [...new Set(Object.values(data.flats).map((f) => f.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sk')), [data.flats])
  const match = (t) => (!q || `${t.listing_name} ${(data.flats[t.listing_id] || {}).address || ''}`.toLowerCase().includes(q.toLowerCase())) && (!loc || (data.flats[t.listing_id] || {}).city === loc)
  const tomorrow = addDays(today, 1)
  const tomorrowOpen = live.filter((t) => t.date === tomorrow && !t.cleaner_email && t.status === 'todo')
  const alerts = live.filter((t) => t.alert_kind && t.status !== 'done')
  const unassigned = inWeek.filter((t) => !t.cleaner_email)
  const todays = live.filter((t) => t.date === today)
  const problems = live.filter((t) => t.problem_text && t.date >= addDays(today, -7))
  const rows = who ? staffAll.filter((s) => s.email === who) : staffAll
  const task = sel ? tasks.find((t) => t.id === sel) : null

  const assign = (taskId, email) => {
    const t = tasks.find((x) => x.id === taskId)
    const to = email || null
    if (!t || (t.cleaner_email || null) === to) return
    const can = canMove(t, to)
    if (!can.ok) { say(can.why); return }
    const s = to ? staffAll.find((x) => x.email === to) : null
    const warn = s ? assignWarnings({ task: t, staff: s, flat: data.flats[t.listing_id] || {}, tasks }) : []
    if (warn.length && !confirm(`${warn.join('\n')}\n\nPriradiť aj tak?`)) return
    const before = t.cleaner_email || ''
    setLocal((l) => ({ ...l, [taskId]: to || '' }))
    run(async () => {
      const r = await assignAction(taskId, to, to ? 'ručne presunuté v kalendári' : 'zrušené v kalendári')
      if (!r.ok) { setLocal((l) => ({ ...l, [taskId]: before })); say(r.error || 'Nepodarilo sa.') } else say(to ? `${t.listing_name} → ${s.name}` : `${t.listing_name}: priradenie zrušené`, true)
      return r
    })
  }

  const onDragStart = (e, t) => {
    if (t.status === 'done' || t.status === 'cancelled') { e.preventDefault(); return }
    e.dataTransfer.setData('text/plain', t.id)
    e.dataTransfer.effectAllowed = 'move'
    // zmena vzhľadu až po spustení ťahania, inak ho prehliadač zruší
    setTimeout(() => setDrag({ id: t.id, date: t.date }), 0)
  }
  const dropTarget = (day, email) => ({
    onDragOver: (e) => { if (drag && drag.date === day) { e.preventDefault(); setOver(day + '|' + email) } },
    onDragLeave: () => setOver((o) => (o === day + '|' + email ? null : o)),
    onDrop: (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || (drag && drag.id); setDrag(null); setOver(null); if (id && drag && drag.date === day) assign(id, email) },
  })

  const chip = (t) => {
    const v = taskView(t)
    const movable = t.status !== 'done' && t.status !== 'cancelled' && !demo
    return (
      <button key={t.id} type="button" className={'up-chip s-' + t.status + (t.problem_text ? ' prob' : '') + (sel === t.id ? ' on' : '') + (drag && drag.id === t.id ? ' dragging' : '')}
        draggable={movable} onDragStart={(e) => onDragStart(e, t)} onDragEnd={() => { setDrag(null); setOver(null) }} onClick={() => setSel(t.id)}
        title={`${t.listing_name} · ${DOT[t.status] || ''}${v.people != null ? ` · ${v.people} hostí` : ''}${v.capsuleCount ? ` · ${v.capsuleCount} kapsúl` : ''}`}>
        <span className="dot" aria-hidden="true" /><span className="nm">{t.listing_name}</span>{t.problem_text && <b aria-label="problém">!</b>}{t.alert_kind && t.status !== 'done' && <b aria-label="upozornenie" title="Upozornenie od upratovačky">{ALERT_ICON[t.alert_kind]}</b>}{t.status === 'done' && <b className="ok" aria-label="hotovo">✓</b>}
      </button>
    )
  }

  const cellClass = (day, email, base) => {
    const valid = drag && drag.date === day
    return base + (valid ? ' drop-ok' : drag ? ' drop-no' : '') + (over === day + '|' + email ? ' drop-over' : '')
  }

  return (
    <div className="up-wrap up-cal">
      <div className="up-toolbar">
        <nav className="up-weeknav" aria-label="Týždeň">
          <a className="btn o" href={`?tab=plan&d=${addDays(days[0], -7)}`} aria-label="Predošlý týždeň">←</a>
          <b>{dayLabel(days[0])} – {dayLabel(days[6])}</b>
          <a className="btn o" href={`?tab=plan&d=${addDays(days[0], 7)}`} aria-label="Ďalší týždeň">→</a>
          <a className="btn o" href={`?tab=plan&d=${today}`}>Dnes</a>
        </nav>
        <div className="up-toolbar-r">
          <div className="up-seg" role="group" aria-label="Zobrazenie"><button type="button" className={view === 'week' ? 'on' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>Týždeň</button><button type="button" className={view === 'day' ? 'on' : ''} aria-pressed={view === 'day'} onClick={() => setView('day')}>Deň a trasy</button></div>
          <button type="button" className="btn o" onClick={() => setAdding(true)}>+ Úloha</button>
          <button type="button" className="btn" disabled={demo || !unassigned.length} onClick={() => { setAutoRange(null); setAuto(true) }} title={unassigned.length ? '' : 'Všetko je priradené'}>✨ Rozdeliť automaticky{unassigned.length ? ` (${unassigned.length})` : ''}</button>
        </div>
      </div>

      <div className="up-kpis" aria-label="Prehľad">
        <span className="up-kpi"><b>{todays.length}</b> dnes · {todays.filter((t) => t.status === 'done').length} hotových</span>
        <span className={'up-kpi' + (unassigned.length ? ' warn' : '')}><b>{unassigned.length}</b> nepriradených tento týždeň</span>
        <span className={'up-kpi' + (problems.length ? ' red' : '')}><b>{problems.length}</b> hlásených problémov</span>
        {alerts.length > 0 && <span className="up-kpi red" title={alerts.map((t) => `${ALERT_ICON[t.alert_kind]} ${t.listing_name}`).join(', ')}><b>{alerts.length}</b> upozornení od upratovačiek</span>}
        <span className="up-kpi-sp" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať byt…" aria-label="Hľadať byt" />
        {localities.length > 1 && <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Lokalita"><option value="">Všetky lokality</option>{localities.map((l) => <option key={l} value={l}>{l}</option>)}</select>}
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Zobraziť upratovačku"><option value="">Všetky upratovačky</option>{staffAll.map((s) => <option key={s.email} value={s.email}>{s.name}</option>)}</select>
        <label className="up-check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Len nehotové</label>
      </div>

      {tomorrowOpen.length > 0 && !demo && <p className="up-banner" role="status">Na zajtra ({dayLabel(tomorrow)}) je <b>{tomorrowOpen.length}</b> {tomorrowOpen.length === 1 ? 'byt' : tomorrowOpen.length < 5 ? 'byty' : 'bytov'} bez upratovačky. <button type="button" className="btn o" onClick={() => { setAutoRange([tomorrow, tomorrow]); setAuto(true) }}>Navrhnúť rozdelenie</button></p>}
      {toast && <p className={'up-toast ' + (toast.ok ? 'ok' : 'err')} role="status" aria-live="polite">{toast.text}</p>}
      <p className="up-dragtip" aria-hidden="true" style={{ visibility: drag ? 'visible' : 'hidden' }}>Pusti na upratovačku v zvýraznenom stĺpci (presunúť sa dá len v ten istý deň).</p>

      {view === 'day' ? <DayView day={dayPick} days={days} today={today} tasks={tasks} staffList={who ? staffAll.filter((s) => s.email === who) : staffAll} flats={data.flats} matchTask={(t) => match(t) && (!onlyOpen || t.status !== 'done')} onPickDay={setDayPick} onOpen={setSel} /> : <>
      <div className="up-calwrap">
        <div className="up-calgrid" role="grid" aria-label="Týždenný plán upratovania">
          <div className="up-corner" role="columnheader">Upratovačka</div>
          {days.map((d) => (
            <div key={d} role="columnheader" className={'up-dayhead' + (d === today ? ' today' : '') + (drag && drag.date === d ? ' drop-ok' : '')}>
              <b>{dayLabel(d)}</b><small>{live.filter((t) => t.date === d).length} upratovaní</small>
            </div>
          ))}

          <div className="up-rowhead un" role="rowheader"><span className="av" style={{ background: '#C28A1E' }} aria-hidden="true">?</span><span><b>Nepriradené</b><small>{unassigned.length ? `${unassigned.length} čaká na priradenie` : 'všetko priradené'}</small></span></div>
          {days.map((d) => (
            <div key={'u' + d} role="gridcell" className={cellClass(d, '', 'up-cell un')} {...dropTarget(d, '')}>
              {inWeek.filter((t) => t.date === d && !t.cleaner_email && match(t) && (!onlyOpen || t.status !== 'done')).map((t) => chip(t))}
            </div>
          ))}

          {rows.map((s) => {
            const wk = weekLoad(tasks, s.email, days[0])
            const pct = s.max_per_week > 0 ? Math.min(100, Math.round((wk / s.max_per_week) * 100)) : Math.min(100, Math.round((wk / Math.max(1, (s.max_per_day || 4) * ((s.work_days || []).length || 5))) * 100))
            return [
              <div key={'h' + s.email} className="up-rowhead" role="rowheader">
                <span className="av" style={{ background: avatarColor(s.email) }} aria-hidden="true">{s.name.slice(0, 1)}</span>
                <span><b>{s.name}</b><small>{wk}{s.max_per_week > 0 ? ` / ${s.max_per_week}` : ''} tento týždeň · max {s.max_per_day}/deň</small><span className="up-bar sm" aria-hidden="true"><i style={{ width: pct + '%' }} /></span></span>
              </div>,
              ...days.map((d) => {
                const st = dayState(s, d)
                const load = cellLoad(tasks, s, d)
                const list = inWeek.filter((t) => t.date === d && t.cleaner_email === s.email && match(t) && (!onlyOpen || t.status !== 'done'))
                return (
                  <div key={s.email + d} role="gridcell" className={cellClass(d, s.email, 'up-cell') + (st !== 'ok' ? ' ' + st : '') + (load.level !== 'ok' ? ' ' + load.level : '')} {...dropTarget(d, s.email)}>
                    {st !== 'ok' && !list.length && <em className="rest">{st === 'off' ? 'voľno' : 'nepracuje'}</em>}
                    {list.map((t) => chip(t))}
                    {load.n > 0 && <small className={'ld ' + load.level} title={`${load.n} z max ${load.max} bytov za deň`}>{load.n}/{load.max}</small>}
                  </div>
                )
              }),
            ]
          })}
        </div>
        {rows.length === 0 && <p className="up-hint" style={{ padding: 14 }}>Zatiaľ nie je žiadna aktívna upratovačka. Pridaj ju v časti Tím.</p>}
      </div>
      </>}
      <p className="up-legend" aria-hidden="true"><span className="lg s-todo" />čaká <span className="lg s-in_progress" />prebieha <span className="lg s-done" />hotovo <b className="lgp">!</b> problém · šedé bunky: voľno alebo nepracuje · červené číslo: viac bytov, než má povolené</p>

      {task && <TaskDrawer task={task} data={data} staffList={staffAll} tasks={tasks} demo={demo} busy={pending} onAssign={assign} onClose={() => setSel(null)} />}
      {auto && <AutoAssign date={date} from={autoRange ? autoRange[0] : days[0]} to={autoRange ? autoRange[1] : days[6]} staffList={staffAll} demo={demo} onClose={() => setAuto(false)} />}
      {adding && <AddTaskModal data={data} today={today} demo={demo} onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddTaskModal({ data, today, demo, onClose }) {
  const [f, setF] = useState({ listing: '', name: '', date: today, note: '' })
  const { pending, msg, run } = useRun()
  const flats = Object.values(data.flats).sort((a, b) => String(a.listing_name).localeCompare(String(b.listing_name), 'sk'))
  return (
    <Modal title="Pridať úlohu mimo Práčovne" onClose={onClose}>
      <p className="up-hint">Generálka, kancelária alebo byt bez balíka z Práčovne. Úloha sa objaví medzi nepriradenými.</p>
      <div className="up-form">
        <Field label="Byt z evidencie"><select value={f.listing} onChange={(e) => setF({ ...f, listing: e.target.value })}><option value="">— vlastný názov —</option>{flats.map((x) => <option key={x.listing_id} value={x.listing_id}>{x.listing_name}</option>)}</select></Field>
        <Field label="Vlastný názov" hint="Len ak nevyberáš byt."><input maxLength="120" value={f.name} disabled={!!f.listing} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="napr. Kancelária, generálka" /></Field>
        <Field label="Dátum"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Poznámka pre upratovačku" wide><textarea rows="2" maxLength="500" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="up-row"><button className="btn" disabled={pending || demo || (!f.listing && !f.name.trim())} onClick={() => run(() => addTaskAction(f), { ok: 'Úloha je pridaná.', then: onClose })}>Pridať úlohu</button><button className="btn o" onClick={onClose}>Zrušiť</button></div>
        <Msg msg={msg} />
      </div>
    </Modal>
  )
}
