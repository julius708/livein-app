// Upratovanie: načítanie dát a volanie databázových funkcií. Všetko beží s prihlásením používateľa (`s`), oprávnenia stráži databáza (RLS a kontroly vo funkciách).
import { addDays, weekStart, todayBa } from './cl-core.js'
import { demoData } from './cl-demo.js'

export const BUCKET = 'cleaning-photos'

/** Tabuľky upratovania ešte neexistujú (migrácia nebola nasadená) => ukážkový režim. */
export function isMissingTable(err) {
  if (!err) return false
  const m = `${err.code || ''} ${err.message || ''}`
  return /42P01|PGRST205|PGRST202|does not exist|schema cache|Could not find the (table|function)/i.test(m)
}

/** Slovenské hlášky k stavom z databázových funkcií. */
export const MSG = {
  bad_cleaner: 'Táto osoba nie je aktívna upratovačka.',
  bad_input: 'Údaje nie sú v poriadku.',
  bad_key: 'Neplatné nastavenie.',
  bad_parent: 'Odpoveď patrí k neexistujúcemu príspevku.',
  bad_range: 'Neplatné obdobie.',
  closed: 'Úloha je už uzavretá.',
  in_progress: 'Úlohu už upratuje iná upratovačka.',
  invalid: 'Skontroluj vyplnené údaje (meno, e-mail, telefón, adresa).',
  items_open: 'Nie je odfajknuté všetko. Dokonči body alebo napíš poznámku, prečo nie.',
  no_staff: 'Táto osoba nemá profil upratovačky.',
  no_user: 'Tento e-mail nie je medzi používateľmi appky.',
  photos_needed: 'Chýbajú fotky „po“. Pridaj ich a potom dokonči.',
  text_required: 'Napíš text.',
  too_many: 'Príliš veľa. Skús to neskôr.',
  unassigned: 'Úloha nemá priradenú upratovačku.',
  inactive: 'Tento používateľ je vypnutý. Zapni ho v Správe appky.',
  name_required: 'Pri novom členovi treba napísať meno.',
  invalid_token: 'Tento odkaz už nie je platný. Požiadaj manažérku o nový.',
  todo: 'Úloha ešte nezačala.',
  done: 'Úloha je už hotová.',
  cancelled: 'Úloha bola zrušená.',
}
export const msgFor = (r) => (r && r.status && MSG[r.status]) || (r && r.error) || 'Nepodarilo sa.'

/** Volanie funkcie v databáze; chyby oprávnenia a výpadky vrátia zrozumiteľnú správu namiesto výnimky. */
export async function rpc(s, fn, args) {
  const { data, error } = await s.rpc(fn, args)
  if (error) {
    if (isMissingTable(error)) return { ok: false, demo: true, error: 'Upratovanie ešte nie je spustené v databáze (ukážkový režim).' }
    if (error.code === '42501') return { ok: false, error: 'Na toto nemáš oprávnenie.' }
    console.error('upratovanie rpc', fn, error.code, error.message)
    return { ok: false, error: 'Nepodarilo sa uložiť. Skús to znova.' }
  }
  const r = data && typeof data === 'object' ? data : { ok: true, data }
  return r.ok === false ? { ...r, error: msgFor(r) } : r
}

/** Kto je prihlásený v upratovaní: manažérka (profil manager alebo admin), upratovačka (aktívny profil cleaner), alebo nikto. */
export async function clContext(v) {
  const email = v.user.email.toLowerCase()
  const { data, error } = await v.s.from('cl_staff').select('*').eq('email', email).maybeSingle()
  if (error && isMissingTable(error)) return { demo: true, staff: null, isManager: !!v.isAdmin, isCleaner: false }
  if (error) { console.error('upratovanie staff', error.code, error.message); return { demo: false, staff: null, isManager: !!v.isAdmin, isCleaner: false, error: true } }
  const staff = data && data.active ? { ...data, invite_token: undefined } : null
  return { demo: false, staff, isManager: !!v.isAdmin || (!!staff && staff.role === 'manager'), isCleaner: !!staff && staff.role === 'cleaner' }
}

async function sync(s, from, to) {
  const r = await rpc(s, 'cl_sync_tasks', { p_from: from, p_to: to })
  return r
}

const TASK_COLS = 'id, listing_id, listing_name, date, package_id, people, snapshot, pack_note, status, cleaner_email, assigned_by, assigned_at, auto_assigned, assign_reason, distance_km, started_at, finished_at, cleaner_note, pay_override_cents, problem_text, problem_at, manual'

/** Údaje pre manažérku: dva týždne od pondelka vybraného týždňa. */
export async function managerData(s, { date, today = todayBa() } = {}) {
  const from = weekStart(date || today)
  const to = addDays(from, 13)
  const syncRes = await sync(s, from, to)
  if (syncRes.demo) return demoData(today)
  const hist = addDays(from, -45)
  const [tasks, staff, flats, apps, posts, sets, photos, history] = await Promise.all([
    s.from('cl_tasks').select(TASK_COLS).gte('date', from).lte('date', to).order('date').order('listing_name'),
    s.from('cl_staff').select('*').order('name'),
    s.from('cl_flats').select('*'),
    s.from('cl_applications').select('id, name, email, phone, address, city, note, status, created_at').eq('status', 'new').order('created_at'),
    s.from('cl_posts').select('id, parent_id, author_email, author_name, text, pinned, created_at').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    s.from('cl_settings').select('key, value'),
    s.from('cl_photos').select('task_id').gte('created_at', from + 'T00:00:00Z').limit(5000),
    s.from('cl_tasks').select('listing_id, date, cleaner_email').gte('date', hist).lt('date', from).not('cleaner_email', 'is', null).limit(5000),
  ])
  const photoCount = {}
  for (const p of photos.data || []) photoCount[p.task_id] = (photoCount[p.task_id] || 0) + 1
  const settings = Object.fromEntries((sets.data || []).map((r) => [r.key, r.value]))
  return {
    demo: false,
    from, to,
    tasks: tasks.data || [],
    staff: (staff.data || []).map((x) => ({ ...x, invite_token: undefined, pending: !x.profile_done })),
    flats: Object.fromEntries((flats.data || []).map((f) => [f.listing_id, f])),
    applications: apps.data || [],
    posts: posts.data || [],
    settings,
    photoCount,
    history: history.data || [],
    sync: syncRes,
    errors: [tasks, staff, flats].map((x) => x.error).filter(Boolean).map((e) => e.message).concat(syncRes.ok === false && !syncRes.demo ? ['Synchronizácia s Práčovňou zlyhala: ' + (syncRes.error || 'neznáma chyba')] : []),
  }
}

/** Údaje pre upratovačku: jej úlohy na dva týždne, byty (len tie, ktoré jej patria), checklist, fotky, nástenka. */
export async function cleanerData(s, email, { today = todayBa() } = {}) {
  const from = addDays(today, -1)
  const to = addDays(from, 14)
  await sync(s, from, to)
  const tasksQ = await s.from('cl_tasks').select(TASK_COLS).eq('cleaner_email', email).gte('date', from).lte('date', to).neq('status', 'cancelled').order('date').order('listing_name')
  const tasks = tasksQ.data || []
  const ids = tasks.map((t) => t.id)
  const [flats, items, photos, posts, sets, me] = await Promise.all([
    s.from('cl_flats').select('listing_id, listing_name, address, city, lat, lng, access_note, extra_checklist, est_minutes'),
    ids.length ? s.from('cl_checklist_items').select('id, task_id, sort, label, done, done_at').in('task_id', ids).order('sort') : { data: [] },
    ids.length ? s.from('cl_photos').select('id, task_id, kind, path, note, created_at').in('task_id', ids).order('created_at') : { data: [] },
    s.from('cl_posts').select('id, parent_id, author_email, author_name, text, pinned, created_at').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100),
    s.from('cl_settings').select('key, value'),
    s.from('cl_staff').select('*').eq('email', email).maybeSingle(),
  ])
  return {
    demo: false,
    from, to,
    tasks,
    flats: Object.fromEntries((flats.data || []).map((f) => [f.listing_id, f])),
    items: items.data || [],
    photos: await withUrls(s, photos.data || []),
    posts: posts.data || [],
    settings: Object.fromEntries((sets.data || []).map((r) => [r.key, r.value])),
    me: me.data || null,
  }
}

/** Fotky s časovo obmedzeným odkazom na zobrazenie (súkromné úložisko). */
export async function withUrls(s, photos) {
  if (!photos.length) return []
  const { data } = await s.storage.from(BUCKET).createSignedUrls(photos.map((p) => p.path), 3600)
  const by = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]))
  return photos.map((p) => ({ ...p, url: by[p.path] || null }))
}

/** Fotky a priebeh jednej úlohy pre manažérku (kontrola). */
export async function taskDetail(s, id) {
  const [items, photos, events] = await Promise.all([
    s.from('cl_checklist_items').select('id, sort, label, done, done_at').eq('task_id', id).order('sort'),
    s.from('cl_photos').select('id, kind, path, note, taken_by, created_at').eq('task_id', id).order('created_at'),
    s.from('cl_events').select('at, actor, event, data').eq('task_id', id).order('at'),
  ])
  return { items: items.data || [], photos: await withUrls(s, photos.data || []), events: events.data || [] }
}
