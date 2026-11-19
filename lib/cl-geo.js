// Upratovanie: z adresy bydliska súradnice (OpenStreetMap Nominatim). Beží len na serveri, `fetchImpl` sa dá podstrčiť v testoch.
// Adresa bydliska odchádza na verejnú službu OpenStreetMap; posiela sa len text adresy, nič iné (bez mena a e-mailu).
const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const UA = 'livein-upratovanie/1.0'

export function cleanAddress(address, city) {
  const a = String(address || '').replace(/\s+/g, ' ').trim()
  const c = String(city || '').replace(/\s+/g, ' ').trim()
  if (!a && !c) return ''
  if (c && a.toLowerCase().includes(c.toLowerCase())) return a.slice(0, 200)
  return [a, c].filter(Boolean).join(', ').slice(0, 200)
}

export function parseNominatim(json) {
  const r = Array.isArray(json) ? json[0] : null
  if (!r) return null
  const lat = Number(r.lat), lng = Number(r.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label: String(r.display_name || '').slice(0, 200) }
}

export async function geocode(address, city, fetchImpl = fetch) {
  const q = cleanAddress(address, city)
  if (q.length < 4) return { ok: false, status: 'too_short' }
  const url = `${ENDPOINT}?format=json&limit=1&countrycodes=sk,cz,at,hu&q=${encodeURIComponent(q)}`
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'sk' }, signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined })
    if (!res.ok) return { ok: false, status: 'http_' + res.status }
    const hit = parseNominatim(await res.json())
    return hit ? { ok: true, ...hit } : { ok: false, status: 'not_found' }
  } catch {
    return { ok: false, status: 'network' }
  }
}
