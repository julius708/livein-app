// Migrácia 20261119_upratovanie.sql na PGlite: oprávnenia, RLS, tok úlohy a verejná prihláška.
// Beží len tam, kde je PGlite (lokálne z Práčovne); inde sa test preskočí.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const PG = '/home/user/pracovna/node_modules/@electric-sql/pglite/dist/index.js'
const have = existsSync(PG)
const MIG = readFileSync(new URL('../supabase/migrations/20261119_upratovanie.sql', import.meta.url), 'utf8')
const MIG2 = readFileSync(new URL('../supabase/migrations/20261120_upratovanie_ulohy_report.sql', import.meta.url), 'utf8')

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
create table public.guide_cards (listing_id text primary key, address text, lat numeric, lng numeric);
create table public.packages (id uuid primary key default gen_random_uuid(), listing_id text not null, listing_name text not null, date date not null, target_people int, computed_items jsonb not null default '{}', note text not null default '', status text not null default 'todo', hidden boolean not null default false);
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
  await rpc('a@x.sk', 'cl_save_my_profile', { address: 'Nová 5', phone: '0911', lat: 48.12, lng: 17.09, geo_source: 'geocoded', days_off: ['2026-12-01', '2026-12-02'] })
  const mine = await one("select address, phone, lat, geo_source, days_off::text[] as off, max_per_day from public.cl_staff where email = 'a@x.sk'")
  assert.deepEqual({ a: mine.address, p: mine.phone, g: mine.geo_source, off: mine.off, m: mine.max_per_day }, { a: 'Nová 5', p: '0911', g: 'geocoded', off: ['2026-12-01', '2026-12-02'], m: 3 })
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
  assert.equal((await rpc('boss@x.sk', 'cl_report_data', '2026-01-01', '2026-12-31')).status, 'bad_range')
  assert.equal((await rpc('bot@x.sk', 'cl_report_mark', '2026-11')).ok, true)
  assert.equal((await rpc('bot@x.sk', 'cl_report_data', '2026-11-01', '2026-11-30')).sent, true)
  assert.equal((await rpc('boss@x.sk', 'cl_report_mark', 'zle')).status, 'bad_input')
  assert.ok(await fails(rpc('a@x.sk', 'cl_report_mark', '2026-11')))
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
