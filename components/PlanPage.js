'use client'
import { fmtDate } from '@/lib/fmt'
import { useState, useTransition } from 'react'
import { PLAN, PLAN_PDF } from '@/lib/plan-2027'
import { markPlanRead } from '@/app/plan/actions'

function GrowthChart({ n }) {
  // os: jan 26 → dec 26 → dec 27; hodnoty 0–400
  const W = 760, H = 300, L = 44, R = 90, T = 24, B = 40, pw = W - L - R, ph = H - T - B
  const x = (m) => L + (m / 23) * pw, y = (v) => T + ph - (v / 400) * ph
  const lines = [[n.base, '#9BB0A5', 'Základ'], [n.goal, '#F46D16', 'Cieľ'], [n.growth, '#F46D16', 'Rastový']]
  return (
    <figure className="pl-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Počet apartmánov v správe: ${n.start} v januári 2026, ~${n.now} dnes, cieľ ~${n.goal} na konci roka 2027`}>
        {[0, 100, 200, 300, 400].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#173e2c14" strokeDasharray={v === 400 ? '4 4' : undefined} /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="pl-ax">{v}</text></g>)}
        <text x={L + 4} y={y(400) - 6} className="pl-ax o">Ambícia: {n.ambition} bytov</text>
        <path d={`M${x(0)},${y(n.start)} L${x(11)},${y(n.now)} L${x(11)},${y(0)} L${x(0)},${y(0)} Z`} fill="#F46D1622" />
        <polyline fill="none" stroke="#F46D16" strokeWidth="3" points={`${x(0)},${y(n.start)} ${x(11)},${y(n.now)}`} />
        {lines.map(([v, c, l], i) => <g key={l}><polyline fill="none" stroke={c} strokeWidth={l === 'Cieľ' ? 4 : 2.5} strokeOpacity={l === 'Rastový' ? 0.55 : 1} points={`${x(11)},${y(n.now)} ${x(23)},${y(v)}`} /><circle cx={x(23)} cy={y(v)} r="4" fill={c} /><text x={x(23) + 8} y={y(v) + 4} className="pl-ax" style={{ fontWeight: 800, fill: c }}>{l} ~{v}</text></g>)}
        <circle cx={x(0)} cy={y(n.start)} r="5" fill="#fff" stroke="#F46D16" strokeWidth="2" /><text x={x(0) + 8} y={y(n.start) - 8} className="pl-ax b">{n.start}</text>
        <circle cx={x(11)} cy={y(n.now)} r="5" fill="#fff" stroke="#F46D16" strokeWidth="2" /><text x={x(11)} y={y(n.now) - 10} textAnchor="middle" className="pl-ax b">~{n.now} dnes</text>
        {[['jan 26', 0], ['máj', 4], ['sep', 8], ['jan 27', 12], ['máj', 16], ['sep', 20], ['dec 27', 23]].map(([l, m]) => <text key={l + m} x={x(m)} y={H - 14} textAnchor="middle" className="pl-ax">{l}</text>)}
      </svg>
      <figcaption>Čiary ukazujú tri tempá od dnešných ~{n.now} bytov bez prírastkov do konca roka 2026. Tempo zvyšujeme po schodoch, len keď to kapacita tímu unesie.</figcaption>
    </figure>
  )
}

export default function PlanPage({ read, readers, total, isAdmin, first }) {
  const [done, setDone] = useState(!!read)
  const [busy, start] = useTransition()
  const [err, setErr] = useState('')
  const n = PLAN.numbers
  const ack = () => start(async () => { setErr(''); const r = await markPlanRead(); if (r.ok) setDone(true); else setErr(r.error) })
  return (
    <div className="pl">
      <section className="li-page-intro pl-hero">
        <div>
          <span className="li-eyebrow">Marketingový plán 2027</span>
          <h1>Cesta k <em>najväčším</em> na Slovensku.</h1>
          <p>{PLAN.subtitle}</p>
          <div className="pl-actions">
            {done ? <span className="pl-done">✓ Prečítané{first ? `, ${first}` : ''}. Ďakujeme.</span> : <button type="button" className="btn o" onClick={ack} disabled={busy}>{busy ? 'Ukladám…' : 'Prečítal/a som si plán'}</button>}
            <a className="btn line" href={PLAN_PDF} target="_blank" rel="noopener">Otvoriť PDF (16 strán)</a>
          </div>
          {err && <p className="msg err">{err}</p>}
          <small className="pl-version">{PLAN.version}</small>
        </div>
      </section>

      <section className="pl-kpis">
        <div className="card pl-kpi primary"><b>~{n.goal}</b><span>apartmánov v správe na konci roka 2027</span></div>
        <div className="card pl-kpi"><b>{n.paceGoal}</b><span>nových bytov mesačne (dnes ~{n.paceNow})</span></div>
        <div className="card pl-kpi"><b>50 %</b><span>nových majiteľov zo sociálnych sietí</span></div>
        <div className="card pl-kpi"><b>1 deň</b><span>odpoveď na každý dopyt</span></div>
      </section>

      <section className="card pl-sec pl-vision">
        <span className="eyebrow">Vízia</span>
        <h2>{PLAN.vision}</h2>
        <div className="pl-grid4">{PLAN.winners.map((w) => <div key={w.who} className="pl-win"><i aria-hidden="true">{w.icon}</i><b>{w.who}</b><p>{w.what}</p></div>)}</div>
        <div className="pl-loop">{PLAN.loop.map((l, i) => <span key={l} className={i === 0 ? 'hot' : ''}>{l}</span>)}<em>↺ a späť k majiteľovi: ešte lepší výsledok a ešte lepší obsah. Rast je prostriedok, nie cieľ.</em></div>
        <blockquote className="pl-feel"><small>Cieľový pocit</small>{PLAN.feeling}</blockquote>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Kde sme a kam ideme</span>
        <h2>Z {n.start} bytov na ~{n.now} za rok. Rok 2027 má byť rýchlejší.</h2>
        <div className="pl-two">
          <GrowthChart n={n} />
          <div className="pl-pace">
            <div className="pl-pace-big"><b>{n.paceGoal}</b><span>nových bytov mesačne</span><p>Dnešných ~{n.paceNow} nám nestačí. Ide o {n.goal} bytov na konci roka 2027.</p></div>
            <ul className="pl-bars">{[['Dnes', n.paceNow, '#9BB0A5'], ['Základ', n.paceBase, '#9BB0A5'], ['Cieľ', n.paceGoal, '#FFB27A'], ['Rastový', n.paceGrowth, '#F46D16']].map(([l, v, c]) => <li key={l}><span>{l}</span><i><b style={{ width: (v / 20) * 100 + '%', background: c }} /></i><strong>{v}</strong></li>)}</ul>
          </div>
        </div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Odkiaľ prídu nové byty</span>
        <h2>Hlavný zdroj nových majiteľov sú naše sociálne siete a reklamy.</h2>
        <div className="pl-mix">{PLAN.sources.map((s) => <div key={s.name} style={{ flex: s.pct, background: s.color, color: s.color === '#FFB27A' ? '#173E2C' : '#fff' }}><b>{s.pct} %</b><span>{s.name}</span></div>)}</div>
        <p className="pl-fine">Cieľový mix zdrojov v roku 2027. Skutočný podiel doplníme po prepojení HubSpotu a UTM značiek.</p>
        <div className="pl-two tight">
          <div>
            <h3>Rytmus jedného týždňa (~7 videí)</h3>
            <ul className="pl-list">{PLAN.videos.map((v) => <li key={v.name}><b>{v.name}</b><span>{v.desc}</span><em>{v.n}×</em></li>)}</ul>
          </div>
          <div>
            <h3>Mesačný rozpočet na sociálne siete (~3 800 €)</h3>
            <ul className="pl-bars small">{PLAN.budget.map(([l, v]) => <li key={l}><span>{l}</span><i><b style={{ width: (v / 1500) * 100 + '%', background: '#173E2C' }} /></i><strong>{v.toLocaleString('sk-SK')} €</strong></li>)}</ul>
            <p className="pl-fine"><b>Pravidlo reklamy:</b> rozpočet zvyšujeme, keď tím stíha. <b>Meriame</b> dopyty z každého videa a reklamy cez UTM a QR, hlavne cenu za spustený byt.</p>
          </div>
        </div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Päť motorov rastu</span>
        <h2>Jeden hlavný motor a štyri, ktoré mu pomáhajú.</h2>
        <div className="pl-engines">{PLAN.engines.map((e) => <div key={e.name} className={'pl-engine' + (e.main ? ' main' : '')}><i aria-hidden="true">{e.icon}</i><small>{e.tag}</small><b>{e.name}</b><p>{e.desc}</p><em>Meria: {e.measure}</em></div>)}</div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Cesta od videa po prvého hosťa</span>
        <h2>Každý dopyt vieme dotiahnuť až po spustený byt.</h2>
        <ol className="pl-funnel">{PLAN.funnel.map((f) => <li key={f.n}><b>{f.n}</b><strong>{f.name}</strong><span>{f.desc}</span><em>{f.tools}</em></li>)}</ol>
        <div className="pl-grid3">
          <div className="pl-note"><b>⚡ Rýchlosť</b>Na každý dopyt odpovedáme do jedného pracovného dňa. Lead nesmie čakať.</div>
          <div className="pl-note"><b>🎯 Meranie</b>UTM a QR kód na každom videu a reklame. Vieme, ktorý obsah priniesol byt.</div>
          <div className="pl-note dark"><b>📈 Hlavné číslo</b>Cena za spustený byt. Nie lajky, nie formuláre.</div>
        </div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Mapa cesty</span>
        <h2>Štyri schody k novému koncu roka 2027.</h2>
        <div className="pl-steps">{PLAN.steps.map((s) => <div key={s.n} className="pl-step" style={{ marginTop: (4 - s.n) * 18 }}><b>{s.n}</b><small>{s.when}</small><strong>{s.name}</strong><ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul><em>{s.result}</em></div>)}</div>
      </section>

      <section className="card pl-sec pl-success">
        <span className="eyebrow">Úspech</span>
        <h2>31. decembra 2027 sa pozrieme späť a uvidíme toto.</h2>
        <div className="pl-grid4">{PLAN.success.map(([b, s], i) => <div key={s} className={'pl-sbox' + (i === 0 ? ' hot' : '')}><b>{b}</b><span>{s}</span></div>)}</div>
        <ul className="pl-signs">{PLAN.successSigns.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Naša pozícia a dôkaz</span>
        <h2>Jedna jasná veta. Jeden dôkaz. Jeden pocit.</h2>
        <blockquote className="pl-sentence"><small>Naša veta</small>{PLAN.sentence}</blockquote>
        <div className="pl-grid3">
          <div className="pl-note"><small>Úžitok</small><b>Čistý príjem po nákladoch</b>Čo majiteľa naozaj zaujíma.</div>
          <div className="pl-note"><small>Dôvod veriť</small><b>Transparentný výkaz</b>Ukazujeme, kam išlo každé euro.</div>
          <div className="pl-note"><small>Pocit</small><b>Pokoj a ušetrený čas</b>Každodennú prevádzku preberá tím.</div>
        </div>
        <div className="pl-proof"><b>Kam išlo každé euro</b><div>{PLAN.proof.map((p, i) => <span key={p} className={i === 0 || i === PLAN.proof.length - 1 ? 'hot' : ''}>{p}</span>)}</div><p className="pl-fine">Schéma, nie reálne čísla. Z toho robíme obsah: vzorový výkaz, tri príbehy majiteľov a aktívne byty k dátumu.</p></div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Nový vzhľad značky</span>
        <h2>Veľké značky vyzerajú rovnako všade. My tiež.</h2>
        <div className="pl-swatches">{PLAN.brand.map(([n2, bg, fg]) => <div key={n2} style={{ background: bg, color: fg }}>{n2} {bg !== '#FFB27A' && bg !== '#F6F2EA' ? bg : ''}</div>)}</div>
        <div className="pl-grid4">{PLAN.brandSteps.map(([when, name, desc], i) => <div key={name} className="pl-bstep"><b>{i + 1}</b><small>{when}</small><strong>{name}</strong><p>{desc}</p></div>)}</div>
        <p className="pl-fine">Pôvodné logo ostáva, nové farby ho posilnia. Rovnaký vzhľad: web, profily, e-maily, vyúčtovanie, prezentácie a podpisy.</p>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Rast bez straty kvality</span>
        <h2>Plyn pridávame len vtedy, keď má tím kapacitu.</h2>
        <div className="pl-grid3">{PLAN.traffic.map((t) => <div key={t.name} className="pl-light" style={{ '--c': t.color }}><b><i />{t.name}</b><ul>{t.when.map((w) => <li key={w}>{w}</li>)}</ul><em>{t.then}</em></div>)}</div>
        <div className="pl-rule"><b>Pravidlo:</b> {PLAN.rule}</div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Každý nástroj a každý človek má v pláne svoju úlohu</span>
        <h2>Čo robí tím.</h2>
        <div className="pl-grid4">{PLAN.teamRoles.map(([r, d]) => <div key={r} className="pl-role"><b>{r}</b><span>{d}</span></div>)}</div>
      </section>

      <section className="card pl-sec">
        <span className="eyebrow">Prvých 30 dní</span>
        <h2>Čo robíme ako prvé a podľa čoho poznáme, že vyhrávame.</h2>
        <div className="pl-grid4">{PLAN.first30.map((t) => <div key={t.t} className="pl-t"><b>{t.t}</b><small>{t.by}</small><ul>{t.items.map((i) => <li key={i}>✓ {i}</li>)}</ul></div>)}</div>
        <div className="pl-metrics"><b>Ako meriame víťazstvo</b><div className="pl-grid3">{PLAN.metrics.map(([m, d]) => <div key={m}><strong>{m}</strong><span>{d}</span></div>)}</div></div>
      </section>

      <section className="card pl-sec pl-owners">
        <span className="eyebrow">Kto za čo ručí</span>
        <h2>Sme na začiatku cesty. Vlak práve vychádza zo stanice.</h2>
        <div className="pl-two tight">
          <div><h3>Roly</h3><ul className="pl-list plain">{PLAN.owners.map(([w, d]) => <li key={w}><b>{w}:</b> {d}</li>)}</ul></div>
          <div><h3>Rytmus</h3><ul className="pl-list plain">{PLAN.rhythm.map((r) => <li key={r}>{r}</li>)}</ul></div>
        </div>
        <p className="pl-closing">{PLAN.closing}</p>
        <div className="pl-actions">
          {done ? <span className="pl-done">✓ Máš prečítané. Ďakujeme.</span> : <button type="button" className="btn o" onClick={ack} disabled={busy}>{busy ? 'Ukladám…' : 'Prečítal/a som si plán'}</button>}
          <a className="btn line" href={PLAN_PDF} target="_blank" rel="noopener">Stiahnuť PDF</a>
        </div>
      </section>

      {isAdmin && (
        <section className="card pl-sec">
          <span className="eyebrow">Kto si plán prečítal</span>
          <h2>{readers.length} z {total} ľudí</h2>
          <div className="pl-readers">{readers.map((r) => <span key={r.user_email} className="pl-reader">✓ {r.user_name || r.user_email}<small>{fmtDate(r.read_at)}</small></span>)}</div>
        </section>
      )}
    </div>
  )
}
