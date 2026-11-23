import Link from 'next/link'
import OnbShell from '@/components/onb/OnbShell'
import TiltLink from '@/components/onb/Tilt'
import { requireOnboarding, STATUS, TYPES, fmtD } from '@/lib/onb-viewer'

export const dynamic = 'force-dynamic'

export default async function Home({ searchParams }) {
  const sp = await searchParams
  const city = String(sp?.mesto || ''), st = String(sp?.stav || '')
  const { s, me, can } = await requireOnboarding()
  if (!can) return <OnbShell me={me}><p className="msg err" style={{ marginTop: 20 }}>Zaradenie bytov je pre roly admin, operations a onboarding. Ak ju potrebuješ, napíš Júliusovi.</p></OnbShell>
  const { data, error } = await s.rpc('onb_units_list')
  const units = data || []
  const cities = [...new Set(units.map((u) => u.city).filter(Boolean))]
  const shown = units.filter((u) => (!city || u.city === city) && (!st || u.status === st))
  const link = (m, v) => `/zaradenie?${new URLSearchParams({ mesto: m === 'mesto' ? v : city, stav: m === 'stav' ? v : st }).toString()}`
  return (
    <OnbShell me={me} active="home" intro={{ eyebrow: 'Od zmluvy po prvého hosťa', title: 'Byty v zaraďovaní', text: 'Checklist, zodpovedná osoba a termín spustenia. Zapisuje sa do Asany.', aside: <Link className="li-shortcut" href="/zaradenie/novy">+ Nový byt</Link> }}>
      {error && <p className="msg err">{error.message}</p>}
      <div className="filters">
        <Link className={!st ? 'on' : ''} href={link('stav', '')}>Všetky stavy</Link>
        {Object.entries(STATUS).map(([k, v]) => <Link key={k} className={st === k ? 'on' : ''} href={link('stav', k)}>{v} ({units.filter((u) => u.status === k).length})</Link>)}
      </div>
      {cities.length > 1 && <div className="filters"><Link className={!city ? 'on' : ''} href={link('mesto', '')}>Všetky mestá</Link>{cities.map((c) => <Link key={c} className={city === c ? 'on' : ''} href={link('mesto', c)}>{c}</Link>)}</div>}
      {shown.length === 0 && <p className="hint" style={{ marginTop: 16 }}>{units.length === 0 ? 'Zatiaľ žiadny byt. Začni tlačidlom „Nový byt“.' : 'Žiadny byt nezodpovedá filtru.'}</p>}
      <div className="units">
        {shown.map((u) => { const pct = u.steps_total ? Math.round((u.steps_done / u.steps_total) * 100) : 0; return (
          <TiltLink key={u.id} href={`/zaradenie/${u.id}`} className="unit">
            <h3>{u.address}</h3>
            <div className="m"><span className={`status ${u.status}`}>{STATUS[u.status]}</span><span>{u.city}</span><span>{TYPES[u.unit_type]}</span></div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="pct"><span>{pct} % · {u.steps_done}/{u.steps_total} krokov</span><span>{u.responsible || 'bez zodpovednej osoby'}</span></div>
            <div className="m">{u.planned_launch ? <span>🚀 spustenie {fmtD(u.planned_launch)}</span> : <span>spustenie neurčené</span>}{!u.asana_task_gid && <span style={{ color: '#A8420B' }}>⚠ nie je v Asane</span>}</div>
          </TiltLink>) })}
      </div>
    </OnbShell>
  )
}
