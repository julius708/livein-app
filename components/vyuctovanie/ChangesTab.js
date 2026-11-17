'use client'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { listCodeChangesAction, approveCodeChangeAction, rejectCodeChangeAction, revertCodeChangeAction } from '@/app/vyuctovanie/actions'

const ST = { queued: ['čaká na spracovanie', 'muted'], working: ['AI pripravuje zmenu…', 'muted'], ready: ['čaká na schválenie', 'warn'], failed: ['nepodarilo sa', 'bad'], merged: ['nasadené', 'ok'], rejected: ['zamietnuté', 'muted'] }
const mark = (s) => (s === 'success' ? '✓' : s === 'failure' ? '✕' : '…')

/** Zoznam návrhov zmien kódu: stav, kontroly a schválenie jedným klikom (len schvaľovateľ). */
export default function ChangesTab({ enabled, approver, refreshKey = 0 }) {
  const [rows, setRows] = useState(null)
  const [info, setInfo] = useState({ enabled, approver })
  const [err, setErr] = useState('')
  const [busy, start] = useTransition()
  const load = useCallback(async () => { const r = await listCodeChangesAction(); if (r.ok) { setRows(r.rows); setInfo({ enabled: r.enabled, approver: r.approver }); setErr('') } else setErr(r.error) }, [])
  useEffect(() => { load() }, [load, refreshKey])
  const active = rows && rows.some((r) => ['queued', 'working'].includes(r.status) || (r.status === 'ready' && r.checks && !r.checks.ready_to_merge && r.checks.ci !== 'failure' && r.checks.vercel !== 'failure'))
  useEffect(() => { if (!active) return; const t = setInterval(load, 8000); return () => clearInterval(t) }, [active, load])
  const act = (fn, args, ok, confirmText) => { if (confirmText && !window.confirm(confirmText)) return; start(async () => { const r = await fn(args); if (r.ok) { setErr(''); load() } else setErr(r.error || 'Nepodarilo sa.'); void ok }) }
  if (!info.enabled && rows && !rows.length) return <div className="vy-chat-log"><p className="vy-chat-bubble">Návrhy zmien kódu zatiaľ nie sú zapnuté: na serveri chýba prístup ku GitHubu (GH_CHANGES_TOKEN) alebo kľúč AI. Požiadavky na zmenu funkcií sa zatiaľ ukladajú ako spätná väzba pre vývojára.</p></div>
  return (
    <div className="vy-chat-log">
      {err && <div className="vy-chat-err" role="alert">{err}</div>}
      {rows && !rows.length && <p className="vy-chat-bubble">Zatiaľ žiadne návrhy zmien. V chate opíš zmenu funkcie a pri požiadavke zvoľ „Pripraviť návrh zmeny kódu“.</p>}
      {(rows || []).map((r) => {
        const st = ST[r.status] || [r.status, 'muted']; const c = r.checks || {}
        return (
          <div key={r.id} className="vy-chg">
            <div className="vy-chg-h"><b>{r.title}</b><span className={`vy-pillx ${st[1]}`}>{st[0]}</span></div>
            <small>{r.kind === 'revert' ? 'vrátenie zmeny' : `žiadal(a) ${r.requested_name || 'člen tímu'}`} · {new Date(r.created_at).toLocaleDateString('sk-SK')}</small>
            {r.summary && <p className="vy-chg-s">{r.summary}</p>}
            {r.risks && <p className="vy-chg-r"><b>Riziká:</b> {r.risks}</p>}
            {r.error && <p className="vy-chat-err">{r.error}</p>}
            {(r.files || []).length > 0 && <ul className="vy-chg-f">{r.files.map((f) => <li key={f.path} className={f.sensitive ? 'sens' : ''}>{f.path} <small>{f.status === 'added' ? 'nový' : 'upravený'}{f.sensitive ? ' · dotýka sa ukladania dát alebo oprávnení' : ''}</small></li>)}</ul>}
            {r.status === 'ready' && <p className="vy-chg-c">Testy {mark(c.ci)}{c.ci === 'none' ? ' (nespustili sa)' : ''} · Náhľad vo Verceli {mark(c.vercel)}{c.preview ? <> · <a href={c.preview} target="_blank" rel="noopener noreferrer">náhľad</a></> : null}</p>}
            <div className="vy-chat-btns">
              {r.pr_url && <a className="btn line" href={r.pr_url} target="_blank" rel="noopener noreferrer">Zobraziť zmeny na GitHube</a>}
              {r.status === 'ready' && info.approver && <button type="button" className="btn" disabled={busy || !c.ready_to_merge} title={c.ready_to_merge ? '' : 'Čaká na zelené testy a náhľad'} onClick={() => act(approveCodeChangeAction, { id: r.id, sha: c.head_sha }, 'ok', `Schváliť a nasadiť „${r.title}“? Zmena sa zlúči a o chvíľu sa objaví v appke.`)}>Schváliť a nasadiť</button>}
              {['ready', 'failed', 'queued'].includes(r.status) && info.approver && <button type="button" className="btn line" disabled={busy} onClick={() => act(rejectCodeChangeAction, { id: r.id }, 'ok')}>Zamietnuť</button>}
              {r.status === 'merged' && r.kind !== 'revert' && info.approver && <button type="button" className="btn line" disabled={busy} onClick={() => act(revertCodeChangeAction, { id: r.id }, 'ok', `Pripraviť vrátenie zmeny „${r.title}“? Vrátenie treba ešte schváliť.`)}>Vrátiť späť</button>}
            </div>
            {r.status === 'ready' && !info.approver && <small>Nasadenie schvaľuje určený schvaľovateľ.</small>}
            {r.status === 'merged' && <small>Nasadenie na produkciu trvá približne 1 až 2 minúty.</small>}
          </div>
        )
      })}
    </div>
  )
}
