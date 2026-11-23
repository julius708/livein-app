'use client'
import { useActionState } from 'react'
import { saveListing } from '@/app/zaradenie/[id]/actions'

const ROOMS = {
  kuchyna: ['káva a čaj', 'základný riad', 'umývačka', 'kávovar', 'chladnička', 'mraznička', 'hrnce', 'kanvica', 'príbory', 'mikrovlnka', 'rúra', 'toaster', 'utierky'],
  obyvacka: ['jedálenský stôl a stoličky', 'TV', 'osvetlenie', 'sound systém', 'konferenčný stolík', 'pracovisko', 'pohovka', 'sofa bed', 'Wi-Fi router'],
  spalna: ['posteľná bielizeň min. 3 sady', 'skriňa', 'vankúše a prikrývky', 'nočné lampy', 'osviežovače', 'posteľ', 'vešiaky', 'kvalitný matrac', 'zatemňovacie závesy'],
  kupelna: ['vaňa', 'sprchový kút', 'WC papier', 'držiak', 'WC kefa', 'umývacie prostriedky', 'mydlo', 'kôš', 'uteráky min. 3 sady na osobu', 'práčka', 'sušička', 'sušiak', 'dávkovače', 'uterák pod nohy'],
  ostatne: ['výťah', 'zvončeková kamera', 'inteligentný zámok', 'detektor hluku', 'hasiaci prístroj', 'dymový detektor', 'náhradné kľúče', 'sušič vlasov', 'žehlička', 'návod k spotrebičom', 'ventilátor', 'stropný ventilátor', 'krb', 'detská stolička', 'samoška'],
}
const ROOM_LABEL = { kuchyna: 'Kuchyňa', obyvacka: 'Obývačka', spalna: 'Spálňa', kupelna: 'Kúpeľňa', ostatne: 'Ostatné' }
const AMEN = ['Wi-Fi', 'pet friendly', 'klimatizácia', 'balkón', 'TV', 'parkovanie v cene', 'výťah', 'pracovný stôl']

export default function ListingForm({ unit }) {
  const [st, act, pending] = useActionState(saveListing, null)
  const d = unit.listing || {}
  const has = (k, v) => Array.isArray(d[k]) && d[k].includes(v)
  const T = ({ k, label, type = 'text', ph }) => <div><label>{label}</label><input className="f" name={k} type={type} defaultValue={d[k] || ''} placeholder={ph || ''} /></div>
  const A = ({ k, label, ph }) => <div><label>{label}</label><textarea className="f" name={k} rows={2} defaultValue={d[k] || ''} placeholder={ph || ''} /></div>
  return (
    <form action={act} className="lform">
      <input type="hidden" name="id" value={unit.id} />
      <h3>Základné info</h3>
      <div className="g3"><T k="spalne" label="Počet spální" ph={unit.bedrooms ?? ''} /><T k="postele" label="Postele (napr. 1 manželská + 1 rozkladacia)" /><T k="max_hosti" label="Max. hostí" ph={unit.capacity ?? ''} /></div>
      <div className="g3"><T k="rozmery" label="Rozmery (m²)" ph={unit.sqm ?? ''} /><T k="dostupnost_od" label="Dostupnosť od" type="date" /><T k="upratovanie_pranie" label="Upratovanie a pranie (kto)" /></div>
      <h3>Parkovanie a vstup</h3>
      <A k="parkovanie" label="Inštrukcie na parkovanie" ph="ulica podľa PAAS, garáž, státie v cene…" />
      <A k="vstup" label="Inštrukcie na vstup (bez kódov, tie idú len do chránených tabuliek)" ph="vchod, poschodie, zámok, keysafe – bez kódov" />
      <h3>Upratovacia služba a technika</h3>
      <div className="g2"><T k="upratovacia_sluzba" label="Upratovacia služba (kontakt)" /><T k="zamok" label="Zámok (typ)" /><T k="ohrev_vody" label="Ohrev vody a kúrenie" /><T k="paplon" label="Aký paplón" /></div>
      <A k="info_pracovna" label="Info do práčovne" />
      <h3>Vybavenie</h3>
      <div className="checks">{AMEN.map((a) => <label key={a}><input type="checkbox" name="vybavenie[]" value={a} defaultChecked={has('vybavenie', a)} />{a}</label>)}</div>
      {Object.entries(ROOMS).map(([k, items]) => (<div key={k}><h3>{ROOM_LABEL[k]} <small style={{ color: 'var(--muted)', fontWeight: 500 }}>({items.length})</small></h3><div className="checks">{items.map((it) => <label key={it}><input type="checkbox" name={`${k}[]`} value={it} defaultChecked={has(k, it)} />{it}</label>)}</div></div>))}
      <A k="poznamka" label="Poznámky pre listing (titulok do 50 znakov, čo zdôrazniť, čo chýba)" />
      <div><button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť údaje pre listing'}</button> {st && !st.ok && <span className="msg err">{st.error}</span>}{st && st.ok && <span className="msg ok">Uložené.</span>}</div>
    </form>
  )
}
