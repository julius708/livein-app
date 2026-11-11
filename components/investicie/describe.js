import { eur } from '@/lib/inv-fmt'
import { propStatusLabel, decisionLabel } from '@/lib/inv-core'
/** Čitateľný popis udalosti v histórii nehnuteľnosti alebo dopytu. */
export function describeEvent(e) {
  const p = e.payload || {}
  switch (e.type) {
    case 'created': return `Nájdené (${p.source || 'zdroj'}${p.via ? ', ' + String(p.via).replace(/^agent:/, 'agent ') : ''})${p.price ? ' za ' + eur(p.price) : ''}`
    case 'listing_added': return `Pridaný ďalší zdroj: ${p.source}`
    case 'price_change': return `Zmena ceny ${eur(p.from)} → ${eur(p.to)} (${p.pct > 0 ? '+' : ''}${String(p.pct).replace('.', ',')} %)${p.significant ? ' · významná' : ''}`
    case 'price_differs': return `Iný portál uvádza inú cenu: ${eur(p.other)} (evidovaná ${eur(p.existing)})`
    case 'status': return `Stav: ${propStatusLabel(p.from)} → ${propStatusLabel(p.to)}${p.reason ? ' – ' + p.reason : ''}${p.note ? ' – ' + p.note : ''}`
    case 'calc_version': return `Nová verzia výpočtu v${p.version}${p.yield_base != null ? ` (výnos ${String(p.yield_base).replace('.', ',')} %)` : ''}`
    case 'edited': return `Upravené údaje: ${(p.fields || []).join(', ')}`
    case 'merged': return 'Zlúčené s inou ponukou'
    case 'merge_suggested': return `Možný duplikát (zhoda ${p.score} %: ${(p.reasons || []).join(', ')})`
    case 'match_new': return `Nová zhoda s dopytom (${p.category === 'match' ? 'vyhovuje' : 'mimo podmienok'}, skóre ${p.score})`
    case 'match_changed': return `Zhoda zmenená: ${p.from} → ${p.to}`
    case 'decision': return `Rozhodnutie: ${decisionLabel(p.from)} → ${decisionLabel(p.to)}${p.reason ? ' – ' + p.reason : ''}`
    case 'inquiry_created': return 'Dopyt vytvorený'
    case 'inquiry_edited': return `Dopyt upravený (${(p.fields || []).join(', ')})`
    case 'inquiry_confirmed': return 'Záujem klienta potvrdený'
    case 'offer_drafted': return `Pripravený návrh ponuky (${p.properties} nehn.)`
    default: return e.type
  }
}
