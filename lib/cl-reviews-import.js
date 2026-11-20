// Upratovanie: recenzie z Guesty -> záznamy pre cl_import_reviews. Čisté mapovanie a stránkovanie; volanie Guesty dostane funkcia `get`.
// Štruktúra recenzií sa líši podľa kanála (Airbnb: rawReview.overall_rating 1–5, Booking: skóre 1–10), preto sa čítajú opatrne.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const clamp = (n) => (n == null ? null : Math.min(5, Math.max(1, Math.round(n * 10) / 10)))

export function channelOf(r) {
  const c = String((r && (r.channelId || r.channel || r.source || (r.rawReview && r.rawReview.channel))) || '').toLowerCase()
  if (c.includes('airbnb')) return 'airbnb'
  if (c.includes('booking')) return 'booking'
  if (c.includes('google')) return 'google'
  if (c.includes('direct') || c.includes('manual')) return 'direct'
  return 'other'
}

/** Celkové hodnotenie v škále 1–5 (Booking 1–10 sa prevedie), alebo null. */
export function ratingOf(r, channel) {
  const raw = (r && r.rawReview) || {}
  const direct = num(r && (r.rating ?? r.overallRating ?? r.overall_rating)) ?? num(raw.overall_rating ?? raw.rating) ?? num(raw.scoring && raw.scoring.review_score)
  if (direct == null) return null
  const n = channel === 'booking' || direct > 5 ? direct / 2 : direct
  return clamp(n)
}

export function cleanlinessOf(r, channel) {
  const raw = (r && r.rawReview) || {}
  const cats = Array.isArray(raw.category_ratings) ? raw.category_ratings : Array.isArray(r && r.categoryRatings) ? r.categoryRatings : []
  const c = cats.find((x) => x && String(x.category || x.name || '').toLowerCase().includes('clean'))
  let v = c ? num(c.rating ?? c.value) : num(raw.scoring && raw.scoring.cleanliness) ?? num(r && r.cleanliness)
  if (v == null) return null
  if (channel === 'booking' || v > 5) v /= 2
  return clamp(v)
}

export function textOf(r) {
  const raw = (r && r.rawReview) || {}
  const parts = [raw.public_review, r && r.text, r && r.comment, raw.content && raw.content.headline, raw.content && raw.content.positive, raw.content && raw.content.negative].filter((x) => typeof x === 'string' && x.trim())
  return [...new Set(parts.map((x) => x.trim()))].join(' | ').slice(0, 2000)
}

const idOf = (v) => (v && typeof v === 'object' ? String(v.$oid || v._id || v.id || '') : v == null ? '' : String(v))

/** Jedna recenzia z Guesty -> položka pre cl_import_reviews, alebo null, keď chýba ID alebo hodnotenie. */
export function mapGuestyReview(r) {
  if (!r) return null
  const id = idOf(r._id || r.id)
  const ch = channelOf(r)
  const rating = ratingOf(r, ch)
  if (!id || rating == null) return null
  return {
    external_id: `guesty:${id}`,
    reservation_id: idOf(r.reservationId || r.reservation) || null,
    confirmation_code: r.confirmationCode || (r.reservation && r.reservation.confirmationCode) || null,
    listing_id: idOf(r.listingId || r.listing) || null,
    source: ch,
    rating,
    cleanliness: cleanlinessOf(r, ch),
    text: textOf(r),
  }
}

export function reviewList(j) {
  if (Array.isArray(j)) return j
  for (const k of ['results', 'reviews', 'data']) {
    const v = j && j[k]
    if (Array.isArray(v)) return v
    if (v && typeof v === 'object') for (const kk of ['results', 'reviews', 'data']) if (Array.isArray(v[kk])) return v[kk]
  }
  return []
}

export const createdOf = (r) => String((r && (r.createdAt || r.created_at || r.createdAtGuesty || (r.rawReview && (r.rawReview.submitted_at || r.rawReview.created_at)))) || '')

/** Stiahne recenzie stránkovaním (od najnovších), kým nie sú staršie než `sinceIso` alebo skončia stránky. */
export async function fetchRecentReviews(get, { sinceIso, pageSize = 100, maxPages = 5 } = {}) {
  const out = []
  for (let page = 0; page < maxPages; page++) {
    const list = reviewList(await get('/v1/reviews', { limit: pageSize, skip: page * pageSize, sort: '-createdAt' }))
    if (!list.length) break
    out.push(...list)
    const last = createdOf(list[list.length - 1])
    if (list.length < pageSize || (sinceIso && last && last < sinceIso)) break
  }
  return sinceIso ? out.filter((r) => !createdOf(r) || createdOf(r) >= sinceIso) : out
}
