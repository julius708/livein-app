'use client'
import { seedDemoAction, clearDemoAction, applyPresetAction, enableWebSearchAction } from '@/app/investicie/actions'
import { useAct, Toast } from './ui'

const STEPS = [
  ['Načítaj ukážku', 'Tlačidlom vyššie sa vytvoria fiktívne nehnuteľnosti, traja fiktívni klienti s dopytmi, zhody, rozhodnutia, úloha a návrh ponuky. Nikomu sa neposiela žiadne upozornenie.'],
  ['Prehľad', 'V záložke Prehľad uvidíš nové zhody, zamietnuté ponuky na opätovné posúdenie, už nedostupné byty a úlohy (prepni na „Celý tím“).'],
  ['Dopyt klienta', 'V záložke Dopyty otvor „Byt do 200 000 € v Bratislave“: vhodné ponuky s dôvodmi, byt za 195 000 € s nákladmi 15 000 € je „mimo podmienok“, chýbajúce náklady sú označené ako neznáme.'],
  ['Prepočet', 'V detaile nehnuteľnosti „Kramárska 3“ doplň náklady (Doplniť / upraviť údaje → Uložiť a prepočítať) a pozri, ako sa zmení výpočet aj zhoda. Zmeň cenu a v histórii uvidíš novú verziu výpočtu.'],
  ['Rozhodnutia Zuzky', 'Pri zhode skús Kandidát, Zamietnuť s dôvodom, Zapísať obhliadku, Overiť dostupnosť (vytvorí úlohu) a Pripraviť návrh ponuky. Ponuku musí človek skontrolovať, aplikácia ju sama neodošle.'],
  ['CRM', 'V CRM otvor ukážkový kontakt „[UKÁŽKA] Marta Vzorová“: v sekcii Investičné dopyty vidíš dopyty a vhodné ponuky.'],
  ['Agent', 'V Agent a nastavenia zapni vyhľadávanie na internete a klikni Spustiť teraz. Nájdené ponuky pribudnú medzi nehnuteľnosti (označené ako neoverené, kým sa nepotvrdia na stránke inzerátu).'],
  ['Upratanie', 'Keď skončíš, tlačidlom „Odstrániť ukážkové dáta“ zmizne všetko fiktívne; skutočné dáta sa nedotknú.'],
]

export default function DemoPanel({ isAdmin, hasDemo, webSearch }) {
  const { run, pending, msg, setMsg } = useAct()
  return (
    <section className="card">
      <h2>Ukážka a návod na vyskúšanie</h2>
      {isAdmin ? (
        <div className="iv-actions">
          <button type="button" className="btn" disabled={pending || hasDemo} onClick={() => run(() => seedDemoAction(), (r) => (r.already ? 'Ukážka už je načítaná.' : `Načítané: ${r.properties} nehnuteľností, ${r.leads} klienti, ${r.inquiries} dopyty. Nastavenia kalkulačky sú podľa Lazaretskej 15.`))}>{pending ? 'Pracujem…' : hasDemo ? 'Ukážka je načítaná' : 'Načítať ukážkové dáta (fiktívne)'}</button>
          <button type="button" className="btn line" disabled={pending || !hasDemo} onClick={() => { if (window.confirm('Odstrániť všetky ukážkové dáta? Skutočné dáta sa nedotknú.')) run(() => clearDemoAction(), (r) => `Odstránené: ${r.properties} nehnuteľností, ${r.inquiries} dopytov, ${r.leads} kontakty.`) }}>Odstrániť ukážkové dáta</button>
          <button type="button" className="btn line" disabled={pending} onClick={() => run(() => applyPresetAction(), 'Kalkulačka je nastavená podľa Lazaretskej 15.')}>Nastaviť kalkulačku podľa Lazaretskej 15</button>
          <button type="button" className="btn line" disabled={pending} onClick={() => run(() => enableWebSearchAction(!webSearch), webSearch ? 'Vyhľadávanie na internete vypnuté.' : 'Vyhľadávanie na internete zapnuté. Spusti ho v Agent a nastavenia.')}>{webSearch ? 'Vypnúť vyhľadávanie na internete' : 'Zapnúť vyhľadávanie na internete'}</button>
        </div>
      ) : <p className="iv-hint">Ukážkové dáta a nastavenia načíta admin.</p>}
      <ol className="iv-hint" style={{ paddingLeft: 20, lineHeight: 1.5 }}>{STEPS.map(([t, d]) => <li key={t}><b>{t}.</b> {d}</li>)}</ol>
      <p className="iv-hint">Predvoľba Lazaretská 15: cena za noc okolo 98 €, poplatky portálov 15 %, správa 17 %, DPH 5 %, upratovanie 25 €, energie 200 €/mes., zariadenie 15 000 € (ilustračne). Kritérium výnosu 5 % je ukážkové, nie schválené.</p>
      <Toast msg={msg} onClose={() => setMsg(null)} />
    </section>
  )
}
