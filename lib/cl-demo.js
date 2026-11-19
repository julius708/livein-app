// Upratovanie: ukážkové dáta. Zobrazia sa, kým databáza nemá tabuľky upratovania (migrácia ešte nebola nasadená).
// Všetko je označené ako ukážka: vymyslené mená a byty, žiadne reálne osoby ani adresy.
import { addDays, weekStart } from './cl-core.js'

const C = (dlat, dlng) => ({ lat: Math.round((48.145 + dlat) * 1e6) / 1e6, lng: Math.round((17.107 + dlng) * 1e6) / 1e6 })

export const DEMO_STAFF = [
  { email: 'manazerka@ukazka.invalid', name: 'Manažérka (ukážka)', role: 'manager', active: true, max_per_day: 4, max_per_week: 0, max_distance_km: 0, work_days: [1, 2, 3, 4, 5], days_off: [], preferred_localities: [], excluded_listings: [], instructions: '', pay_type: 'per_task', hourly_rate_cents: 0, task_rate_cents: 0, phone: '', address: '', city: 'Bratislava', ...C(0, 0), geo_source: 'manual' },
  { email: 'ukazka-a@ukazka.invalid', name: 'Upratovačka A (ukážka)', role: 'cleaner', active: true, max_per_day: 2, max_per_week: 8, max_distance_km: 12, work_days: [1, 2, 3, 4, 5], days_off: [], preferred_localities: ['Petržalka'], excluded_listings: [], instructions: 'Len doobeda. Nezvláda byty bez výťahu.', pay_type: 'hourly', hourly_rate_cents: 800, task_rate_cents: 0, phone: '0900 000 001', address: 'Ukážková ulica 1', city: 'Bratislava - Petržalka', ...C(-0.025, -0.01), geo_source: 'manual' },
  { email: 'ukazka-b@ukazka.invalid', name: 'Upratovačka B (ukážka)', role: 'cleaner', active: true, max_per_day: 4, max_per_week: 0, max_distance_km: 0, work_days: [1, 2, 3, 4, 5, 6, 7], days_off: [], preferred_localities: ['Staré Mesto'], excluded_listings: [], instructions: 'Zvláda aj štyri byty za deň. Vie robiť aj víkendy.', pay_type: 'per_task', hourly_rate_cents: 0, task_rate_cents: 3000, phone: '0900 000 002', address: 'Ukážkové námestie 2', city: 'Bratislava - Staré Mesto', ...C(0.003, 0.004), geo_source: 'manual' },
  { email: 'ukazka-c@ukazka.invalid', name: 'Upratovačka C (ukážka)', role: 'cleaner', active: true, max_per_day: 3, max_per_week: 12, max_distance_km: 20, work_days: [1, 2, 3, 4, 5, 6], days_off: [], preferred_localities: [], excluded_listings: [], instructions: '', pay_type: 'per_task', hourly_rate_cents: 0, task_rate_cents: 2800, phone: '0900 000 003', address: 'Ukážková cesta 3', city: 'Bratislava - Ružinov', ...C(0.012, 0.05), geo_source: 'manual' },
]

export const DEMO_FLATS = {
  D1: { listing_id: 'D1', listing_name: 'Byt 1 (ukážka)', city: 'Bratislava - Staré Mesto', address: 'Ukážková 10', ...C(0.004, 0.003), access_note: 'Kód od vchodu 0000, kľúč v schránke vľavo (ukážka).', extra_checklist: ['Poliať kvety'], est_minutes: 90, pay_cents: null, active: true },
  D2: { listing_id: 'D2', listing_name: 'Byt 2 (ukážka)', city: 'Bratislava - Petržalka', address: 'Ukážková 20', ...C(-0.028, -0.012), access_note: 'Kľúč na recepcii, 3. poschodie, výťah (ukážka).', extra_checklist: [], est_minutes: 75, pay_cents: null, active: true },
  D3: { listing_id: 'D3', listing_name: 'Byt 3 (ukážka)', city: 'Bratislava - Ružinov', address: 'Ukážková 30', ...C(0.013, 0.055), access_note: '', extra_checklist: [], est_minutes: 100, pay_cents: 3500, active: true },
  D4: { listing_id: 'D4', listing_name: 'Byt 4 (ukážka)', city: 'Bratislava - Staré Mesto', address: 'Ukážková 40', ...C(0.006, 0.006), access_note: 'Zámok s kódom 1111 (ukážka).', extra_checklist: ['Skontrolovať balkón'], est_minutes: 80, pay_cents: null, active: true },
  D5: { listing_id: 'D5', listing_name: 'Byt 5 (ukážka)', city: 'Bratislava - Petržalka', address: 'Ukážková 50', ...C(-0.022, -0.006), access_note: '', extra_checklist: [], est_minutes: 90, pay_cents: null, active: true },
  D6: { listing_id: 'D6', listing_name: 'Byt 6 (ukážka)', city: 'Bratislava - Nové Mesto', address: 'Ukážková 60', ...C(0.03, 0.01), access_note: '', extra_checklist: [], est_minutes: 90, pay_cents: null, active: true },
}

/** Úlohy na týždeň okolo `today`; niektoré sú už priradené, jedna hotová a jedna s problémom, aby obrazovky ukázali všetky stavy. */
export function demoTasks(today) {
  const w = weekStart(today)
  const mk = (id, flat, off, extra = {}) => ({
    id: 'demo-' + id, listing_id: flat, listing_name: DEMO_FLATS[flat].listing_name, date: addDays(w, off), package_id: null, people: 2 + (off % 3), snapshot: { capsules: [{ type: 'Nespresso Original', n: 2 }, { type: 'Dolce Gusto', n: 1 }], checklist: ['Bielizeň podľa karty z Práčovne'] },
    pack_note: off === 1 ? 'Hostia prídu skôr, dokončiť do 13:00 (ukážka).' : null, status: 'todo', cleaner_email: null, assigned_by: null, assigned_at: null, auto_assigned: false, assign_reason: null, distance_km: null,
    started_at: null, finished_at: null, cleaner_note: null, pay_override_cents: null, problem_text: null, problem_at: null, ...extra,
  })
  return [
    mk(1, 'D1', 0, { status: 'done', cleaner_email: 'ukazka-b@ukazka.invalid', distance_km: 0.6, assign_reason: 'najbližšie, 0,6 km od bydliska', auto_assigned: true, started_at: addDays(w, 0) + 'T08:10:00Z', finished_at: addDays(w, 0) + 'T09:55:00Z', cleaner_note: 'Všetko v poriadku (ukážka).' }),
    mk(2, 'D2', 0, { status: 'done', cleaner_email: 'ukazka-a@ukazka.invalid', distance_km: 0.9, problem_text: 'Pokazený fén v kúpeľni (ukážka).', problem_at: addDays(w, 0) + 'T10:00:00Z', started_at: addDays(w, 0) + 'T09:00:00Z', finished_at: addDays(w, 0) + 'T10:15:00Z' }),
    mk(3, 'D4', 1, { status: 'in_progress', cleaner_email: 'ukazka-b@ukazka.invalid', distance_km: 0.4, started_at: addDays(w, 1) + 'T08:00:00Z' }),
    mk(4, 'D3', 1, { cleaner_email: 'ukazka-c@ukazka.invalid', distance_km: 1.1, auto_assigned: true, assign_reason: 'najbližšie, 1,1 km od bydliska' }),
    mk(5, 'D5', 2),
    mk(6, 'D1', 2),
    mk(7, 'D6', 3),
    mk(8, 'D2', 3),
    mk(9, 'D4', 4),
    mk(10, 'D3', 5),
    mk(11, 'D5', 6),
  ]
}

export function demoPosts(today) {
  return [
    { id: 'demo-p1', parent_id: null, author_email: DEMO_STAFF[0].email, author_name: 'Manažérka (ukážka)', text: 'Od pondelka berieme čisté uteráky len z Práčovne, nie z komory (ukážka).', pinned: true, created_at: addDays(today, -2) + 'T09:00:00Z' },
    { id: 'demo-p2', parent_id: 'demo-p1', author_email: DEMO_STAFF[1].email, author_name: 'Upratovačka A (ukážka)', text: 'Rozumiem, ďakujem (ukážka).', pinned: false, created_at: addDays(today, -2) + 'T10:30:00Z' },
  ]
}

export function demoData(today) {
  return {
    demo: true,
    tasks: demoTasks(today),
    staff: DEMO_STAFF,
    flats: DEMO_FLATS,
    applications: [{ id: 'demo-app1', name: 'Uchádzačka (ukážka)', email: 'uchadzacka@ukazka.invalid', phone: '0900 000 009', address: 'Ukážková 9', city: 'Bratislava', note: 'Mám skúsenosti s upratovaním apartmánov (ukážka).', status: 'new', created_at: addDays(today, -1) + 'T12:00:00Z' }],
    posts: demoPosts(today),
    settings: { checklist: ['Vyvetrať a otvoriť okná', 'Vyniesť odpadky', 'Vysávať a umyť podlahy', 'Kuchyňa', 'Kúpeľňa', 'Postele a uteráky', 'Kapsule do kávovaru', 'Zamknúť'], rules: { min_after_photos: 0 } },
    entry: Object.fromEntries(Object.keys(DEMO_FLATS).map((id) => [id, { arrival: 'Vstup ako pre hosťa podľa Sprievodcu bytom: kód od vchodu a kľúč v schránke (ukážka).', parking: id === 'D2' ? 'Parkovanie vo dvore (ukážka).' : null, note: null }])),
    photoCount: {},
    history: [],
  }
}
