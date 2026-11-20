'use client'
import { useEffect, useMemo, useState } from 'react'
import { proposeAction, applyProposalAction } from '@/app/upratovanie/actions'
import { dayLabel } from '@/lib/cl-core'
import { avatarColor } from '@/lib/cl-plan'
import { useRun, Msg } from './ui'
import Modal from './Modal'

/** Automatické rozdelenie: appka navrhne, kto čo upratuje (vzdialenosť, limity, voľno, rotácia); nič sa neuloží, kým nepotvrdíš. */
export default function AutoAssign({ date, from, to, staffList, demo, onClose }) {
  const [opts, setOpts] = useState({ rotation: 0.5, balance: 0.5 })
  const [adv, setAdv] = useState(false)
  const [proposal, setProposal] = useState(null)
  const { pending, msg, run } = useRun()
  const propose = () => run(() => proposeAction({ date, from, to, options: opts }), { then: (r) => setProposal(r) })
  useEffect(() => { if (!demo) propose() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const per = useMemo(() => {
    const m = new Map()
    for (const a of (proposal && proposal.assignments) || []) m.set(a.email, (m.get(a.email) || 0) + 1)
    return [...m.entries()].map(([email, n]) => ({ email, n, name: (staffList.find((s) => s.email === email) || {}).name || email })).sort((a, b) => b.n - a.n)
  }, [proposal, staffList])
  const change = (i, email) => { const s = staffList.find((x) => x.email === email); const next = proposal.assignments.slice(); next[i] = { ...proposal.assignments[i], email: s.email, name: s.name, reason: 'ručne zmenené v návrhu', km: null }; setProposal({ ...proposal, assignments: next }) }
  const apply = () => run(() => applyProposalAction(proposal.assignments), { ok: 'Rozdelenie je uložené.', then: onClose })
  return (
    <Modal title="Rozdeliť automaticky" onClose={onClose} wide>
      <p className="up-hint">Appka rozdelí nepriradené byty tohto týždňa podľa vzdialenosti od bydliska, limitov a voľna každej upratovačky, uprednostnených lokalít a rotácie. Pozri návrh, v riadkoch môžeš meniť, a potvrď.</p>
      <button type="button" className="up-link" onClick={() => setAdv(!adv)}>{adv ? 'Skryť nastavenie' : 'Nastaviť rotáciu a vyrovnanie'}</button>
      {adv && (
        <div className="up-sliders">
          <label>Rotácia: {Math.round(opts.rotation * 100)} %<input type="range" min="0" max="1" step="0.1" value={opts.rotation} onChange={(e) => setOpts({ ...opts, rotation: Number(e.target.value) })} /></label>
          <label>Vyrovnanie záťaže: {Math.round(opts.balance * 100)} %<input type="range" min="0" max="1" step="0.1" value={opts.balance} onChange={(e) => setOpts({ ...opts, balance: Number(e.target.value) })} /></label>
          <button type="button" className="btn o" disabled={pending || demo} onClick={propose}>Prepočítať</button>
        </div>
      )}
      {pending && !proposal && <p className="up-hint">Počítam návrh…</p>}
      <Msg msg={msg} />
      {proposal && (
        <>
          {per.length > 0 && <div className="up-summary">{per.map((x) => <span key={x.email} className="up-sumchip"><i style={{ background: avatarColor(x.email) }} aria-hidden="true">{x.name.slice(0, 1)}</i>{x.name} <b>{x.n}</b></span>)}</div>}
          <div className="up-proposal">
            <table>
              <thead><tr><th>Deň</th><th>Byt</th><th>Upratovačka</th><th>Prečo</th></tr></thead>
              <tbody>
                {proposal.assignments.map((a, i) => (
                  <tr key={a.task_id}>
                    <td>{dayLabel(a.date)}</td><td>{a.flat}</td>
                    <td><select value={a.email} aria-label={`Upratovačka pre ${a.flat}`} onChange={(e) => change(i, e.target.value)}>{staffList.map((s) => <option key={s.email} value={s.email}>{s.name}</option>)}</select></td>
                    <td className="up-why">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {proposal.assignments.length === 0 && <p className="up-hint">Nie je čo priradiť.</p>}
          {proposal.unassigned.length > 0 && (
            <div className="up-unas"><b>Nepodarilo sa priradiť ({proposal.unassigned.length}):</b>
              <ul>{proposal.unassigned.map((u) => <li key={u.task_id}>{dayLabel(u.date)} · {u.flat}: {u.reason}</li>)}</ul>
              <small>Tieto byty priraď ručne v kalendári.</small>
            </div>
          )}
          <div className="up-row">
            <button className="btn" disabled={pending || demo || !proposal.assignments.length} onClick={apply}>Potvrdiť a priradiť ({proposal.assignments.length})</button>
            <button className="btn o" onClick={onClose}>Zahodiť</button>
          </div>
        </>
      )}
    </Modal>
  )
}
