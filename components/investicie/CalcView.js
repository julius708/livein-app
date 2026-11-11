import { eur, eur2, pct1, num1 } from '@/lib/inv-fmt'
import { evaluateThresholds, PROV_KINDS } from '@/lib/inv-calc'
import { fmtDate } from '@/lib/fmt'

const KIND_CLS = { source: 'ok', manual: 'ok', setting: 'muted', portfolio: 'warn', market: 'warn', assumption: 'bad', missing: 'bad' }
const ProvPill = ({ kind }) => <span className={`iv-pill ${KIND_CLS[kind] || 'muted'}`}>{kind === 'missing' ? 'chýba' : PROV_KINDS[kind] || kind}</span>
const Money = ({ v, unknown = 'neznáme' }) => (v == null ? <span className="iv-unknown">{unknown}</span> : eur(v))
const SCEN = ['conservative', 'base', 'optimistic']

/** Výpočet: investícia po položkách s pôvodom, scenáre, výnosy, bod zvratu, kvalita a stav voči firemným kritériám. */
export default function CalcView({ calc, thresholds, version, created }) {
  if (!calc) return <p className="iv-hint">Výpočet zatiaľ nie je k dispozícii.</p>
  const inv = calc.investment, thr = evaluateThresholds(calc, thresholds)
  const sc = SCEN.filter((k) => calc.str && calc.str[k] && !calc.str[k].none)
  const has = (k) => calc.metrics && calc.metrics[k]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="iv-actions">
        <span className={`iv-pill ${calc.quality.level === 'overena' ? 'ok' : calc.quality.level === 'ciastocna' ? 'warn' : 'bad'}`}>Kvalita podkladov: {calc.quality.level === 'overena' ? 'overené' : calc.quality.level === 'ciastocna' ? 'čiastočné' : 'orientačné'} · {calc.quality.score}/100</span>
        <span className={`iv-pill ${thr.status === 'meets' ? 'ok' : thr.status === 'below' ? 'bad' : 'muted'}`} title="Porovnanie s firemnými prahmi výhodnosti (Nastavenia). Je oddelené od zhody s klientom aj od kvality podkladov.">Výhodnosť: {thr.label}</span>
        {version != null && <span className="iv-tag">verzia výpočtu v{version}{created ? ` z ${fmtDate(created)}` : ''}</span>}
      </div>
      {!inv.complete && <div className="iv-msg warn">Nie sú známe všetky náklady: {inv.unknown.map((u) => u.label.toLowerCase()).join(', ')}. Celková investícia je zatiaľ najmenej {eur(inv.known_total)} a výsledky sú predbežné. Neúplná ponuka je zaujímavá na preverenie, nie overená investícia.</div>}
      <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Celková investícia</th><th className="r">Suma</th><th>Pôvod</th></tr></thead><tbody>
        {inv.items.map((i) => <tr key={i.key}><td>{i.label}{i.note && <small className="iv-hint" style={{ display: 'block' }}>{i.note}</small>}</td><td className="r"><Money v={i.amount} /></td><td>{i.amount != null && <ProvPill kind={i.kind} />}</td></tr>)}
        {inv.unknown.filter((u) => !inv.items.some((i) => i.key === u.key)).map((u) => <tr key={u.key}><td>{u.label}</td><td className="r"><span className="iv-unknown">neznáme</span></td><td></td></tr>)}
        <tr><td><b>Spolu {inv.complete ? '' : '(známe)'}</b></td><td className="r"><b>{eur(inv.known_total)}</b></td><td></td></tr>
      </tbody></table></div>
      {sc.length > 0 && (
        <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Krátkodobý prenájom (30-dňový mesiac)</th>{sc.map((k) => <th key={k} className="r">{calc.str[k].label}</th>)}</tr></thead><tbody>
          <tr><td>Cena za obsadenú noc</td>{sc.map((k) => <td key={k} className="r">{eur(calc.str[k].adr)}</td>)}</tr>
          <tr><td>Obsadenosť</td>{sc.map((k) => <td key={k} className="r">{Math.round(calc.str[k].occupancy)} %</td>)}</tr>
          <tr><td>Príjem po poplatkoch portálov / mes.</td>{sc.map((k) => <td key={k} className="r">{eur2(calc.str[k].month.income)}</td>)}</tr>
          <tr><td>Správa, DPH, upratovanie, softvér / mes.</td>{sc.map((k) => { const m = calc.str[k].month; return <td key={k} className="r">−{eur2(m.management + m.vat + m.cleaning + m.software)}</td> })}</tr>
          <tr><td>Mesačné náklady majiteľa</td>{sc.map((k) => <td key={k} className="r"><Money v={calc.str[k].month.fixed} /></td>)}</tr>
          <tr><td><b>Čistý prevádzkový výsledok / rok</b> (pred financovaním)</td>{sc.map((k) => <td key={k} className="r"><b>{eur(calc.metrics[k].noi_year)}</b>{calc.metrics[k].provisional ? <small className="iv-unknown" style={{ display: 'block' }}>predbežne</small> : null}</td>)}</tr>
          <tr><td><b>Výnos z celkovej investície</b></td>{sc.map((k) => <td key={k} className="r"><b>{pct1(calc.metrics[k].yield_total_pct)}</b></td>)}</tr>
          <tr><td>Bod zvratu: obsadenosť</td>{sc.map((k) => <td key={k} className="r">{calc.metrics[k].break_even_occupancy == null ? 'nedosiahnuteľný' : pct1(calc.metrics[k].break_even_occupancy)}</td>)}</tr>
        </tbody></table></div>
      )}
      {has('ltr') && <div className="iv-scroll"><table className="iv-table"><tbody><tr><td>Dlhodobý prenájom: čistý výsledok / rok</td><td className="r"><b>{eur(calc.metrics.ltr.noi_year)}</b></td></tr><tr><td>Výnos z celkovej investície</td><td className="r">{pct1(calc.metrics.ltr.yield_total_pct)}</td></tr></tbody></table></div>}
      {calc.ltr && calc.ltr.none && <p className="iv-hint">Dlhodobý prenájom: chýba mesačné nájomné, preto sa nepočíta.</p>}
      {sc.length === 0 && calc.mode !== 'ltr' && <div className="iv-msg warn">Pre túto lokalitu a dispozíciu nemáme aspoň 3 porovnateľné byty ani zadanú cenu za noc, preto výnos nepočítame (nevymýšľame ho). Doplň odhad ceny za noc pri úprave údajov.</div>}
      <p className="iv-hint">Financovanie (úver, vlastné zdroje, splátky, úrok a istina, cashflow po splátkach) sa počíta pri zhode s konkrétnym dopytom klienta. Historické výsledky portfólia sa tu rozlišujú od odhadu pre nový byt.</p>
      {calc.warnings.length > 0 && <ul className="iv-reasons">{calc.warnings.map((w, i) => <li key={i} className="u">{w}</li>)}</ul>}
      <details><summary style={{ cursor: 'pointer', fontWeight: 800 }}>Vstupy výpočtu a ich pôvod</summary>
        <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Vstup</th><th className="r">Hodnota</th><th>Pôvod</th></tr></thead><tbody>
          {calc.inputs.map((i, n) => <tr key={n}><td>{i.label}</td><td className="r">{i.value == null ? <span className="iv-unknown">neznáme</span> : typeof i.value === 'number' ? num1(i.value) : String(i.value)}</td><td><ProvPill kind={i.kind} />{i.ref ? <small className="iv-hint" style={{ display: 'block' }}>{i.ref}{i.at ? ` · ${fmtDate(i.at)}` : ''}</small> : null}</td></tr>)}
        </tbody></table></div>
        {calc.bench && <p className="iv-hint">Základ ceny: {calc.bench.basis === 'portfolio_zone' ? 'naše byty v zóne' : 'naše byty v meste'} ({calc.bench.n} bytov, medián za posledných 12 mesiacov k {fmtDate(calc.bench.dates.portfolio_adr)}). Trhové údaje: PriceLabs k {fmtDate(calc.bench.dates.market)}. Ide o historické výsledky a trh, nie o odhad konkrétneho nového bytu.</p>}
      </details>
    </div>
  )
}
