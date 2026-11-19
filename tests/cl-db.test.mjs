// Migrácia 20261119_upratovanie.sql na PGlite: oprávnenia, RLS, tok úlohy a verejná prihláška.
// Beží len tam, kde je PGlite (lokálne z Práčovne); inde sa test preskočí.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const PG = '/home/user/pracovna/node_modules/@electric-sql/pglite/dist/index.js'
const have = existsSync(PG)
const MIG = readFileSync(new URL('../supabase/migrations/20261119_upratovanie.sql', import.meta.url), 'utf8')
const MIG2 = readFileSync(new URL('../supabase/migrations/20261120_upratovanie_ulohy_report.sql', import.meta.url), 'utf8')
const MIG5 = readFileSync(new URL('../supabase/migrations/20261123_upratovanie_kvalita.sql', import.meta.url), 'utf8')
const MIG4 = readFileSync(new URL('../supabase/migrations/20261122_upratovanie_vstup.sql', import.meta.url), 'utf8')
const MIG3 = readFileSync(new URL('../supabase/migrations/20261121_upratovanie_pozvanky.sql', import.meta.url), 'utf8')

const STUBS = `
create role authenticated nologin; create role anon nologin; create role service_role nologin;
create schema auth; create schema extensions;
grant usage on schema public to anon, authenticated;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change text, email_change_token_new text, is_sso_user boolean);
create table auth.identities (id uuid, user_id uuid, provider_id text, provider text, identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function extensions.crypt(a text, b text) returns text language sql as 'select md5(a || b)';
create function extensions.gen_salt(a text) returns text language sql as $$ select 'salt' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table public.app_users (email text primary key, name text not null, roles text[] not null default '{}', active boolean not null default true);
create table public.config (key text primary key, value jsonb);
create function public.is_app_admin() returns boolean language sql stable security definer as $$ select exists (select 1 from public.app_users where lower(email) = lower(auth.jwt() ->> 'email') and active and 'admin' = any(roles)) $$;
create function public.has_app_role(r text) returns boolean language sql stable security definer as $$ select exists (select 1 from public.app_users where lower(email) = lower(auth.jwt() ->> 'email') and active and r = any(roles)) $$;
create function public.is_active_user() returns boolean language sql stable security definer as $$ select exists (select 1 from public.app_users where lower(email) = lower(auth.jwt() ->> 'email') and active) $$;
create table public.listings (guesty_id text primary key, name text, city text, in_scope boolean default true);
create table public.guide_units (listing_id text primary key, address text, city text);
create table public.reservations (guesty_id text primary key, listing_id text, status text, check_in_date date, check_out_date date, guests int, confirmation_code text, source text);
create table public.guide_cards (listing_id text primary key, address text, lat numeric, lng numeric, arrival jsonb, parking jsonb, address_note jsonb);
create table public.packages (id uuid primary key default gen_random_uuid(), listing_id text not null, listing_name text not null, date date not null, target_people int, computed_items jsonb not null default '{}', note text not null default '', status text not null default 'todo', hidden boolean not null default false, updated_at timestamptz not null default now());
alter default privileges in schema public grant all on tables to anon, authenticated;
`

let db
const rows = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await rows(sql, params))[0]
const as = async (email) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims', $1, false)", [email ? JSON.stringify({ email }) : '']); if (email) await db.exec('set role authenticated') }
const rpc = async (email, fn, ...args) => { await as(email); try { const r = await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args); return r.r } finally { await as(null) } }
const fails = async (p) => { try { await p } catch (e) { return e.code || e.message } return null }
const TODAY = '2026-11-20'

before(async () => {
  if (!have) return
  const { PGlite } = await import(PG)
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec('set check_function_bodies = off')
  await db.exec(MIG)
  await db.exec(MIG2)
  await db.exec(MIG3)
  await db.exec(MIG4)
  await db.exec(MIG5)
  await db.exec('set check_function_bodies = on')
  await db.exec(`
    insert into public.app_users (email, name, roles) values ('admin@x.sk','Admin',array['admin']), ('boss@x.sk','Šéfka',array['cleaning']), ('a@x.sk','Anna',array['cleaning']), ('b@x.sk','Beáta',array['cleaning']), ('c@x.sk','Cecília',array['cleaning']), ('staff@x.sk','Personál',array['operations']);
    insert into public.cl_staff (email, name, role, phone, address, lat, lng) values ('boss@x.sk','Šéfka','manager','0900',null,null,null), ('a@x.sk','Anna','cleaner','0901','Petržalka 1',48.10,17.11), ('b@x.sk','Beáta','cleaner','0902','Ružinov 2',48.15,17.17);
    insert into public.listings (guesty_id, name, city) values ('L1','Byt Jedna','Bratislava'), ('L2','Byt Dva','Bratislava'), ('L3','Byt Tri','Bratislava');
    insert into public.guide_units values ('L1','Hlavná 1','Bratislava'), ('L2','Druhá 2','Bratislava');
    insert into public.guide_cards values ('L1','Hlavná 1',48.14,17.10), ('L2','Druhá 2',48.15,17.12);
    insert into public.config values ('auth', '{"default_password":"tajne"}');
  `)
})
after(async () => { await db?.close() })

const pkg = async (listing, date, extra = {}) => (await one(`insert into public.packages (listing_id, listing_name, date, target_people, computed_items, note, status, hidden) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) returning id`,
  [listing, `Byt ${listing}`, date, extra.people ?? 2, JSON.stringify(extra.items ?? { people: extra.people ?? 2, capsules: [{ type: 'Nespresso Original', n: 2 }], checklist: ['Skontrolovať balkón'] }), extra.note ?? '', extra.status ?? 'todo', extra.hidden ?? false])).id

test('migrácia sa aplikuje a tabuľky majú zapnuté RLS', { skip: !have }, async () => {
  const t = await rows("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relname like 'cl\\_%' and relkind = 'r' and not relrowsecurity")
  assert.deepEqual(t, [])
})

test('synchronizácia: vytvorí úlohy a byty, je idempotentná, rušenie a oprávnenia', { skip: !have }, async () => {
  const p1 = await pkg('L1', TODAY, { note: 'doniesť kľúč' })
  await pkg('L2', TODAY)
  await pkg('L3', TODAY, { status: 'cancelled' })
  await pkg('L3', '2026-11-21', { hidden: true })
  assert.ok((await fails(rpc('staff@x.sk', 'cl_sync_tasks', TODAY, TODAY)))) // personál bez profilu upratovania nesmie
  const r = await rpc('boss@x.sk', 'cl_sync_tasks', TODAY, '2026-11-22')
  assert.deepEqual({ ok: r.ok, new: r.new }, { ok: true, new: 2 })
  assert.equal((await one("select count(*)::int as n from public.cl_tasks")).n, 2)
  const flat = await one("select address, lat from public.cl_flats where listing_id = 'L1'")
  assert.equal(flat.address, 'Hlavná 1'); assert.equal(Number(flat.lat), 48.14)
  const again = await rpc('a@x.sk', 'cl_sync_tasks', TODAY, '2026-11-22') // upratovačka smie spustiť synchronizáciu (idempotentne)
  assert.equal(again.new, 0)
  const task = await one("select people, pack_note, snapshot from public.cl_tasks where listing_id = 'L1'")
  assert.equal(task.people, 2); assert.equal(task.pack_note, 'doniesť kľúč'); assert.equal(task.snapshot.capsules[0].n, 2)
  // zmena v Práčovni sa premietne do nezačatej úlohy
  await db.query('update public.packages set target_people = 4 where id = $1', [p1])
  await rpc('boss@x.sk', 'cl_sync_tasks', TODAY, '2026-11-22')
  assert.equal((await one("select people from public.cl_tasks where listing_id = 'L1'")).people, 4)
  assert.equal((await rpc('boss@x.sk', 'cl_sync_tasks', TODAY, '2027-06-01')).status, 'bad_range')
  // balík zmizol: nezačatá úloha sa zruší
  await db.query("update public.packages set status = 'cancelled' where listing_id = 'L2'")
  const c = await rpc('boss@x.sk', 'cl_sync_tasks', TODAY, '2026-11-22')
  assert.equal(c.cancelled, 1)
})

test('priradenie, viditeľnosť (RLS) a oprávnenia', { skip: !have }, async () => {
  const t = (await one("select id from public.cl_tasks where listing_id = 'L1'")).id
  assert.ok(await fails(rpc('a@x.sk', 'cl_assign', t, 'a@x.sk', 'x', 1, false))) // upratovačka sa sama nepriradí
  assert.equal((await rpc('boss@x.sk', 'cl_assign', t, 'c@x.sk', null, null, false)).status, 'bad_cleaner') // nie je upratovačka
  assert.equal((await rpc('boss@x.sk', 'cl_assign', t, 'a@x.sk', 'najbližšie, 3,1 km', 3.1, true)).ok, true)
  const seen = async (email, sql) => { await as(email); const r = await rows(sql); await as(null); return r }
  assert.equal((await seen('a@x.sk', 'select id from public.cl_tasks')).length, 1)
  assert.equal((await seen('b@x.sk', 'select id from public.cl_tasks')).length, 0)
  assert.equal((await seen('boss@x.sk', 'select id from public.cl_tasks')).length, 2) // L1 + zrušená L2
  assert.equal((await seen('staff@x.sk', 'select id from public.cl_tasks')).length, 0)
  // byt vidí len priradená upratovačka
  await rpc('boss@x.sk', 'cl_save_flat', { listing_id: 'L1', access_note: 'Kód 1234, schránka vľavo', est_minutes: 120, extra_checklist: ['Poliať kvety'] })
  assert.equal((await seen('a@x.sk', 'select access_note from public.cl_flats')).length, 1)
  assert.equal((await seen('b@x.sk', 'select access_note from public.cl_flats')).length, 0)
  assert.ok(await fails(rpc('a@x.sk', 'cl_save_flat', { listing_id: 'L1', access_note: 'hack' })))
  const ev = await one("select data from public.cl_events where event = 'assigned' order by id desc limit 1")
  assert.equal(ev.data.auto, true); assert.equal(ev.data.km, 3.1)
  // hromadné priradenie
  const t2 = await pkg('L3', '2026-11-22'); await rpc('boss@x.sk', 'cl_sync_tasks', TODAY, '2026-11-22')
  const t2id = (await one("select id from public.cl_tasks where listing_id = 'L3' and date = '2026-11-22'")).id
  const bulk = await rpc('boss@x.sk', 'cl_assign_bulk', JSON.stringify([{ task_id: t2id, email: 'b@x.sk', reason: 'rotácia', km: 5 }, { task_id: t2id, email: 'nikto@x.sk' }]))
  assert.deepEqual({ a: bulk.assigned, s: bulk.skipped }, { a: 1, s: 1 })
  assert.ok(t2)
})

test('tok úlohy: štart, checklist, fotky, dokončenie, problém, znovuotvorenie, stav pre Práčovňu', { skip: !have }, async () => {
  const t = (await one("select id from public.cl_tasks where listing_id = 'L1'")).id
  assert.ok(await fails(rpc('b@x.sk', 'cl_start_task', t))) // cudzia úloha
  assert.equal((await rpc('a@x.sk', 'cl_start_task', t)).ok, true)
  assert.equal((await rpc('a@x.sk', 'cl_start_task', t)).replayed, true)
  const items = await rows('select id, label, done from public.cl_checklist_items where task_id = $1 order by sort', [t])
  assert.ok(items.length >= 13) // 11 spoločných + 1 byt + 1 z karty
  assert.ok(items.some((i) => i.label === 'Poliať kvety') && items.some((i) => i.label === 'Skontrolovať balkón'))
  // nedokončený checklist bez poznámky nejde
  assert.equal((await rpc('a@x.sk', 'cl_finish_task', t, null)).status, 'items_open')
  for (const i of items.slice(0, -1)) assert.equal((await rpc('a@x.sk', 'cl_toggle_item', i.id, true)).ok, true)
  assert.ok(await fails(rpc('b@x.sk', 'cl_toggle_item', items[0].id, false)))
  // fotky: správna cesta, druh, limity
  assert.equal((await rpc('a@x.sk', 'cl_add_photo', t, 'before', `${t}/a.jpg`, 'škrabanec')).ok, true)
  assert.equal((await rpc('a@x.sk', 'cl_add_photo', t, 'before', 'inde/a.jpg', null)).status, 'bad_input')
  assert.equal((await rpc('a@x.sk', 'cl_add_photo', t, 'zle', `${t}/b.jpg`, null)).status, 'bad_input')
  // pravidlo: aspoň 1 fotka "po"
  await rpc('boss@x.sk', 'cl_save_setting', 'rules', { min_after_photos: 1 })
  assert.equal((await rpc('a@x.sk', 'cl_finish_task', t, 'balkón zatvorený, kľúč vrátený')).status, 'photos_needed')
  await rpc('a@x.sk', 'cl_add_photo', t, 'after', `${t}/c.jpg`, null)
  await rpc('a@x.sk', 'cl_report_problem', t, 'Chýba jedna uterák')
  assert.equal((await rpc('a@x.sk', 'cl_finish_task', t, 'jedna položka nesplnená: balkón')).ok, true)
  assert.equal((await rpc('a@x.sk', 'cl_finish_task', t, null)).replayed, true)
  const done = await one('select status, finished_at is not null as f, problem_text from public.cl_tasks where id = $1', [t])
  assert.deepEqual({ s: done.status, f: done.f, p: done.problem_text }, { s: 'done', f: true, p: 'Chýba jedna uterák' })
  // po dokončení sa úloha už nepriradí inému
  assert.equal((await rpc('boss@x.sk', 'cl_assign', t, 'b@x.sk', null, null, false)).status, 'closed')
  // Práčovňa vidí stav (aktívny používateľ), vrátane mena a problému
  const st = await rpc('staff@x.sk', 'cl_status_for', TODAY, TODAY)
  assert.ok(st) // funkcia vracia riadky, nie jsonb; skontrolujeme priamo
  await as('staff@x.sk'); const sr = await rows('select * from public.cl_status_for($1, $2)', [TODAY, TODAY]); await as(null)
  const row = sr.find((r) => r.listing_id === 'L1')
  assert.deepEqual({ s: row.status, n: row.cleaner_name, p: row.has_problem }, { s: 'done', n: 'Anna', p: true })
  // znovuotvorenie len manažérka
  assert.ok(await fails(rpc('a@x.sk', 'cl_reopen', t, 'x')))
  assert.equal((await rpc('boss@x.sk', 'cl_reopen', t, 'nedoupratané')).ok, true)
  assert.equal((await one('select status from public.cl_tasks where id = $1', [t])).status, 'in_progress')
  // mimo systému nikto nevidí fotky ani checklist
  await as('b@x.sk'); assert.equal((await rows('select id from public.cl_photos')).length, 0); assert.equal((await rows('select id from public.cl_checklist_items')).length, 0); await as(null)
})

test('správa upratovačiek: limity, inštrukcie, lokality, voľné dni; vlastný profil', { skip: !have }, async () => {
  const r = await rpc('boss@x.sk', 'cl_save_staff', { email: 'a@x.sk', max_per_day: 2, max_per_week: 8, max_distance_km: 15, instructions: 'Len doobeda, bez 4. poschodia', preferred_localities: ['Petržalka', 'Ružinov'], excluded_listings: ['L9'], days_off: ['2026-12-24'], work_days: [1, 2, 3, 4, 5] })
  assert.equal(r.ok, true)
  const a = await one("select max_per_day, max_per_week, max_distance_km, instructions, preferred_localities, excluded_listings, days_off::text[] as off, work_days from public.cl_staff where email = 'a@x.sk'")
  assert.deepEqual({ d: a.max_per_day, w: a.max_per_week, km: a.max_distance_km, i: a.instructions, p: a.preferred_localities, x: a.excluded_listings, off: a.off, wd: a.work_days },
    { d: 2, w: 8, km: 15, i: 'Len doobeda, bez 4. poschodia', p: ['Petržalka', 'Ružinov'], x: ['L9'], off: ['2026-12-24'], wd: [1, 2, 3, 4, 5] })
  // čiastočná zmena nemaže ostatné polia
  await rpc('boss@x.sk', 'cl_save_staff', { email: 'a@x.sk', max_per_day: 3 })
  assert.equal((await one("select instructions from public.cl_staff where email = 'a@x.sk'")).instructions, 'Len doobeda, bez 4. poschodia')
  assert.ok(await fails(rpc('a@x.sk', 'cl_save_staff', { email: 'a@x.sk', max_per_day: 12 }))) // limit si nezmení sama
  assert.equal((await rpc('boss@x.sk', 'cl_save_staff', { email: 'nikto@x.sk' })).status, 'no_user')
  await as('a@x.sk'); assert.equal(await fails(db.query("update public.cl_staff set max_per_day = 12 where email = 'a@x.sk'")), '42501'); await as(null) // priamy zápis do tabuľky je zakázaný
  // vlastný profil: adresa, telefón, dovolenka; cudzí riadok nie
  // upratovačka vyplní LEN osobné údaje; limity, dni, lokality, inštrukcie a ceny cez vlastný profil nezmení ani keď ich pošle
  await rpc('a@x.sk', 'cl_save_my_profile', { address: 'Nová 5', phone: '0911', lat: 48.12, lng: 17.09, geo_source: 'geocoded', days_off: ['2026-12-01', '2026-12-02'], work_days: [1], max_per_day: 12, max_per_week: 60, max_distance_km: 200, instructions: 'hack', pay_type: 'hourly', hourly_rate_cents: 99999, task_rate_cents: 99999, role: 'manager', active: false, excluded_listings: ['L1'], preferred_localities: ['x'] })
  const mine = await one("select address, phone, lat, geo_source, days_off::text[] as off, work_days, max_per_day, max_per_week, max_distance_km, instructions, pay_type, hourly_rate_cents, task_rate_cents, role, active, excluded_listings, preferred_localities from public.cl_staff where email = 'a@x.sk'")
  assert.deepEqual({ a: mine.address, p: mine.phone, g: mine.geo_source }, { a: 'Nová 5', p: '0911', g: 'geocoded' })
  assert.deepEqual({ off: mine.off, wd: mine.work_days, d: mine.max_per_day, w: mine.max_per_week, km: mine.max_distance_km, i: mine.instructions, r: mine.role, act: mine.active, x: mine.excluded_listings, pl: mine.preferred_localities }, { off: ['2026-12-24'], wd: [1, 2, 3, 4, 5], d: 3, w: 8, km: 15, i: 'Len doobeda, bez 4. poschodia', r: 'cleaner', act: true, x: ['L9'], pl: ['Petržalka', 'Ružinov'] })
  assert.notEqual(mine.pay_type === 'hourly' && mine.hourly_rate_cents === 99999, true) // sadzbu si nenastaví
  assert.ok(await fails(rpc('staff@x.sk', 'cl_save_my_profile', { address: 'x' })))
  // upratovačka vidí svoje inštrukcie, kolegyňa nie
  await as('a@x.sk'); assert.equal((await rows('select instructions from public.cl_staff')).length, 1); await as(null)
  await as('b@x.sk'); assert.equal((await rows("select instructions from public.cl_staff where email = 'a@x.sk'")).length, 0); await as(null)
})

test('cena práce: za hodinu / za upratovanie, cena bytu, ručná oprava; len manažérka', { skip: !have }, async () => {
  const r0 = await one("select pay_type, hourly_rate_cents, task_rate_cents from public.cl_staff where email = 'b@x.sk'")
  assert.deepEqual({ t: r0.pay_type, h: r0.hourly_rate_cents, k: r0.task_rate_cents }, { t: 'per_task', h: 0, k: 0 }) // predvolene nič nie je nastavené
  assert.equal((await rpc('boss@x.sk', 'cl_save_staff', { email: 'b@x.sk', pay_type: 'hourly', hourly_rate_cents: 850, task_rate_cents: 3000 })).ok, true)
  const b = await one("select pay_type, hourly_rate_cents, task_rate_cents, max_per_day from public.cl_staff where email = 'b@x.sk'")
  assert.deepEqual({ t: b.pay_type, h: b.hourly_rate_cents, k: b.task_rate_cents }, { t: 'hourly', h: 850, k: 3000 })
  await rpc('boss@x.sk', 'cl_save_staff', { email: 'b@x.sk', max_per_day: 2 }) // čiastočná zmena nemaže sadzby
  assert.equal((await one("select hourly_rate_cents from public.cl_staff where email = 'b@x.sk'")).hourly_rate_cents, 850)
  assert.ok(await fails(rpc('boss@x.sk', 'cl_save_staff', { email: 'b@x.sk', pay_type: 'zadarmo' }))) // neplatný typ
  assert.ok(await fails(rpc('boss@x.sk', 'cl_save_staff', { email: 'b@x.sk', hourly_rate_cents: -5 })))
  assert.ok(await fails(rpc('b@x.sk', 'cl_save_staff', { email: 'b@x.sk', hourly_rate_cents: 99999 }))) // sadzbu si sama nezmení
  assert.equal((await rpc('boss@x.sk', 'cl_save_flat', { listing_id: 'L2', pay_cents: 4500 })).ok, true)
  assert.equal((await one("select pay_cents from public.cl_flats where listing_id = 'L2'")).pay_cents, 4500)
  await rpc('boss@x.sk', 'cl_save_flat', { listing_id: 'L2', pay_cents: null }) // vyprázdnenie = späť na sadzbu upratovačky
  assert.equal((await one("select pay_cents from public.cl_flats where listing_id = 'L2'")).pay_cents, null)
  const t = (await one("select id from public.cl_tasks where listing_id = 'L1'")).id
  assert.equal((await rpc('boss@x.sk', 'cl_set_task_pay', t, 5200)).ok, true)
  assert.equal((await one('select pay_override_cents from public.cl_tasks where id = $1', [t])).pay_override_cents, 5200)
  assert.ok(await fails(rpc('a@x.sk', 'cl_set_task_pay', t, 99999))) // upratovačka si sumu nezmení
  assert.equal((await rpc('boss@x.sk', 'cl_set_task_pay', t, null)).ok, true)
  // sadzbu kolegyne upratovačka nevidí
  await as('a@x.sk'); assert.equal((await rows("select hourly_rate_cents from public.cl_staff where email = 'b@x.sk'")).length, 0); await as(null)
})

test('ručná úloha, zrušenie, report a nastavenie príjemcov', { skip: !have }, async () => {
  await db.query("insert into public.app_users (email, name, roles) values ('bot@x.sk','Bot',array['bot']) on conflict do nothing")
  const ok = await rpc('boss@x.sk', 'cl_add_task', null, 'Kancelária', '2026-11-25', 'generálka')
  assert.equal(ok.ok, true)
  const t = await one("select listing_id, manual, status, package_id from public.cl_tasks where id = $1", [ok.id])
  assert.deepEqual({ m: t.manual, s: t.status, p: t.package_id, lid: t.listing_id.startsWith('manual:') }, { m: true, s: 'todo', p: null, lid: true })
  // ručná úloha na byt z evidencie preberie jeho názov; duplicita (byt + deň) sa odmietne
  const f = await rpc('boss@x.sk', 'cl_add_task', 'L3', null, '2026-11-26', null)
  assert.equal(f.ok, true)
  assert.equal((await one('select listing_name from public.cl_tasks where id = $1', [f.id])).listing_name, 'Byt Tri')
  assert.equal((await rpc('boss@x.sk', 'cl_add_task', 'L3', null, '2026-11-26', null)).status, 'exists')
  assert.equal((await rpc('boss@x.sk', 'cl_add_task', null, null, '2026-11-26', null)).status, 'bad_input') // bez názvu
  assert.equal((await rpc('boss@x.sk', 'cl_add_task', null, 'X', '2020-01-01', null)).status, 'bad_input') // príliš stará
  assert.ok(await fails(rpc('a@x.sk', 'cl_add_task', null, 'X', '2026-11-25', null))) // upratovačka nepridá
  // synchronizácia ručnú úlohu nezruší (nemá balík), balíkovú bez balíka zruší
  await rpc('boss@x.sk', 'cl_sync_tasks', '2026-11-20', '2026-12-05')
  assert.equal((await one('select status from public.cl_tasks where id = $1', [ok.id])).status, 'todo')
  // zrušenie: len nezačatá; opakovanie je v poriadku
  assert.equal((await rpc('boss@x.sk', 'cl_cancel_task', ok.id, 'omyl')).ok, true)
  assert.equal((await rpc('boss@x.sk', 'cl_cancel_task', ok.id, 'omyl')).replayed, true)
  assert.ok(await fails(rpc('a@x.sk', 'cl_cancel_task', f.id, 'x')))
  const l1 = (await one("select id from public.cl_tasks where listing_id = 'L1'")).id
  assert.equal((await rpc('boss@x.sk', 'cl_cancel_task', l1, 'x')).status, 'in_progress' === (await one('select status from public.cl_tasks where id = $1', [l1])).status ? 'in_progress' : (await one('select status from public.cl_tasks where id = $1', [l1])).status)
  // nastavenia: príjemcovia reportu len manažérka
  assert.equal((await rpc('boss@x.sk', 'cl_save_setting', 'report', JSON.stringify({ recipients: ['a@b.sk'] }))).ok, true)
  assert.ok(await fails(rpc('a@x.sk', 'cl_save_setting', 'report', '{}')))
  // report: manažérka a bot áno, upratovačka nie
  const rep = await rpc('boss@x.sk', 'cl_report_data', '2026-11-01', '2026-11-30')
  assert.equal(rep.ok, true); assert.ok(rep.tasks.length >= 1); assert.ok(rep.staff.length >= 3); assert.deepEqual(rep.recipients, ['a@b.sk']); assert.equal(rep.sent, false)
  assert.ok(!rep.tasks.some((x) => 'snapshot' in x)) // karta z Práčovne sa do reportu nekopíruje
  assert.equal((await rpc('bot@x.sk', 'cl_report_data', '2026-11-01', '2026-11-30')).ok, true)
  assert.ok(await fails(rpc('a@x.sk', 'cl_report_data', '2026-11-01', '2026-11-30')))
  assert.equal((await rpc('boss@x.sk', 'cl_report_data', '2025-01-01', '2026-12-31')).status, 'bad_range')
  assert.equal((await rpc('bot@x.sk', 'cl_report_mark', '2026-11')).ok, true)
  assert.equal((await rpc('bot@x.sk', 'cl_report_data', '2026-11-01', '2026-11-30')).sent, true)
  assert.equal((await rpc('boss@x.sk', 'cl_report_mark', 'zle')).status, 'bad_input')
  assert.ok(await fails(rpc('a@x.sk', 'cl_report_mark', '2026-11')))
})

test('pozvánky: nový člen, existujúci používateľ, opätovné poslanie, vyplnenie údajov z odkazu', { skip: !have }, async () => {
  // nový člen: vznikne používateľ s rolou cleaning a profil čakajúci na údaje; token dostane len manažérka
  const inv = await rpc('boss@x.sk', 'cl_invite', 'Nová Upratovačka', 'Pozvana@X.sk', '0905 111 222')
  assert.equal(inv.status, 'invited'); assert.ok(inv.token)
  const u = await one("select roles, active from public.app_users where email = 'pozvana@x.sk'")
  assert.deepEqual({ r: u.roles, a: u.active }, { r: ['cleaning'], a: true })
  const st = await one("select role, profile_done, phone, address from public.cl_staff where email = 'pozvana@x.sk'")
  assert.deepEqual({ r: st.role, d: st.profile_done, p: st.phone, a: st.address }, { r: 'cleaner', d: false, p: '0905 111 222', a: null })
  // ešte pred vyplnením údajov jej manažérka môže priradiť byt (bez adresy ide podľa záťaže)
  const t = (await one("select id from public.cl_tasks where listing_id = 'L3' and date = '2026-11-22'")).id
  assert.equal((await rpc('boss@x.sk', 'cl_assign', t, 'pozvana@x.sk', 'ručne', null, false)).ok, true)
  // upratovačka pozvánku nevytvorí
  assert.ok(await fails(rpc('a@x.sk', 'cl_invite', 'X Y', 'iny@x.sk', null)))
  assert.equal((await rpc('boss@x.sk', 'cl_invite', null, 'bez-mena@x.sk', null)).status, 'name_required')
  assert.equal((await rpc('boss@x.sk', 'cl_invite', 'X', 'zly-email', null)).status, 'invalid')
  // existujúci používateľ appky sa len zaradí do tímu, jeho roly sa nemenia
  await db.query("insert into public.app_users (email, name, roles) values ('exist@x.sk','Existujúca',array['operations'])")
  const ex = await rpc('boss@x.sk', 'cl_invite', null, 'exist@x.sk', null)
  assert.equal(ex.status, 'existing'); assert.equal(ex.token, undefined)
  assert.deepEqual((await one("select roles from public.app_users where email = 'exist@x.sk'")).roles, ['operations'])
  assert.equal((await one("select role from public.cl_staff where email = 'exist@x.sk'")).role, 'cleaner')
  assert.equal((await rpc('boss@x.sk', 'cl_invite', null, 'exist@x.sk', null)).status, 'already')
  // vypnutý používateľ sa potichu nezapína
  await db.query("insert into public.app_users (email, name, roles, active) values ('off@x.sk','Off',array['cleaning'],false)")
  assert.equal((await rpc('boss@x.sk', 'cl_invite', null, 'off@x.sk', null)).status, 'inactive')
  // opätovné poslanie: nový token, starý prestane platiť
  const re = await rpc('boss@x.sk', 'cl_invite', null, 'pozvana@x.sk', null)
  assert.equal(re.status, 'reinvited'); assert.notEqual(re.token, inv.token)
  assert.equal((await db.query('select public.cl_invite_info($1) as r', [inv.token])).rows[0].r.ok, false)
  // verejné funkcie (anon): meno z platného odkazu
  await db.exec('reset role'); await db.exec('set role anon')
  const info = (await db.query('select public.cl_invite_info($1) as r', [re.token])).rows[0].r
  assert.deepEqual(info, { ok: true, name: 'Nová Upratovačka' })
  assert.equal((await db.query('select public.cl_invite_info($1) as r', ['00000000-0000-0000-0000-000000000000'])).rows[0].r.ok, false)
  const done = async (tok, ph, addr, hp = '') => (await db.query('select public.cl_complete_profile($1,$2,$3,$4,$5,$6,$7,$8) as r', [tok, ph, addr, 'Bratislava', 'rada robím ráno', 48.12, 17.09, hp])).rows[0].r
  assert.equal((await done(re.token, '12', 'Krátka 1')).status, 'invalid') // krátky telefón
  assert.equal((await done('00000000-0000-0000-0000-000000000000', '0905111222', 'Dlhá ulica 12')).status, 'invalid_token')
  assert.equal((await done(re.token, '0905111222', 'Dlhá ulica 12', 'robot')).ok, true) // robot: tvári sa, že prešlo, ale nič sa nezmení
  await db.exec('reset role')
  assert.equal((await one("select profile_done from public.cl_staff where email = 'pozvana@x.sk'")).profile_done, false)
  await db.exec('set role anon')
  assert.equal((await done(re.token, '0905111222', 'Dlhá ulica 12')).ok, true)
  assert.equal((await done(re.token, '0905111222', 'Dlhá ulica 12')).status, 'invalid_token') // odkaz je na jedno použitie
  assert.ok(await fails(db.query('select * from public.cl_staff'))) // anon tabuľky nečíta
  await db.exec('reset role')
  const fin = await one("select profile_done, invite_token, address, phone, lat, geo_source, note, max_per_day from public.cl_staff where email = 'pozvana@x.sk'")
  assert.deepEqual({ d: fin.profile_done, t: fin.invite_token, a: fin.address, p: fin.phone, g: fin.geo_source, n: fin.note, m: fin.max_per_day }, { d: true, t: null, a: 'Dlhá ulica 12', p: '0905111222', g: 'geocoded', n: 'Z formulára: rada robím ráno', m: 4 })
  assert.equal(Number(fin.lat), 48.12)
  // po vyplnení už pozvánka nejde znova, člen je „already“
  assert.equal((await rpc('boss@x.sk', 'cl_invite', null, 'pozvana@x.sk', null)).status, 'already')
})

test('vstup do bytu: text pre hosťa zo Sprievodcu vidí len priradená upratovačka a manažérka', { skip: !have }, async () => {
  await db.query(`update public.guide_cards set arrival = '{"sk":"Kód od vchodu 1234, schránka vľavo","en":"Door code 1234"}'::jsonb, parking = '{"sk":"Parkovanie vo dvore"}'::jsonb where listing_id = 'L1'`)
  await db.query(`update public.guide_cards set arrival = '{"en":"Only English text"}'::jsonb where listing_id = 'L2'`)
  // L1 má priradenú Annu (z testu priradenia), Beáta k L1 nemá nič
  const asA = await rpc('a@x.sk', 'cl_entry_info', ['L1', 'L2'])
  assert.equal(asA.ok, true)
  assert.deepEqual(Object.keys(asA.entry), ['L1']) // L2 jej nepatrí
  assert.deepEqual(asA.entry.L1, { arrival: 'Kód od vchodu 1234, schránka vľavo', parking: 'Parkovanie vo dvore', note: null })
  assert.deepEqual(Object.keys((await rpc('b@x.sk', 'cl_entry_info', ['L1'])).entry), []) // cudzí byt nie
  const asBoss = await rpc('boss@x.sk', 'cl_entry_info', ['L1', 'L2'])
  assert.equal(asBoss.entry.L2.arrival, 'Only English text') // bez slovenčiny padne na angličtinu
  assert.ok(await fails(rpc('staff@x.sk', 'cl_entry_info', ['L1']))) // iný používateľ appky nie
  assert.deepEqual((await rpc('boss@x.sk', 'cl_entry_info', [])).entry, {})
  // anon funkciu nespustí
  await db.exec('reset role'); await db.exec('set role anon')
  assert.ok(await fails(db.query("select public.cl_entry_info(array['L1'])")))
  await db.exec('reset role')
})

test('kvalita: recenzia sa páruje s rezerváciou a s upratovaním pred príchodom; report a oprávnenia', { skip: !have }, async () => {
  // L1: upratovanie 2026-11-22 (Anna, hotové v teste toku) a hosť, ktorý prichádza 22. 11.
  await db.query("insert into public.reservations values ('R1','L1','confirmed','2026-11-22','2026-11-25',2,'CODE1','airbnb'), ('R2','L3','confirmed','2026-12-10','2026-12-12',3,'CODE2','booking'), ('R3','L1','canceled','2026-11-23','2026-11-24',1,'CODE3','airbnb')")
  const t = (await one("select id from public.cl_tasks where listing_id = 'L1'")).id
  await db.query("update public.cl_tasks set status = 'done', started_at = '2026-11-22T08:00:00Z', finished_at = '2026-11-22T10:00:00Z' where id = $1", [t])
  const a = await rpc('boss@x.sk', 'cl_add_review', { reservation_code: 'CODE1', rating: 2, cleanliness: 1.5, source: 'airbnb', text: 'Špinavá kúpeľňa' })
  assert.equal(a.ok, true)
  assert.equal((await rpc('boss@x.sk', 'cl_add_review', { reservation_code: 'NEEXISTUJE', rating: 5 })).status, 'no_reservation')
  assert.equal((await rpc('boss@x.sk', 'cl_add_review', { reservation_code: 'CODE1', rating: 7 })).status, 'bad_input')
  assert.equal((await rpc('boss@x.sk', 'cl_add_review', { rating: 4 })).status, 'bad_input') // bez rezervácie treba byt a dátum
  assert.equal((await rpc('boss@x.sk', 'cl_add_review', { listing_id: 'L2', check_in: '2026-11-10', rating: 5, source: 'google' })).ok, true) // bez rezervácie v zozname
  assert.ok(await fails(rpc('a@x.sk', 'cl_add_review', { reservation_code: 'CODE1', rating: 5 })))
  const q = await rpc('boss@x.sk', 'cl_quality', '2026-11-01', '2026-12-31')
  assert.equal(q.ok, true)
  assert.equal(q.visits.length, 2) // zrušená rezervácia sa nepočíta
  const v1 = q.visits.find((v) => v.code === 'CODE1')
  assert.deepEqual({ flat: v1.flat, cleaner: v1.cleaning.cleaner, status: v1.cleaning.status, rev: v1.reviews.length, r: Number(v1.reviews[0].rating) }, { flat: 'Byt Jedna', cleaner: 'Anna', status: 'done', rev: 1, r: 2 })
  assert.ok(v1.cleaning.items_total >= 13 && v1.cleaning.photos_after >= 0)
  assert.equal(q.visits.find((v) => v.code === 'CODE2').cleaning?.task_id, undefined) // L3 má úlohu 22. 11., hosť prichádza 10. 12.: mimo okna 10 dní, čiže bez priradeného upratovania
  assert.equal(q.orphans.length, 1) // recenzia bez rezervácie
  assert.ok(await fails(rpc('a@x.sk', 'cl_quality', '2026-11-01', '2026-12-31')))
  assert.equal((await rpc('boss@x.sk', 'cl_quality', '2025-01-01', '2026-12-31')).status, 'bad_range')
  // report obsahuje checklist, fotky a recenziu
  const rep = await rpc('boss@x.sk', 'cl_report_data', '2026-11-01', '2026-12-31')
  const rt = rep.tasks.find((x) => x.id === t)
  assert.equal(Number(rt.review_rating), 2); assert.equal(rt.review_text, 'Špinavá kúpeľňa'); assert.ok('items_total' in rt && 'photos_before' in rt && 'photos_issue' in rt)
  // odstránenie recenzie: preč z kvality aj z reportu
  assert.equal((await rpc('boss@x.sk', 'cl_remove_review', a.id)).ok, true)
  assert.equal((await rpc('boss@x.sk', 'cl_quality', '2026-11-01', '2026-12-31')).visits.find((v) => v.code === 'CODE1').reviews.length, 0)
  assert.ok(await fails(rpc('a@x.sk', 'cl_remove_review', a.id)))
})

test('synchronizácia: viac balíkov na ten istý byt a deň nespôsobí chybu', { skip: !have }, async () => {
  await pkg('L2', '2026-12-02', { status: 'packed' })
  await pkg('L2', '2026-12-02', { status: 'packed' })
  await pkg('L2', '2026-12-02', { status: 'todo', people: 9 })
  const r = await rpc('boss@x.sk', 'cl_sync_tasks', '2026-12-01', '2026-12-05')
  assert.equal(r.ok, true)
  assert.equal(Number((await one("select count(*)::int as n from public.cl_tasks where listing_id = 'L2' and date = '2026-12-02'")).n), 1)
  assert.notEqual((await one("select people from public.cl_tasks where listing_id = 'L2' and date = '2026-12-02'")).people, 9) // zabalený balík má prednosť
})

test('verejná prihláška: obmedzenia, robot, schválenie a účet', { skip: !have }, async () => {
  const ok = ['Nová Upratovačka', 'nova@x.sk', '0905 111 222', 'Dlhá 9, Bratislava', 'Bratislava', 'mám prax']
  await as(null); await db.exec('set role anon')
  const apply = async (...a) => (await one('select public.cl_apply($1,$2,$3,$4,$5,$6,$7) as r', [...a, ''].slice(0, 7))).r
  assert.equal((await one('select public.cl_apply($1,$2,$3,$4,$5,$6,$7) as r', [...ok, ''])).r.ok, true)
  assert.equal((await one('select public.cl_apply($1,$2,$3,$4,$5,$6,$7) as r', ['x', 'nova@x.sk', '1', 'a', null, null, ''])).r.status, 'invalid')
  assert.equal((await one('select public.cl_apply($1,$2,$3,$4,$5,$6,$7) as r', [...ok, 'robot'])).r.ok, true) // robot: tvári sa, že prešlo
  assert.ok(apply)
  assert.ok(await fails(db.query('select * from public.cl_applications'))) // anon tabuľku nečíta
  await db.exec('reset role')
  assert.equal((await one("select count(*)::int as n from public.cl_applications where lower(email) = 'nova@x.sk'")).n, 1)
  // duplicita: tá istá adresa druhýkrát nevytvorí ďalšiu prihlášku; po 3 pokusoch za deň obmedzenie
  await db.exec('set role anon')
  for (let i = 0; i < 3; i++) await db.query('select public.cl_apply($1,$2,$3,$4,$5,$6,$7)', [...ok, ''])
  assert.equal((await one('select public.cl_apply($1,$2,$3,$4,$5,$6,$7) as r', [...ok, ''])).r.status, 'too_many')
  await db.exec('reset role')
  assert.equal((await one("select count(*)::int as n from public.cl_applications where lower(email) = 'nova@x.sk'")).n, 1)
  // schválenie: len manažérka; vznikne používateľ s rolou cleaning a profil upratovačky
  const id = (await one("select id from public.cl_applications where lower(email) = 'nova@x.sk'")).id
  assert.ok(await fails(rpc('a@x.sk', 'cl_decide_application', id, true)))
  const d = await rpc('boss@x.sk', 'cl_decide_application', id, true)
  assert.equal(d.approved, true)
  assert.deepEqual((await one("select roles from public.app_users where email = 'nova@x.sk'")).roles, ['cleaning'])
  assert.equal((await one("select role, address from public.cl_staff where email = 'nova@x.sk'")).address, 'Dlhá 9, Bratislava')
  assert.equal((await rpc('boss@x.sk', 'cl_decide_application', id, true)).replayed, true)
  // účet: len manažérka a len pre upratovačku; s povinnou zmenou hesla
  assert.ok(await fails(rpc('a@x.sk', 'cl_create_account', 'nova@x.sk')))
  assert.equal((await rpc('boss@x.sk', 'cl_create_account', 'staff@x.sk')).status, 'no_staff')
  const acc = await rpc('boss@x.sk', 'cl_create_account', 'nova@x.sk')
  assert.deepEqual({ ok: acc.ok, c: acc.created }, { ok: true, c: true })
  const u = await one("select raw_user_meta_data from auth.users where email = 'nova@x.sk'")
  assert.equal(u.raw_user_meta_data.must_change_password, true)
  assert.equal((await rpc('boss@x.sk', 'cl_create_account', 'nova@x.sk')).created, false)
  // odmietnutie nič nevytvorí
  await db.exec('set role anon'); await db.query('select public.cl_apply($1,$2,$3,$4,$5,$6,$7)', ['Iná Osoba', 'ina@x.sk', '0900123123', 'Krátka 1, Košice', null, null, '']); await db.exec('reset role')
  const id2 = (await one("select id from public.cl_applications where email = 'ina@x.sk'")).id
  await rpc('boss@x.sk', 'cl_decide_application', id2, false)
  assert.equal((await one("select count(*)::int as n from public.cl_staff where email = 'ina@x.sk'")).n, 0)
})

test('nástenka: čítanie, odpovede, pripnutie len manažérka, mazanie', { skip: !have }, async () => {
  assert.equal((await rpc('boss@x.sk', 'cl_post', 'Zajtra školenie o 9:00', null, true)).ok, true)
  assert.equal((await rpc('a@x.sk', 'cl_post', 'Prídem', null, true)).ok, true)
  const pinned = await rows("select author_email, pinned from public.cl_posts where parent_id is null order by created_at")
  assert.deepEqual(pinned.map((p) => p.pinned), [true, false]) // upratovačka pripnúť nevie
  const first = (await one("select id from public.cl_posts where author_email = 'boss@x.sk'")).id
  assert.equal((await rpc('b@x.sk', 'cl_post', 'Ďakujem', first, false)).ok, true)
  assert.equal((await rpc('b@x.sk', 'cl_post', 'Odpoveď na odpoveď', (await one("select id from public.cl_posts where text = 'Ďakujem'")).id, false)).status, 'bad_parent')
  assert.ok(await fails(rpc('staff@x.sk', 'cl_post', 'cudzí', null, false)))
  await as('b@x.sk'); assert.equal((await rows('select id from public.cl_posts')).length, 3); await as(null)
  assert.ok(await fails(rpc('b@x.sk', 'cl_remove_post', first))) // cudzí príspevok
  await rpc('boss@x.sk', 'cl_remove_post', first)
  await as('b@x.sk'); assert.equal((await rows('select id from public.cl_posts')).length, 1); await as(null)
})
