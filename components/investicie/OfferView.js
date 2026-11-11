'use client'
import { useState } from 'react'
import Link from 'next/link'
import { eur, pct1 } from '@/lib/inv-fmt'
import { fmtDate, fmtDateTime } from '@/lib/fmt'
import { saveOfferAction, reviewOfferAction, markOfferSentAction } from '@/app/investicie/actions'
import { useAct, Toast } from './ui'

function ClientPreview({ content }) {
  return (
    <div className="iv-offer">
      <h2 style={{ fontSize: 20 }}>Návrh investičných nehnuteľností</h2>
      <p>{content.intro}</p>
      {content.items.map((it, i) => (
        <div key={i} style={{ borderTop: '1px solid #173e2c1f', paddingTop: 12, marginTop: 12 }}>
          <h3>{it.headline}</h3>
          <p className="iv-hint">{it.facts.join(' · ')}</p>
          <p><b>Cena:</b> {it.price ? eur(it.price) : 'neuvedená'} · <b>Celková investícia:</b> {eur(it.total_investment.known)}{it.total_investment.complete ? '' : ` (najmenej; ešte neznáme: ${it.total_investment.unknown.join(', ')})`}</p>
          {it.why.length > 0 && <><b>Prečo sme ju vybrali</b><ul>{it.why.map((w, j) => <li key={j}>{w}</li>)}</ul></>}
          {it.scenarios.length > 0 && <div className="iv-scroll"><table className="iv-table"><thead><tr><th>Scenár</th><th>Predpoklady</th><th className="r">Čistý výsledok / rok</th><th className="r">Výnos z investície</th></tr></thead><tbody>{it.scenarios.map((sc) => <tr key={sc.key}><td>{sc.label}</td><td>{sc.assumptions}</td><td className="r">{eur(sc.noi_year)}{sc.provisional ? ' *' : ''}</td><td className="r">{pct1(sc.yield_total_pct)}</td></tr>)}</tbody></table>{it.scenarios.some((x) => x.provisional) && <small className="iv-hint">* predbežne, nie sú známe všetky náklady</small>}</div>}
          {it.assumptions.length > 0 && <details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Predpoklady</summary><ul className="iv-hint">{it.assumptions.map((a, j) => <li key={j}>{a}</li>)}</ul></details>}
          <b>Riziká a otvorené body</b><ul>{it.risks.map((r, j) => <li key={j}>{r}</li>)}</ul>
          <p><b>Dostupnosť:</b> {it.availability.text}</p>
          <p><b>Ďalší krok:</b> {it.next_step}</p>
        </div>
      ))}
      <p className="iv-hint" style={{ marginTop: 14 }}>{content.disclaimer}</p>
    </div>
  )
}

export default function OfferView({ offer, notices, inquiry, lead }) {
  const [intro, setIntro] = useState(offer.content.intro)
  const [notes, setNotes] = useState((offer.internal && offer.internal.notes) || '')
  const { run, pending, msg, setMsg } = useAct()
  const locked = offer.status === 'sent'
  const dirty = intro !== offer.content.intro || notes !== ((offer.internal && offer.internal.notes) || '')
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card">
        <div className="iv-head"><div><h1>Návrh klientskej ponuky</h1><p className="iv-sub">{lead ? lead.name : 'Klient'} · {inquiry.label || 'dopyt'} · pripravené {fmtDateTime(offer.created_at)} · <span className={`iv-pill ${offer.status === 'draft' ? 'warn' : 'ok'}`}>{offer.status === 'draft' ? 'čaká na kontrolu človekom' : offer.status === 'reviewed' ? `skontrolovaná (${(offer.reviewed_by || '').split('@')[0]}, ${fmtDate(offer.reviewed_at)})` : 'označená ako odoslaná'}</span></p></div><Link className="btn line" href={`/investicie/dopyt/${inquiry.id}`}>← Späť na dopyt</Link></div>
        <div className="iv-msg warn" style={{ marginTop: 10 }}>Aplikácia ponuku neodosiela. Skontroluj ju, skopíruj alebo vytlač a odošli vedome sám. Interné poznámky sú nižšie oddelene a v klientskom náhľade nie sú.</div>
        {notices.map((n, i) => <div key={i} className="iv-msg err" style={{ marginTop: 8 }}>Pozor: {n.text} Ponuka si drží pôvodný výpočet; zváž novú ponuku.</div>)}
      </section>
      <section className="card"><h2>Úvod pre klienta (upraviteľný)</h2>
        <div className="iv-form"><label className="wide">Text<textarea value={intro} disabled={locked} onChange={(e) => setIntro(e.target.value)} style={{ minHeight: 90 }} /></label></div>
        <p className="iv-hint">{offer.internal && offer.internal.ai_intro ? 'Úvod preformuloval AI; čísla sú vždy z výpočtu v kóde.' : 'Úvod je šablónový; čísla sú vždy z výpočtu v kóde.'}</p>
        <div className="iv-actions"><button type="button" className="btn line" disabled={pending || locked || !dirty} onClick={() => run(() => saveOfferAction(offer.id, { intro, internal_notes: notes }), 'Uložené. Ponuku treba znovu skontrolovať.')}>Uložiť zmeny</button>
          <button type="button" className="btn" disabled={pending || offer.status !== 'draft' || dirty} onClick={() => run(() => reviewOfferAction(offer.id), 'Ponuka je označená ako skontrolovaná.')}>Skontroloval(a) som ponuku</button>
          <button type="button" className="btn line" disabled={pending || offer.status !== 'reviewed'} onClick={() => run(() => markOfferSentAction(offer.id), 'Zaznamenané, že ponuku si odoslal(a) sám.')}>Zaznamenať, že som ju odoslal(a) sám</button>
          <button type="button" className="btn line" onClick={() => window.print()}>Vytlačiť klientsky náhľad</button></div>
      </section>
      <section><h2 style={{ margin: '0 0 8px' }}>Klientsky náhľad</h2><ClientPreview content={offer.content} /></section>
      <section className="card"><h2>Interné poznámky (nie sú v ponuke)</h2>
        <div className="iv-form"><label className="wide">Moje poznámky<textarea value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} /></label></div>
        {(offer.internal.items || []).map((x, i) => <p key={i} className="iv-hint"><b>Nehnuteľnosť {i + 1}:</b> skóre {x.score} · {x.rank_reason} · kvalita {x.quality ? `${x.quality.score}/100` : '—'}{x.seller ? ` · predajca: ${x.seller}` : ''}{x.notes ? ` · poznámka: ${x.notes}` : ''}</p>)}
      </section>
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
