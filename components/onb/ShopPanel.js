'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { findProducts, setPurchase, pushPurchasesToAsana } from '@/app/zaradenie/[id]/dizajn/actions'
import { PURCHASE, VENDORS, ROOMS } from '@/lib/onb-design'

const eur = (n) => `${Math.round(Number(n || 0))} €`

function Row({ it, unitId, roomName }) {
  const [busy, start] = useTransition()
  const set = (k, v) => start(() => { const fd = new FormData(); fd.set('item_id', it.id); fd.set('unit_id', unitId); fd.set(k, v); return setPurchase(fd) })
  return (
    <li className="sp">
      <div className="t">{it.qty}× {it.name} <small>{roomName}</small>{it.product_url ? <a href={it.product_url} target="_blank" rel="noreferrer">{it.product_name || 'produkt'} ↗</a> : <span className="miss">{it.availability || 'ešte nehľadané'}</span>}</div>
      <input className="pr" type="number" min="0" step="0.5" defaultValue={it.price ?? ''} placeholder="€/ks" disabled={busy} aria-label="Cena" onBlur={(e) => { if (String(e.target.value) !== String(it.price ?? '')) set('price', e.target.value) }} />
      <span className="av">{it.product_url ? it.availability || '' : ''}</span>
      <select value={it.purchase_status || ''} disabled={busy} onChange={(e) => set('purchase_status', e.target.value)}><option value="">—</option>{Object.entries(PURCHASE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </li>
  )
}

export default function ShopPanel({ unit, rooms, items, missing }) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [run, setRun] = useState(null) // { left, found, err }
  const [busy, start] = useTransition()
  const [asana, setAsana] = useState(null)
  const roomName = (id) => { const r = rooms.find((x) => x.id === id); return r ? ROOMS[r.room_type] : '' }
  const searched = missing.filter((i) => i.searched_at), withUrl = missing.filter((i) => i.product_url)
  const total = withUrl.reduce((a, i) => a + (i.price != null ? Number(i.price) * (i.qty || 1) : 0), 0)
  const byVendor = {}
  for (const i of withUrl) (byVendor[i.vendor || 'Iné'] ||= []).push(i)
  const notFound = searched.filter((i) => !i.product_url)
  const loop = (again) => start(async () => {
    let left = missing.length, found = 0
    for (let k = 0; k < 40; k++) {
      const fd = new FormData(); fd.set('unit_id', unit.id); if (again) fd.set('again', '1')
      const r = await findProducts(null, fd)
      if (!r || !r.ok) { setRun({ left, found, err: (r && r.error) || 'Vyhľadávanie zlyhalo.' }); router.refresh(); return }
      found += r.found || 0; left = r.left || 0; setRun({ left, found, err: '' }); router.refresh()
      if (r.done) break
      again = false
    }
    setRun((s) => ({ ...(s || {}), left: 0 }))
  })
  return (
    <div className="shop">
      {!missing.length && <p className="hint">Nič netreba dokúpiť, alebo ešte nie je zoznam vecí.</p>}
      {missing.length > 0 && !searched.length && !ask && <button type="button" className="btn big" onClick={() => setAsk(true)}>🛒 Chceš, aby som tieto veci vyhľadal na internete?</button>}
      {ask && !searched.length && !busy && (
        <div className="askbox"><p>Vyhľadám {missing.length} vecí v obchodoch {VENDORS.join(', ')}. Len produkty dostupné hneď (skladom alebo odber v meste {unit.city || 'bytu'}), najnižšia cena pri slušnej kvalite. Trvá to asi {Math.ceil(missing.length / 4)} minút, ide to po dávkach.</p>
          <div className="gen"><button type="button" className="btn" onClick={() => loop(false)}>Áno, vyhľadať</button><button type="button" className="btn o" onClick={() => setAsk(false)}>Teraz nie</button></div></div>
      )}
      {busy && <p className="msg info"><span className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />Hľadám… nájdené {run?.found || 0}, zostáva približne {run?.left ?? missing.length} vecí. Stránka sa priebežne dopĺňa.</p>}
      {run?.err && <p className="msg err">{run.err}</p>}
      {searched.length > 0 && (
        <>
          <div className="stot"><b>Spolu {eur(total)}</b>{unit.budget_eur ? <span className={total > Number(unit.budget_eur) ? 'over' : 'ok'}> z rozpočtu {eur(unit.budget_eur)} ({Math.round((total / Number(unit.budget_eur)) * 100)} %)</span> : null} · {withUrl.length} nájdených{notFound.length ? `, ${notFound.length} nenájdených` : ''}</div>
          {Object.entries(byVendor).sort().map(([v, arr]) => (
            <div key={v} className="vend"><h4>{v} <small>{arr.length} vecí · {eur(arr.reduce((a, i) => a + (i.price != null ? Number(i.price) * (i.qty || 1) : 0), 0))}</small></h4>
              <ul className="slist">{arr.map((i) => <Row key={i.id} it={i} unitId={unit.id} roomName={roomName(i.room_id)} />)}</ul></div>
          ))}
          {notFound.length > 0 && <div className="vend"><h4>Nenájdené <small>{notFound.length}</small></h4><ul className="slist">{notFound.map((i) => <Row key={i.id} it={i} unitId={unit.id} roomName={roomName(i.room_id)} />)}</ul></div>}
          <div className="gen">
            {!busy && <button type="button" className="btn o" onClick={() => loop(false)} disabled={!missing.some((i) => !i.searched_at)}>Dohľadať nové veci</button>}
            {!busy && <button type="button" className="btn o" onClick={() => { if (confirm('Vyhľadať znova všetky veci? Doterajšie odkazy sa prepíšu.')) loop(true) }}>Vyhľadať znova všetko</button>}
            <button type="button" className="btn" disabled={busy || !withUrl.length || !unit.asana_task_gid} title={unit.asana_task_gid ? '' : 'Byt nie je v Asane'} onClick={() => start(async () => { const fd = new FormData(); fd.set('unit_id', unit.id); const r = await pushPurchasesToAsana(null, fd); setAsana(r); router.refresh() })}>📌 Zapísať do Asany</button>
            {asana && (asana.ok ? <span className="msg ok">V Asane: {asana.n} podúloh podľa predajcu.</span> : <span className="msg err">{asana.error}</span>)}
          </div>
          <p className="hint">Ceny a dostupnosť sú z webu v čase vyhľadania, pred objednaním ich over na stránke produktu. Cenu môžeš prepísať, stav nákupu prepnúť (objednané, doručené, zmontované).</p>
        </>
      )}
    </div>
  )
}
