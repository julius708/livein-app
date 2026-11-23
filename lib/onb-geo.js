/** Geokódovanie adresy cez OpenStreetMap Nominatim (bez kľúča). Vráti súradnice, mesto, PSČ a zónu city tax. */
const BA = /bratislava/i, KE = /ko[sš]ice/i
export function zoneFor(city) {
  if (BA.test(city || '')) return 'BA'
  if (KE.test(city || '')) return 'KE'
  return 'ine'
}
export async function geocode(address) {
  const q = new URLSearchParams({ q: address, format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'sk,cz,at,hu' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': 'LIVE-IN zaradenie bytov (info@live-in.co.uk)', 'Accept-Language': 'sk' }, cache: 'no-store' })
  if (!res.ok) throw new Error('Mapa neodpovedá, skús o chvíľu.')
  const [hit] = await res.json()
  if (!hit) return null
  const a = hit.address || {}
  const city = a.city || a.town || a.village || a.municipality || a.county || ''
  const street = [a.road, a.house_number].filter(Boolean).join(' ')
  return { lat: Number(hit.lat), lng: Number(hit.lon), city, zip: a.postcode || '', street, display: hit.display_name, zone: zoneFor(city) }
}
