'use client'
import { useState } from 'react'
import { runNowAction, saveSettingsAction, saveSourceAction, resetSourceAction, pilotPreviewAction, pilotCommitAction, enableWebSearchAction, applyPresetAction } from '@/app/investicie/actions'
import { THRESHOLD_DEFS, mergeSettings } from '@/lib/inv-calc'
import { fmtDateTime } from '@/lib/fmt'
import { useAct, Toast } from './ui'

const sv = (v) => (v === null || v === undefined ? '' : String(v))
const STATUS = { ok: ['ok', 'úspešný'], partial: ['warn', 'čiastočný'], failed: ['bad', 'zlyhal'], running: ['muted', 'beží'] }
const SRC_STATUS = { ok: ['ok', 'v poriadku'], blocked: ['bad', 'zablokovaný'], error: ['bad', 'chyba'], pending: ['muted', 'čaká'], skipped: ['muted', 'externý agent'] }

export default function AgentAdmin({ status, runs, sources, settings }) {
  const { run, pending, msg, setMsg } = useAct()
  const S = mergeSettings(settings.calc)
  const [agent, setAgent] = useState({ enabled: settings.agent.enabled, interval_hours: settings.agent.interval_hours, run_at_local: settings.agent.run_at_local, retry_minutes: settings.agent.retry_minutes, general: settings.agent.general, targeted: settings.agent.targeted, cities: (settings.agent.filters.cities || []).join(', '), types: (settings.agent.filters.types || []).join(', '), rooms: (settings.agent.filters.rooms || []).join(', '), price_min: sv(settings.agent.filters.price_min), price_max: sv(settings.agent.filters.price_max), area_min: sv(settings.agent.filters.area_min) })
  const [thr, setThr] = useState(Object.fromEntries(THRESHOLD_DEFS.map((d) => [d.key, sv(S.thresholds[d.key])])))
  const [mort, setMort] = useState({ rate_pct: sv(S.mortgage.rate_pct), years: sv(S.mortgage.years), rate_source: sv(S.mortgage.rate_source), rate_date: sv(S.mortgage.rate_date) })
  const [costs, setCosts] = useState({ commission_pct: sv(S.costs.commission_pct), legal_pct: sv(S.costs.legal_pct), reserve_pct: sv(S.costs.reserve_pct), vacancy: sv(S.ltr.vacancy_pct), mgmt: sv(S.ltr.management_pct) })
  const [fresh, setFresh] = useState({ source_fresh_days: sv(settings.freshness.source_fresh_days), source_stale_days: sv(settings.freshness.source_stale_days), seller_confirm_days: sv(settings.freshness.seller_confirm_days) })
  const [src, setSrc] = useState({ key: '', name: '', kind: 'feed', url: '', mode: 'both', config: '{\n  "format": "json",\n  "complete_snapshot": false,\n  "map": { "external_id": "id", "url": "url", "price": "price", "city": "city", "address": "address", "area_interior": "area", "rooms": "rooms" }\n}' })
  const [pilot, setPilot] = useState({ text: '', date: '', preview: null })
  const [mode, setMode] = useState('both')
  const list = (t) => String(t).split(',').map((x) => x.trim()).filter(Boolean)
  const saveAgent = () => run(() => saveSettingsAction('agent', { ...settings.agent, enabled: agent.enabled, interval_hours: agent.interval_hours, run_at_local: agent.run_at_local, retry_minutes: Number(agent.retry_minutes) || 60, general: agent.general, targeted: agent.targeted, filters: { cities: list(agent.cities), types: list(agent.types), rooms: list(agent.rooms).map(Number), price_min: agent.price_min === '' ? null : Number(agent.price_min), price_max: agent.price_max === '' ? null : Number(agent.price_max), area_min: agent.area_min === '' ? null : Number(agent.area_min) } }), 'Plán agenta uložený.')
  const saveCalc = () => run(() => saveSettingsAction('calc', { ...settings.calc, thresholds: thr, mortgage: mort, costs: { commission_pct: costs.commission_pct, legal_pct: costs.legal_pct, reserve_pct: costs.reserve_pct }, ltr: { vacancy_pct: costs.vacancy, management_pct: costs.mgmt } }), 'Nastavenia kalkulačky uložené. Výpočty sa pri ďalšom behu prepočítajú.')
  const last = status.last, lastOk = status.lastOk
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)' }}>
      <section className="card">
        <div className="iv-head"><h2>Stav agenta: <span className={`iv-pill ${status.active ? 'ok' : 'warn'}`}>{status.state}</span></h2>
          <div className="iv-actions"><select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Režim"><option value="both">Všeobecný + cielený</option><option value="general">Len všeobecné vyhľadávanie</option><option value="targeted">Len cielené (podľa dopytov)</option></select><button type="button" className="btn" disabled={pending} onClick={() => run(() => runNowAction(mode), (r) => `Beh skončil: ${r.status}. Nových ${r.stats.created}, aktualizovaných ${r.stats.updated}.`)}>{pending ? 'Beží…' : 'Spustiť teraz'}</button></div></div>
        <dl className="iv-kv">
          <dt>Posledný úspešný beh</dt><dd>{lastOk ? `${fmtDateTime(lastOk.finished_at || lastOk.started_at)} · nových ${lastOk.stats.created || 0}, aktualizovaných ${lastOk.stats.updated || 0}` : <span className="iv-unknown">zatiaľ žiadny úspešný beh so zdrojom</span>}</dd>
          <dt>Posledný beh</dt><dd>{last ? <>{fmtDateTime(last.started_at)} · <span className={`iv-pill ${(STATUS[last.status] || [])[0]}`}>{(STATUS[last.status] || [])[1] || last.status}</span> ({last.trigger}{last.attempt > 1 ? `, pokus ${last.attempt}` : ''})</> : '—'}</dd>
          <dt>Ďalší plánovaný beh</dt><dd>{status.next ? fmtDateTime(status.next) : 'agent je vypnutý'} <small className="iv-hint">(cron kontroluje každých 30 minút; čas podľa Europe/Bratislava)</small></dd>
          <dt>Zdroje</dt><dd>{status.configured} nakonfigurovaných{status.blocked.length ? <span className="iv-pill bad" style={{ marginLeft: 8 }}>{status.blocked.length} zablokovaných</span> : null}{status.failing.length ? <span className="iv-pill warn" style={{ marginLeft: 8 }}>{status.failing.length} s chybou</span> : null}</dd>
        </dl>
        {status.configured === 0 && <div className="iv-msg warn" style={{ marginTop: 10 }}>Nie je nakonfigurovaný žiadny zdroj, preto agent zatiaľ nič nevyhľadáva. Pridaj feed alebo zoznam odkazov nižšie, alebo nechaj externého agenta posielať ponuky cez ingest API. Automatické hľadanie sa označí ako aktívne až po prvom skutočne úspešnom behu.</div>}
      </section>
      <section className="card"><h2>Vyhľadávanie na internete (AI)</h2>
        <p className="iv-hint">Agent hľadá sám: podľa firemných filtrov (všeobecne) a podľa aktívnych dopytov klientov (cielene) prehľadá internet, nájde aktuálne inzeráty na predaj a overí ich priamo na stránke inzerátu, ak to portál dovolí (rešpektuje robots.txt). Čo sa nepodarí overiť, uloží sa ako <b>neoverené</b> a Zuzka to uvidí. Nevyžaduje žiadny feed ani prístup od portálov, vyžaduje kľúč Anthropic vo Verceli (ANTHROPIC_API_KEY).</p>
        <div className="iv-actions"><button type="button" className="btn" disabled={pending} onClick={() => run(() => enableWebSearchAction(!sources.some((x) => x.key === 'web-search' && x.enabled)), 'Uložené.')}>{sources.some((x) => x.key === 'web-search' && x.enabled) ? 'Vypnúť vyhľadávanie na internete' : 'Zapnúť vyhľadávanie na internete'}</button><button type="button" className="btn line" disabled={pending} onClick={() => run(() => applyPresetAction(), 'Kalkulačka je nastavená podľa Lazaretskej 15. Pri ďalšom behu sa výpočty prepočítajú.')}>Nastaviť kalkulačku podľa Lazaretskej 15</button></div>
      </section>
      <section className="card"><h2>História behov</h2>
        <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Začiatok</th><th>Stav</th><th>Spúšťač</th><th className="r">Nové</th><th className="r">Aktual.</th><th className="r">Zlúčené</th><th className="r">Zhody</th><th>Chyby zdrojov</th></tr></thead><tbody>
          {runs.map((r) => <tr key={r.id}><td>{fmtDateTime(r.started_at)}</td><td><span className={`iv-pill ${(STATUS[r.status] || [])[0]}`}>{(STATUS[r.status] || [])[1] || r.status}</span></td><td>{r.trigger}{r.attempt > 1 ? ` #${r.attempt}` : ''}</td><td className="r">{(r.stats || {}).created ?? 0}</td><td className="r">{(r.stats || {}).updated ?? 0}</td><td className="r">{(r.stats || {}).merged ?? 0}</td><td className="r">{(r.stats || {}).matches_created ?? 0}</td><td><small>{r.error || '—'}</small></td></tr>)}
          {!runs.length && <tr><td colSpan={8}>Zatiaľ nebežal žiadny beh.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="card"><h2>Zdroje ponúk</h2>
        <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Zdroj</th><th>Typ</th><th>Stav</th><th>Posledný úspech</th><th>Chyba</th><th></th></tr></thead><tbody>
          {sources.map((x) => { const st = x.blocked ? 'blocked' : x.consecutive_failures > 0 ? 'error' : x.last_ok_at ? 'ok' : 'pending'; return <tr key={x.key}><td><b>{x.name}</b><small className="iv-hint" style={{ display: 'block' }}>{x.key}{x.enabled ? '' : ' · vypnutý'}</small></td><td>{x.kind === 'feed' ? 'feed' : x.kind === 'url' ? 'odkazy' : 'externý agent'} · {x.mode}</td><td><span className={`iv-pill ${SRC_STATUS[st][0]}`}>{SRC_STATUS[st][1]}</span></td><td>{x.last_ok_at ? fmtDateTime(x.last_ok_at) : '—'}</td><td><small>{x.last_error ? `${x.last_error} (×${x.consecutive_failures})` : '—'}</small></td><td>{(x.blocked || x.consecutive_failures > 0) && <button type="button" className="btn line" disabled={pending} onClick={() => run(() => resetSourceAction(x.key), 'Stav zdroja vynulovaný.')}>Vynulovať</button>}</td></tr> })}
          {!sources.length && <tr><td colSpan={6}>Žiadny zdroj.</td></tr>}
        </tbody></table></div>
        <h3>Pridať alebo upraviť zdroj</h3>
        <p className="iv-hint">Nič sa nesťahuje obchádzaním ochrán: agent rešpektuje robots.txt, limit rýchlosti a pri 403/429 zdroj označí ako zablokovaný. Používaj len feedy, API a stránky, ktoré to dovoľujú. Zdroj „odkazy“ každý beh skontroluje cenu a dostupnosť zadaných inzerátov (config.urls).</p>
        <div className="iv-form">
          <label>Kľúč<input value={src.key} onChange={(e) => setSrc({ ...src, key: e.target.value })} placeholder="napr. agentura-x" /></label><label>Názov<input value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} /></label>
          <label>Typ<select value={src.kind} onChange={(e) => setSrc({ ...src, kind: e.target.value })}><option value="feed">Feed (JSON / RSS)</option><option value="url">Zoznam odkazov</option><option value="ingest">Externý agent (ingest API)</option></select></label>
          <label>Režim<select value={src.mode} onChange={(e) => setSrc({ ...src, mode: e.target.value })}><option value="both">Všeobecný aj cielený</option><option value="general">Len všeobecný</option><option value="targeted">Len cielený</option></select></label>
          <label className="wide">Adresa feedu (https)<input value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} placeholder="https://…" /></label>
          <label className="wide">Konfigurácia (JSON): mapovanie polí, complete_snapshot, urls, search_template<textarea value={src.config} onChange={(e) => setSrc({ ...src, config: e.target.value })} style={{ minHeight: 140, fontFamily: 'monospace' }} /></label>
          <div className="iv-actions"><button type="button" className="btn" disabled={pending || !src.key} onClick={() => run(() => saveSourceAction(src), 'Zdroj uložený.')}>Uložiť zdroj</button></div>
        </div>
      </section>
      <section className="card"><h2>Plán a filtre agenta</h2>
        <div className="iv-form">
          <label className="chk"><input type="checkbox" checked={agent.enabled} onChange={(e) => setAgent({ ...agent, enabled: e.target.checked })} /> Agent zapnutý</label>
          <label>Interval (hodiny; 24 = denne)<input inputMode="numeric" value={agent.interval_hours} onChange={(e) => setAgent({ ...agent, interval_hours: e.target.value })} /></label>
          <label>Čas denného behu (Europe/Bratislava)<input value={agent.run_at_local} onChange={(e) => setAgent({ ...agent, run_at_local: e.target.value })} placeholder="07:00" /></label>
          <label>Opakovanie po chybe (minúty)<input inputMode="numeric" value={agent.retry_minutes} onChange={(e) => setAgent({ ...agent, retry_minutes: e.target.value })} /></label>
          <label className="chk"><input type="checkbox" checked={agent.general} onChange={(e) => setAgent({ ...agent, general: e.target.checked })} /> Všeobecné vyhľadávanie</label>
          <label className="chk"><input type="checkbox" checked={agent.targeted} onChange={(e) => setAgent({ ...agent, targeted: e.target.checked })} /> Cielené (podľa dopytov)</label>
          <fieldset><legend>Firemné filtre (všeobecný režim)</legend><div className="iv-form">
            <label>Mestá<input value={agent.cities} onChange={(e) => setAgent({ ...agent, cities: e.target.value })} /></label><label>Typ<input value={agent.types} onChange={(e) => setAgent({ ...agent, types: e.target.value })} /></label><label>Dispozície<input value={agent.rooms} onChange={(e) => setAgent({ ...agent, rooms: e.target.value })} placeholder="všetky" /></label>
            <label>Cena od €<input inputMode="numeric" value={agent.price_min} onChange={(e) => setAgent({ ...agent, price_min: e.target.value })} /></label><label>Cena do €<input inputMode="numeric" value={agent.price_max} onChange={(e) => setAgent({ ...agent, price_max: e.target.value })} /></label><label>Min. výmera m²<input inputMode="numeric" value={agent.area_min} onChange={(e) => setAgent({ ...agent, area_min: e.target.value })} /></label>
          </div></fieldset>
          <div className="iv-actions"><button type="button" className="btn" disabled={pending} onClick={saveAgent}>Uložiť plán</button></div>
        </div>
      </section>
      <section className="card"><h2>Kritériá výhodnosti a kalkulačka</h2>
        <p className="iv-hint">Prahy neboli schválené, preto sú prázdne a ponuky majú stav „čaká na nastavenie kritérií“. Vyplň len hodnoty, ktoré firma potvrdila. Prázdne = neznáme (nikdy nula).</p>
        <div className="iv-form">
          {THRESHOLD_DEFS.map((d) => <label key={d.key}>{d.label}<input inputMode="decimal" value={thr[d.key]} onChange={(e) => setThr({ ...thr, [d.key]: e.target.value })} placeholder="nenastavené" /></label>)}
          <fieldset><legend>Hypotéka (predvolená, ak dopyt nemá vlastnú) – sadzba vyžaduje zdroj a dátum</legend><div className="iv-form">
            <label>Úrok % p. a.<input inputMode="decimal" value={mort.rate_pct} onChange={(e) => setMort({ ...mort, rate_pct: e.target.value })} placeholder="nenastavené" /></label><label>Splatnosť (roky)<input inputMode="decimal" value={mort.years} onChange={(e) => setMort({ ...mort, years: e.target.value })} /></label><label>Zdroj sadzby<input value={mort.rate_source} onChange={(e) => setMort({ ...mort, rate_source: e.target.value })} /></label><label>Dátum sadzby<input type="date" value={mort.rate_date} onChange={(e) => setMort({ ...mort, rate_date: e.target.value })} /></label>
          </div></fieldset>
          <fieldset><legend>Predvolené predpoklady nákladov (% z ceny; prázdne = neznáme)</legend><div className="iv-form">
            <label>Provízia RK mimo ceny %<input inputMode="decimal" value={costs.commission_pct} onChange={(e) => setCosts({ ...costs, commission_pct: e.target.value })} /></label><label>Právne a administratívne %<input inputMode="decimal" value={costs.legal_pct} onChange={(e) => setCosts({ ...costs, legal_pct: e.target.value })} /></label><label>Rezerva %<input inputMode="decimal" value={costs.reserve_pct} onChange={(e) => setCosts({ ...costs, reserve_pct: e.target.value })} /></label>
            <label>Dlhodobo: neobsadenosť %<input inputMode="decimal" value={costs.vacancy} onChange={(e) => setCosts({ ...costs, vacancy: e.target.value })} /></label><label>Dlhodobo: správa %<input inputMode="decimal" value={costs.mgmt} onChange={(e) => setCosts({ ...costs, mgmt: e.target.value })} /></label>
          </div></fieldset>
          <div className="iv-actions"><button type="button" className="btn" disabled={pending} onClick={saveCalc}>Uložiť kritériá</button></div>
        </div>
        <p className="iv-hint">Pevné pravidlá kalkulačky z webu LIVE-IN (správa {S.ops.management_pct} %, DPH {S.ops.vat_pct} %, softvér {S.ops.software_month} €/mes., upratovanie, 30-dňový mesiac, ceny z portfólia) sú v kóde a overené testami.</p>
      </section>
      <section className="card"><h2>Aktuálnosť údajov</h2>
        <div className="iv-form"><label>Zdroj čerstvý do (dní)<input inputMode="numeric" value={fresh.source_fresh_days} onChange={(e) => setFresh({ ...fresh, source_fresh_days: e.target.value })} /></label><label>Zdroj použiteľný do (dní)<input inputMode="numeric" value={fresh.source_stale_days} onChange={(e) => setFresh({ ...fresh, source_stale_days: e.target.value })} /></label><label>Potvrdenie predajcom platí (dní)<input inputMode="numeric" value={fresh.seller_confirm_days} onChange={(e) => setFresh({ ...fresh, seller_confirm_days: e.target.value })} /></label>
          <div className="iv-actions"><button type="button" className="btn line" disabled={pending} onClick={() => run(() => saveSettingsAction('freshness', Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, Number(v)]))), 'Uložené.')}>Uložiť</button></div></div>
      </section>
      <section className="card"><h2>Import starého pilotu</h2>
        <p className="iv-hint">Vlož JSON (pole nehnuteľností alebo objekt s poľami properties a inquiries). Najprv sa zobrazí kontrolný náhľad, nič sa nezapíše. Historické ponuky dostanú stav „dostupnosť neznáma“ a historické dopyty sa pridajú len k existujúcim kontaktom a označia na potvrdenie aktuálnosti; nový kontakt sa nevytvára.</p>
        <div className="iv-form"><label className="wide">JSON z pilotu<textarea value={pilot.text} onChange={(e) => setPilot({ ...pilot, text: e.target.value, preview: null })} style={{ minHeight: 100, fontFamily: 'monospace' }} /></label>
          <label>Údaje z pilotu platili k<input type="date" value={pilot.date} onChange={(e) => setPilot({ ...pilot, date: e.target.value })} /></label>
          <div className="iv-actions"><button type="button" className="btn line" disabled={pending || !pilot.text} onClick={() => run(async () => { const r = await pilotPreviewAction(pilot.text); if (r.ok) setPilot((p) => ({ ...p, preview: r })); return r }, 'Náhľad pripravený (nič sa nezapísalo).')}>Kontrolný náhľad</button><button type="button" className="btn" disabled={pending || !pilot.preview || !pilot.date} onClick={() => run(() => pilotCommitAction(pilot.text, pilot.date), (r) => `Import: nových ${r.created}, zlúčených ${r.merged}, aktualizovaných ${r.updated}, neplatných ${r.invalid}; dopytov ${r.inquiries}, nespárovaných ${r.unmatched}.`)}>Zapísať import</button></div></div>
        {pilot.preview && <div className="iv-msg ok" style={{ marginTop: 8 }}>Nehnuteľností {pilot.preview.properties} (platných {pilot.preview.valid}), dopytov {pilot.preview.inquiries}.{pilot.preview.invalid.length ? ` Neplatné: ${pilot.preview.invalid.map((x) => `riadok ${x.row}: ${x.errors.join(' ')}`).join(' | ')}` : ''}<br />{pilot.preview.sample.map((x, i) => <span key={i}>{[x.address, x.city, x.price ? `${x.price} €` : null].filter(Boolean).join(', ')}<br /></span>)}</div>}
      </section>
      <section className="card"><h2>Rozhranie pre externých agentov (ingest API)</h2>
        <p className="iv-hint"><code>POST /api/invest/ingest</code> s hlavičkou <code>Authorization: Bearer &lt;INVEST_INGEST_SECRET&gt;</code>. Telo: <code>{'{ "source_key": "agent-x", "complete": false, "items": [{ "external_id": "…", "url": "…", "city": "…", "address": "…", "price": 195000, "area_interior": 62, "rooms": 3, "checked_at": "2026-11-12T08:00:00Z" }] }'}</code> (najviac 200 položiek). Rovnaký zdroj + external_id aktualizuje ten istý záznam. Podrobnosti: docs/investicie/README.md.</p>
      </section>
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
