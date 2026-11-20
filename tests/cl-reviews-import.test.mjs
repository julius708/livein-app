import test from 'node:test'
import assert from 'node:assert/strict'
import { channelOf, ratingOf, cleanlinessOf, textOf, mapGuestyReview, reviewList, fetchRecentReviews } from '../lib/cl-reviews-import.js'

test('kanál, hodnotenie a čistota: Airbnb 1–5, Booking 1–10 sa prevedie', () => {
  assert.equal(channelOf({ channelId: 'airbnb2' }), 'airbnb'); assert.equal(channelOf({ channelId: 'bookingCom' }), 'booking'); assert.equal(channelOf({}), 'other')
  const air = { rawReview: { overall_rating: 4, category_ratings: [{ category: 'accuracy', rating: 5 }, { category: 'cleanliness', rating: 3 }], public_review: 'Fajn' } }
  assert.equal(ratingOf(air, 'airbnb'), 4); assert.equal(cleanlinessOf(air, 'airbnb'), 3)
  const bk = { rawReview: { scoring: { review_score: 8.4, cleanliness: 6 }, content: { positive: 'Čisto', negative: 'Hluk' } } }
  assert.equal(ratingOf(bk, 'booking'), 4.2); assert.equal(cleanlinessOf(bk, 'booking'), 3)
  assert.equal(ratingOf({ rating: 10 }, 'other'), 5) // škála 10 sa pozná podľa hodnoty
  assert.equal(ratingOf({ rating: 0.2 }, 'airbnb'), 1) // spodná hranica
  assert.equal(ratingOf({}, 'airbnb'), null)
  assert.equal(textOf(bk), 'Čisto | Hluk'); assert.equal(textOf(air), 'Fajn'); assert.equal(textOf({}), '')
})

test('mapovanie recenzie na položku importu; bez ID alebo hodnotenia sa preskočí', () => {
  const r = { _id: 'abc', reservationId: { $oid: 'res1' }, listingId: 'L1', channelId: 'airbnb2', confirmationCode: 'HM123', rawReview: { overall_rating: 5, public_review: 'Super' } }
  assert.deepEqual(mapGuestyReview(r), { external_id: 'guesty:abc', reservation_id: 'res1', confirmation_code: 'HM123', listing_id: 'L1', source: 'airbnb', rating: 5, cleanliness: null, text: 'Super' })
  assert.equal(mapGuestyReview({ channelId: 'airbnb', rawReview: { overall_rating: 5 } }), null)
  assert.equal(mapGuestyReview({ _id: 'x' }), null); assert.equal(mapGuestyReview(null), null)
})

test('zoznam z rôznych tvarov odpovede a stránkovanie s hranicou „od“', async () => {
  assert.equal(reviewList([1]).length, 1); assert.equal(reviewList({ results: [1, 2] }).length, 2); assert.equal(reviewList({ data: { reviews: [1] } }).length, 1); assert.equal(reviewList({}).length, 0)
  const mk = (id, d) => ({ _id: id, createdAt: d, rating: 5 })
  const pages = [[mk('1', '2026-11-18'), mk('2', '2026-11-10')], [mk('3', '2026-09-01'), mk('4', '2026-08-01')], [mk('5', '2026-07-01')]]
  const calls = []
  const get = async (path, q) => { calls.push(q.skip); return { results: pages[q.skip / 2] || [] } }
  const out = await fetchRecentReviews(get, { sinceIso: '2026-10-01', pageSize: 2 })
  assert.deepEqual(out.map((x) => x._id), ['1', '2']); assert.deepEqual(calls, [0, 2]) // druhá strana je už stará: zastaví sa
  assert.equal((await fetchRecentReviews(async () => ({}), { pageSize: 2 })).length, 0)
})
