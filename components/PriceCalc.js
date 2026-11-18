'use client'
import { useMemo, useState } from 'react'
import { addDaysIso, availabilityLink, checkGuestyPrice, fmtEur, fmtEur1, guestOffer, nightsBetween, nightsWord, quote, reservationLink } from '@/lib/price-calc'
import { CITY_NAMES } from '@/lib/price-calc-data'

const MODEL_LABEL = { C: 'C model', S: 'Special Client', R: 'R2R' }
const strip = (s) => s.replace(/^(KE|TT): ?/, '')
const dmy = (iso) => (iso ? `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}` : '')
const QUICK = [1, 2, 3, 5, 7, 14, 28]

function Person({ i, inc, fee, on, onClick }) {
  return (
    <button type="button" className={`kc-p ${inc ? 'inc' : 'ext'} ${on ? 'on' : 'off'}`} aria-pressed={on} aria-label={`${i}. osoba`} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4" fill="currentColor" /><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z" fill="currentColor" /></svg>
      <span>{i}.</span>
      <b>{inc ? 'v cene' : `+${fee} €`}</b>
    </button>
  )
}

export default function PriceCalc({ apartments, dataDate, today, defaultCheckIn, defaultCheckOut, initial = {} }) {
  const start = initial.aptIdx ?? Math.max(0, apartments.findIndex((a) => a.name.startsWith('Moskovská')))
  const [city, setCity] = useState('ALL')
  const [aptIdx, setAptIdx] = useState(start)
  const [search, setSearch] = useState(apartments[start].name)
  const [checkIn, setCheckIn] = useState(initial.checkIn || defaultCheckIn)
  const [checkOut, setCheckOut] = useState(initial.checkOut || (initial.checkIn ? addDaysIso(initial.checkIn, 1) : defaultCheckOut))
  const [guests, setGuests] = useState(Math.min(initial.guests || 2, apartments[start].cap))
  const [cleanings, setCleanings] = useState(1)
  const [taxOn, setTaxOn] = useState(true)
  const [taxRate, setTaxRate] = useState(String(apartments[start].cityTax))
  const [guesty, setGuesty] = useState('')
  const [copied, setCopied] = useState('')
  const [lang, setLang] = useState('sk')

  const apt = apartments[aptIdx]
  const cities = useMemo(() => ['ALL', ...Array.from(new Set(apartments.map((a) => a.city)))], [apartments])
  const options = useMemo(() => apartments.filter((a) => city === 'ALL' || a.city === city), [apartments, city])
  const n = nightsBetween(checkIn, checkOut)
  const q = useMemo(() => quote({ apt, checkIn, checkOut, guests, cleanings, cityTaxOn: taxOn, cityTaxRate: taxRate }), [apt, checkIn, checkOut, guests, cleanings, taxOn, taxRate])
  const verdict = q.ok ? checkGuestyPrice(q, guesty) : null
  const g = q.ok ? q.guests : Math.min(guests, apt.cap)

  function pickApartment(i) {
    const a = apartments[i]
    setAptIdx(i)
    setSearch(a.name)
    setTaxRate(String(a.cityTax))
    if (guests > a.cap) setGuests(a.cap)
  }
  function onSearch(v) {
    setSearch(v)
    const i = apartments.findIndex((a) => a.name === v)
    if (i >= 0) pickApartment(i)
  }
  function onCheckIn(v) {
    setCheckIn(v)
    if (v && nightsBetween(v, checkOut) < 1) setCheckOut(addDaysIso(v, 1))
    if (v && nightsBetween(v, checkOut) >= 60 && taxOn) setTaxOn(false)
  }
  function onCheckOut(v) {
    setCheckOut(v)
    if (nightsBetween(checkIn, v) >= 60 && taxOn) setTaxOn(false)
  }
  function setNights(k) {
    if (!checkIn) return
    setCheckOut(addDaysIso(checkIn, k))
    if (k >= 60 && taxOn) setTaxOn(false)
  }
  async function copy(key, text) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const t = document.createElement('textarea')
      t.value = text
      document.body.appendChild(t)
      t.select()
      try { document.execCommand('copy') } catch { /* nevadí */ }
      t.remove()
    }
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600)
  }

  const xp = q.ok ? q.explain.extra : null
  const unset = apt.extraFee < 0
  const inc = apt.includedGuests || apt.cap
  const fee = Math.max(0, apt.extraFee || 0)

  return (
    <div className="kc">
      <section className="card kc-head">
        <div>
          <span className="eyebrow">Ceny</span>
          <h1>Kalkulačka ceny</h1>
          <p>Vyber byt, termín a počet hostí. Ukáže silnú, strednú a slabú cenu a čo z nej dostane majiteľ. Pravidlá a čísla sú z kalkulačky od Niny.</p>
        </div>
        <div className="kc-meta"><b>{apartments.length}</b><span>apartmánov</span><small>dáta k {dmy(dataDate)} (PriceLabs)</small></div>
      </section>

      <div className="kc-grid">
        <section className="card kc-form" aria-label="Vstupy">
          <h2>1. Byt</h2>
          <div className="kc-chips" role="group" aria-label="Mesto">
            {cities.map((c) => (
              <button key={c} type="button" className={`kc-chip${city === c ? ' on' : ''}`} aria-pressed={city === c} onClick={() => setCity(c)}>{c === 'ALL' ? 'Všetky' : CITY_NAMES[c]}</button>
            ))}
          </div>
          <label className="kc-l" htmlFor="kc-apt">Apartmán ({options.length})</label>
          <input id="kc-apt" className="kc-in" list="kc-apts" value={search} onChange={(e) => onSearch(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Začni písať názov bytu…" autoComplete="off" />
          <datalist id="kc-apts">{options.map((a) => <option key={a.name} value={a.name} />)}</datalist>
          <div className="kc-tags">
            <span className="kc-tag">{CITY_NAMES[apt.city]}</span>
            <span className="kc-tag">max {apt.cap} {apt.cap > 4 ? 'hostí' : 'hostia'}</span>
            <span className="kc-tag">upratovanie {apt.cleaning} €</span>
            {MODEL_LABEL[apt.model] && <span className={`kc-tag${apt.model === 'R' ? ' r2r' : ''}`}>{MODEL_LABEL[apt.model]}</span>}
          </div>

          <h2>2. Termín</h2>
          <div className="kc-row">
            <div><label className="kc-l" htmlFor="kc-ci">Príchod</label><input id="kc-ci" className="kc-in" type="date" value={checkIn} min={today} onChange={(e) => onCheckIn(e.target.value)} /></div>
            <div><label className="kc-l" htmlFor="kc-co">Odchod</label><input id="kc-co" className="kc-in" type="date" value={checkOut} min={checkIn || today} onChange={(e) => onCheckOut(e.target.value)} /></div>
          </div>
          <div className="kc-chips" role="group" aria-label="Počet nocí">
            {QUICK.map((k) => <button key={k} type="button" className={`kc-chip${n === k ? ' on' : ''}`} aria-pressed={n === k} onClick={() => setNights(k)}>{k} {nightsWord(k)}</button>)}
          </div>
          {availabilityLink(checkIn, checkOut, g) && n >= 1 && <p className="kc-n"><a className="kc-link" href={availabilityLink(checkIn, checkOut, g)}>Je byt voľný v tomto termíne? Otvoriť Voľné apartmány →</a></p>}
          <p className="kc-n" aria-live="polite">{n >= 1 ? <><b>{n} {nightsWord(n)}</b>{q.ok && q.weakPeriod ? ' · slabé obdobie' : ''}</> : <span className="kc-bad">Odchod musí byť po príchode.</span>}</p>

          <h2>3. Hostia</h2>
          <div className="kc-ppl" role="group" aria-label="Počet hostí">
            {Array.from({ length: apt.cap }, (_, k) => k + 1).map((i) => <Person key={i} i={i} inc={i <= inc || !fee} fee={fee} on={i <= g} onClick={() => setGuests(i)} />)}
          </div>
          <p className="kc-hint">
            {unset ? 'V PriceLabs nie je pri tomto byte nastavený príplatok za extra osobu. Over s Ninou.'
              : !fee || inc >= apt.cap ? 'Cena je rovnaká pre všetkých hostí, extra osoba sa neplatí.'
              : inc === 1 ? `V cene je 1 osoba. Platí sa hneď od 2. osoby: +${fee} € za noc za každú ďalšiu.`
              : `V cene sú ${inc} osoby. Platí sa až od ${inc + 1}. osoby: +${fee} € za noc za každú ďalšiu.`}
            {q.ok && xp && xp.extra > 0 && fee > 0 ? <> Teraz: {xp.extra} navyše × {fee} € × {n} {nightsWord(n)} = <b>{xp.total} €</b> (je už v silnej a strednej cene).</> : null}
          </p>

          <h2>4. Mestská daň a upratovanie</h2>
          <div className="kc-row">
            <div>
              <span className="kc-l">Mestská daň</span>
              <div className="kc-seg" role="group" aria-label="Mestská daň">
                <button type="button" className={taxOn ? 'on' : ''} aria-pressed={taxOn} onClick={() => setTaxOn(true)}>S mestskou daňou</button>
                <button type="button" className={!taxOn ? 'on' : ''} aria-pressed={!taxOn} onClick={() => setTaxOn(false)}>Bez (2 mesiace +)</button>
              </div>
            </div>
            <div>
              <label className="kc-l" htmlFor="kc-rate">Daň € / osoba / noc</label>
              <input id="kc-rate" className="kc-in" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value.replace(',', '.'))} disabled={!taxOn} />
            </div>
            <div>
              <label className="kc-l" htmlFor="kc-cl">Počet upratovaní</label>
              <input id="kc-cl" className="kc-in" type="number" min={1} max={99} value={cleanings} onChange={(e) => setCleanings(e.target.value === '' ? '' : Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
            </div>
          </div>
          <p className="kc-hint">Pri dlhom pobyte pridaj priebežné upratovania, ak ich hosť dostane. Mestská daň sa pripočíta navrch a ide celá mestu.</p>
        </section>

        <section className="kc-out" aria-label="Výsledok" aria-live="polite">
          {!q.ok ? (
            <div className="card kc-empty">{q.error}</div>
          ) : (
            <>
              {q.tiers.map((t) => (
                <article key={t.key} className={`card kc-card ${t.key}`}>
                  <div className="kc-tier"><span className="dot" />{t.label}</div>
                  <div className="kc-price">{fmtEur(t.total)} <small>{q.taxOn ? 's daňou' : 'celkom'}</small></div>
                  <dl className="kc-kv">
                    <dt>Hosť / noc</dt><dd>{fmtEur1(t.perNight)}</dd>
                    <dt>Cena bez dane</dt><dd>{fmtEur(t.gross)}</dd>
                    {t.extraTotal > 0 && <><dt>z toho extra osoby</dt><dd>{fmtEur(t.extraTotal)}</dd></>}
                    {q.taxOn && <><dt>Mestská daň</dt><dd>{fmtEur1(q.tax)}</dd></>}
                    <dt>{q.ownerLabel} / noc</dt><dd className="own">{fmtEur1(t.ownerPerNight)}</dd>
                    <dt>{q.ownerLabel} spolu</dt><dd>{fmtEur(t.owner)}</dd>
                  </dl>
                  <p className="kc-msg">{t.hint}</p>
                  {t.key === 'weak' && <div className="kc-warn"><b>Pozor:</b> pristúpiť k tejto rezervácii, len ak ide o slabé obdobie (október, november, január, február).{!q.weakPeriod && <> <b>Tento termín nie je v slabom období.</b></>}</div>}
                  <div className="kc-acts">
                    {reservationLink(q, t.key, checkIn, checkOut) && <a className="btn kc-book" href={reservationLink(q, t.key, checkIn, checkOut)}>Rezervovať za túto cenu →</a>}
                    <button type="button" className="btn line" onClick={() => copy(`p-${t.key}`, `${Math.round(t.total)} € spolu za ${n} ${nightsWord(n)}${q.taxOn ? ' (vrátane mestskej dane)' : ''}`)}>{copied === `p-${t.key}` ? 'Skopírované ✓' : 'Kopírovať cenu'}</button>
                    <button type="button" className="btn line" onClick={() => copy(`o-${t.key}`, guestOffer(q, t.key, checkIn, checkOut, lang))}>{copied === `o-${t.key}` ? 'Skopírované ✓' : `Text pre hosťa (${lang === 'sk' ? 'SK' : 'EN'})`}</button>
                  </div>
                </article>
              ))}
              <div className="kc-lang" role="group" aria-label="Jazyk textu pre hosťa">Text pre hosťa:
                <button type="button" className={lang === 'sk' ? 'on' : ''} aria-pressed={lang === 'sk'} onClick={() => setLang('sk')}>Slovensky</button>
                <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
              </div>
              {q.warnings.length > 0 && (
                <div className="card kc-notes">
                  <h3>Na čo si dať pozor</h3>
                  <ul>{q.warnings.filter((w) => w.code !== 'not_weak_period').map((w) => <li key={w.code}>{w.text}</li>)}</ul>
                </div>
              )}
            </>
          )}

          <div className="card kc-check">
            <h3>Kontrola ceny z Guesty</h3>
            <label className="kc-l" htmlFor="kc-gp">Cena z Guesty (celkom){taxOn ? ', vrátane mestskej dane' : ''}</label>
            <input id="kc-gp" className="kc-in" inputMode="decimal" placeholder="napr. 320" value={guesty} onChange={(e) => setGuesty(e.target.value.replace(',', '.'))} />
            {verdict && (
              <p className="kc-verdict">
                <span className={`kc-badge ${verdict.level}`}>{verdict.label}</span>
                <span>{fmtEur(verdict.price)} → {q.ownerLabel.toLowerCase()} <b>{fmtEur1(verdict.ownerPerNight)}</b> / noc ({fmtEur(verdict.owner)} spolu)</span>
                {verdict.level === 'bad' && <span className="kc-bad">Neprijať. Minimum pre tento termín je {fmtEur(verdict.minimum)}.</span>}
              </p>
            )}
          </div>

          {q.ok && (
            <details className="card kc-how">
              <summary>Ako sme to vypočítali</summary>
              <ul>
                <li><b>Slabá:</b> najnižšia cena, pri ktorej majiteľ dostane {apt.weakMin} € / noc. Vyjde z {q.explain.weakFormula}, zaokrúhlené nahor.</li>
                <li><b>Silná:</b> {apt.basePrice ? <>základná cena {apt.basePrice} € × {n} {nightsWord(n)}{q.explain.discPct ? ` po zľave ${q.explain.discPct} % (${n >= 28 ? 'mesačná' : 'týždenná'})` : ''}, plus extra osoby {fmtEur(q.explain.extra.total)}, plus upratovanie {fmtEur(q.explain.cleaningTotal)}</> : <>základná cena z PriceLabs chýba, preto 1,5 × slabá plus extra osoby</>}. Nikdy menej ako 115 % slabej.</li>
                <li><b>Stredná:</b> v polovici medzi slabou a silnou.</li>
                <li><b>{q.ownerLabel}:</b> cena bez dane − provízia LIVE-IN {Math.round(apt.commission * 100)} % ({apt.modelLabel}) − DPH 5 % z ubytovania − upratovanie − materiál 0,70 € / hosť / noc.</li>
                <li>Všetky ceny sú zaokrúhlené nahor na celé eurá. Mestská daň sa pripočíta navrch.</li>
              </ul>
              <p className="kc-hint">Čísla (provízie, upratovanie, ceny, zľavy) sú z tabuľky k {dmy(dataDate)}. Ak sa niečo zmenilo, napíš Nine alebo cez Feedback.</p>
            </details>
          )}
        </section>
      </div>
    </div>
  )
}
