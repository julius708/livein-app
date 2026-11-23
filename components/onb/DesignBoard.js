'use client'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setDesignMeta, addRoom, hideRoom, generatePair, checkPending, chooseDesign } from '@/app/zaradenie/[id]/dizajn/actions'
import { STYLES, ROOMS } from '@/lib/onb-design'
import ItemsPanel from '@/components/onb/ItemsPanel'
import ShopPanel from '@/components/onb/ShopPanel'
import Link from 'next/link'

/** Zmenší fotku v prehliadači (max 1600 px, JPEG), aby sa nahrávala rýchlo aj z mobilu. */
async function shrink(file) {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86))
    return blob ? new File([blob], (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

function Meta({ unit }) {
  const [st, act, pending] = useActionState(setDesignMeta, null)
  return (
    <form action={act} className="big dmeta">
      <input type="hidden" name="id" value={unit.id} />
      <div className="g2">
        <div><label>Rozpočet na zariadenie bytu (€)</label><input className="f" name="budget_eur" type="number" min="0" step="50" inputMode="numeric" defaultValue={unit.budget_eur ?? ''} placeholder="napr. 2500" required /></div>
        <div><label>Štýl</label><select className="f" name="design_style" defaultValue={unit.design_style || ''} required><option value="">— vyber štýl —</option>{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
      </div>
      <div><button className="btn" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť rozpočet a štýl'}</button> {st && !st.ok && <span className="msg err">{st.error}</span>}{st && st.ok && <span className="msg ok">Uložené.</span>}</div>
    </form>
  )
}

function Upload({ unitId }) {
  const [st, act, pending] = useActionState(addRoom, null)
  const [busy, setBusy] = useState(false)
  const [, startT] = useTransition()
  const ref = useRef(null)
  // viac fotiek naraz: každá sa zmenší a nahrá samostatne ako miestnosť rovnakého typu
  const onSubmit = async (e) => {
    e.preventDefault(); const form = e.currentTarget; const files = Array.from(form.photo.files || [])
    if (!files.length) return
    setBusy(true)
    const base = new FormData(form)
    for (const f of files) { const fd = new FormData(); for (const [k, v] of base.entries()) if (k !== 'photo') fd.set(k, v); fd.set('photo', await shrink(f)); startT(() => act(fd)) }
    setBusy(false); form.reset()
  }
  return (
    <form onSubmit={onSubmit} className="big upload">
      <input type="hidden" name="unit_id" value={unitId} />
      <div className="g3">
        <div><label>Miestnosť</label><select className="f" name="room_type" defaultValue="obyvacka">{Object.entries(ROOMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label>Označenie (voliteľné)</label><input className="f" name="label" placeholder="napr. Spálňa 2" maxLength={60} /></div>
        <div><label>Fotka (aj prázdnej miestnosti)</label><input ref={ref} className="f" type="file" name="photo" accept="image/*" multiple required /></div>
        <div style={{ gridColumn: '1/-1' }}><small className="hint">Vyber fotku z galérie alebo odfoť novú. Dá sa vybrať aj viac fotiek naraz (rovnaká miestnosť).</small></div>
      </div>
      <div><button className="btn big" disabled={pending || busy}>{pending || busy ? 'Nahrávam…' : '📷 Pridať miestnosť'}</button> {st && !st.ok && <span className="msg err">{st.error}</span>}</div>
    </form>
  )
}

function Room({ room, unit, isAdmin, creditsPerImage, items }) {
  const [st, act, pending] = useActionState(generatePair, null)
  const [busy, start] = useTransition()
  const rounds = [...new Set(room.designs.map((d) => d.round))].sort((a, b) => b - a)
  const chosen = room.designs.find((d) => d.chosen)
  const latest = rounds[0]
  const canGen = unit.budget_eur && unit.design_style
  return (
    <section className={`card room${chosen ? ' has' : ''}`}>
      <div className="rhead">
        <h2>{ROOMS[room.room_type]}{room.label ? ` · ${room.label}` : ''} {chosen && <span className="status spustene">vybrané</span>}</h2>
        <form action={(fd) => start(() => hideRoom(fd))}><input type="hidden" name="room_id" value={room.id} /><input type="hidden" name="unit_id" value={unit.id} /><input type="hidden" name="photo_path" value={room.photo_path} /><button className="mini" disabled={busy} onClick={(e) => { if (!confirm('Skryť miestnosť aj jej návrhy?')) e.preventDefault() }}>skryť</button></form>
      </div>
      <div className="rgrid">
        <figure className="ph"><img src={room.photo_url || ''} alt="Fotka miestnosti" loading="lazy" /><figcaption>Pôvodná fotka</figcaption></figure>
        {rounds.map((rd) => (
          <div key={rd} className="duel">
            {room.designs.filter((d) => d.round === rd).map((d) => <Design key={d.id} d={d} unitId={unit.id} />)}
            {rd === latest && <small className="hint">Kolo {rd}: ťukni na lepší návrh.</small>}
          </div>
        ))}
      </div>
      <form action={act} className="gen">
        <input type="hidden" name="unit_id" value={unit.id} /><input type="hidden" name="room_id" value={room.id} />
        <button className="btn" disabled={pending || !canGen} title={canGen ? '' : 'Najprv ulož rozpočet a štýl'}>{pending ? 'Odosielam do Higgsfieldu…' : rounds.length ? '✨ Vygeneruj iné dva' : '✨ Vygeneruj návrhy A a B'}</button>
        <span className="hint">{STYLES[unit.design_style]?.label || 'bez štýlu'} · približne {2 * creditsPerImage} kreditov</span>
        {st && !st.ok && <span className="msg err">{st.error}</span>}
      </form>
      {(chosen || items.length > 0) && <ItemsPanel unit={unit} room={room} items={items} hasDesign={!!chosen} />}
    </section>
  )
}

function Design({ d, unitId }) {
  const [busy, start] = useTransition()
  const pick = () => start(() => { const fd = new FormData(); fd.set('design_id', d.id); fd.set('unit_id', unitId); return chooseDesign(fd) })
  return (
    <div className={`des ${d.status}${d.chosen ? ' chosen' : ''}`}>
      {d.status === 'done' && d.url ? (
        <button type="button" className="pick" onClick={pick} disabled={busy} aria-pressed={d.chosen}>
          <img src={d.url} alt={`Návrh ${d.variant}`} loading="lazy" />
          <span className="tag">Návrh dizajnu, nie pre listing</span>
        </button>
      ) : d.status === 'failed' ? <div className="wait err">Návrh {d.variant} zlyhal: {d.error || 'neznáma chyba'}</div>
        : <div className="wait"><span className="spin" />Návrh {d.variant} sa pripravuje…</div>}
      <div className="dfoot"><b>{d.variant}</b>{d.chosen ? <span className="status spustene">vybraný</span> : d.status === 'done' ? <span className="hint">ťukni pre výber</span> : null}</div>
    </div>
  )
}

export default function DesignBoard({ unit, rooms, pending, isAdmin, creditsPerImage, items = [] }) {
  const router = useRouter()
  const used = rooms.flatMap((r) => r.designs).filter((d) => d.status !== 'failed').reduce((a, d) => a + Number(d.credits || 0), 0)
  // kým sa návrhy generujú, každých 8 s sa skontroluje stav u Higgsfieldu
  useEffect(() => {
    if (!pending) return
    let stop = false
    const tick = async () => { try { const r = await checkPending(unit.id); if (r && r.changed) router.refresh() } catch {} }
    const t = setInterval(() => { if (!stop) tick() }, 8000)
    tick()
    return () => { stop = true; clearInterval(t) }
  }, [pending, unit.id, router])
  return (
    <div className="design">
      <section className="card"><h2>1. Rozpočet a štýl</h2><p className="sub">Rozpočet sa pýta vždy pri konkrétnom byte. Pravidlo: čo najnižší rozpočet pri kvalitných veciach, ktoré dobre vyzerajú.</p><Meta unit={unit} /></section>
      <section className="card"><h2>2. Miestnosti</h2><p className="sub">Pridaj fotku každej miestnosti (obývačka, spálňa, kuchyňa, kúpeľňa, chodba). Fotky sa pred nahratím zmenšia.</p><Upload unitId={unit.id} /></section>
      {rooms.map((r) => <Room key={r.id} room={r} unit={unit} isAdmin={isAdmin} creditsPerImage={creditsPerImage} items={items.filter((i) => i.room_id === r.id)} />)}
      {items.length > 0 && (() => { const tierOf = Object.fromEntries(rooms.map((r) => [r.id, r.items_tier || 'standard'])); const missing = items.filter((i) => !i.present && (!i.tier || i.tier === tierOf[i.room_id])); return (
        <section className="card"><h2>4. Nákup</h2><p className="sub">Zo zvolenej verzie zoznamu každej miestnosti. Nákupný zoznam podľa predajcu s odkazom, cenou a dostupnosťou, súčet voči rozpočtu, zápis do Asany.</p><ShopPanel unit={unit} rooms={rooms} items={items} missing={missing} /></section>) })()}
      {rooms.some((r) => r.designs.some((d) => d.chosen)) && <section className="card"><h2>5. Výstup</h2><p className="sub">Rekapitulácia bytu, vybrané návrhy a zoznam toho, čo treba doplniť. Na mobile: Zdieľať → Uložiť ako PDF.</p><Link className="btn" href={`/zaradenie/${unit.id}/pdf`}>📄 Otvoriť PDF s dizajnom</Link></section>}
      <p className="hint">Kredity Higgsfield minuté na tento byt: približne {used} z {unit.design_credits_cap}. {pending ? 'Návrhy sa generujú, stránka sa sama obnoví.' : ''} Vygenerované obrázky sú vizualizácia, nikdy sa nepoužívajú ako fotky listingu.</p>
    </div>
  )
}
