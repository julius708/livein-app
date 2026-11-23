'use client'
import { useState, useTransition } from 'react'
import { toggleStep, setStepMeta } from '@/app/zaradenie/[id]/actions'

const fmt = (d) => (d ? new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' }) : '')

export default function StepRow({ step, members, taskGid }) {
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const base = () => { const fd = new FormData(); fd.set('step_id', step.id); fd.set('unit_id', step.unit_id); fd.set('asana_gid', step.asana_gid || ''); fd.set('task_gid', taskGid || ''); return fd }
  const run = (fd) => start(async () => { setErr(''); const r = await (fd.get('done') != null ? toggleStep(fd) : setStepMeta(fd)); if (r && !r.ok) setErr(r.error || 'Nepodarilo sa uložiť.') })
  const done = step.status === 'done'
  return (
    <li className={`step${done ? ' done' : ''}`}>
      <button type="button" className="chk" disabled={busy} aria-pressed={done} aria-label={done ? 'Vrátiť späť' : 'Označiť hotové'} onClick={() => { const fd = base(); fd.set('done', done ? '0' : '1'); run(fd) }}>{done ? '✓' : ''}</button>
      <div className="t" onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer' }}>{step.title}{done && step.done_by ? <small style={{ display: 'block', fontWeight: 500, color: 'var(--muted)', fontSize: 12 }}>hotovo · {step.done_by} · {fmt(step.done_at)}</small> : null}</div>
      <div className="meta">
        <select value={step.assignee_gid || ''} disabled={busy} aria-label="Osoba" onChange={(e) => { const fd = base(); fd.set('assignee_gid', e.target.value); fd.set('assignee_name', e.target.selectedOptions[0]?.text === '👤 nikto' ? '' : e.target.selectedOptions[0]?.text || ''); run(fd) }}>
          <option value="">👤 nikto</option>{members.map((m) => <option key={m.gid} value={m.gid}>{m.name}</option>)}{step.assignee_gid && !members.some((m) => m.gid === step.assignee_gid) && <option value={step.assignee_gid}>{step.assignee}</option>}
        </select>
        <input type="date" defaultValue={step.due_on || ''} disabled={busy} aria-label="Termín" onChange={(e) => { const fd = base(); fd.set('due_on', e.target.value); run(fd) }} />
        {(open || step.note) && <input className="note" defaultValue={step.note || ''} placeholder="poznámka" maxLength={500} disabled={busy} onBlur={(e) => { if (e.target.value !== (step.note || '')) { const fd = base(); fd.set('note', e.target.value); run(fd) } }} />}
        {!open && !step.note && <button type="button" className="mini" onClick={() => setOpen(true)}>+ poznámka</button>}
        {busy && <span>ukladám…</span>}{err && <span className="e">{err}</span>}
      </div>
    </li>
  )
}
