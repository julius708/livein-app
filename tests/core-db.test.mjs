// Migrácia 20261127_core_inbox.sql na PGlite: záznam udalostí a schránka, oprávnenia a RLS.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const PG = '/home/user/pracovna/node_modules/@electric-sql/pglite/dist/index.js'
const have = existsSync(PG)
const MIG = readFileSync(new URL('../supabase/migrations/20261127_core_inbox.sql', import.meta.url), 'utf8')

const STUBS = `
create role authenticated nologin; create role anon nologin; create role service_role nologin;
create schema auth;
grant usage on schema public to anon, authenticated;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table public.app_users (email text primary key, name text not null, roles text[] not null default '{}', active boolean not null default true);
create function public.is_app_admin() returns boolean language sql stable security definer as $$ select exists (select 1 from public.app_users where lower(email) = lower(auth.jwt() ->> 'email') and active and 'admin' = any(roles)) $$;
`

let db
const rows = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await rows(sql, params))[0]
const as = async (email) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims', $1, false)", [email ? JSON.stringify({ email }) : '']); if (email) await db.exec('set role authenticated') }
const rpc = async (email, fn, ...args) => { await as(email); try { return (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r } finally { await as(null) } }
const fails = async (p) => { try { await p } catch (e) { return e.code || e.message } return null }

before(async () => {
  if (!have) return
  const { PGlite } = await import(PG)
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec(MIG)
  await db.exec(`insert into public.app_users (email, name, roles, active) values ('admin@x.sk','Admin',array['admin'],true), ('a@x.sk','Anna',array['cleaning'],true), ('b@x.sk','Beáta',array['cleaning'],true), ('off@x.sk','Vypnutý',array['cleaning'],false)`)
})
after(async () => { await db?.close() })

test('core_log zapíše udalosť s autorom z prihlásenia', { skip: !have }, async () => {
  const r = await rpc('a@x.sk', 'core_log', 'upratovanie', 'task.done', 'task', 't1', { x: 1 })
  assert.equal(r.ok, true)
  await db.exec('reset role')
  const e = await one("select actor_email, module, event, data from public.core_events where subject_id = 't1'")
  assert.equal(e.actor_email, 'a@x.sk')
  assert.equal(e.data.x, 1)
})

test('core_log odmietne anonym, vypnutého a zlý vstup', { skip: !have }, async () => {
  assert.equal((await rpc(null, 'core_log', 'm', 'e')).status, 'no_user')
  assert.equal((await rpc('off@x.sk', 'core_log', 'm', 'e')).status, 'inactive')
  assert.equal((await rpc('a@x.sk', 'core_log', '', 'e')).status, 'bad_input')
})

test('udalosti vidí admin všetky, ostatní len svoje; zápis priamo nejde', { skip: !have }, async () => {
  await rpc('b@x.sk', 'core_log', 'kb', 'article.read', 'article', 'k1')
  await as('a@x.sk')
  const mine = await rows('select actor_email from public.core_events')
  assert.ok(mine.length >= 1 && mine.every((x) => x.actor_email === 'a@x.sk'))
  assert.ok(await fails(db.query("insert into public.core_events (actor_email, module, event) values ('a@x.sk','m','e')")))
  await as('admin@x.sk')
  const all = await rows('select distinct actor_email from public.core_events')
  assert.ok(all.length >= 2)
  await as(null)
})

test('core_notify doručí správu len adresátovi a zapíše udalosť', { skip: !have }, async () => {
  const r = await rpc('a@x.sk', 'core_notify', 'b@x.sk', 'upratovanie', 'Nový byt', 'Detail', '/uprat?u=1', 'task')
  assert.equal(r.ok, true)
  await as('b@x.sk')
  const inbox = await rows('select title, from_email, kind, href, read_at from public.core_inbox')
  assert.equal(inbox.length, 1)
  assert.equal(inbox[0].from_email, 'a@x.sk')
  assert.equal(inbox[0].read_at, null)
  await as('a@x.sk')
  assert.equal((await rows('select * from public.core_inbox')).length, 0)
  await as('admin@x.sk')
  assert.equal((await rows('select * from public.core_inbox')).length, 0)
  await as(null)
  assert.equal((await one("select count(*)::int n from public.core_events where event = 'inbox.sent'")).n, 1)
})

test('core_notify odmietne neexistujúceho adresáta, cudzí odkaz a príliš dlhý text', { skip: !have }, async () => {
  assert.equal((await rpc('a@x.sk', 'core_notify', 'nikto@x.sk', 'm', 'T')).status, 'no_user')
  assert.equal((await rpc('a@x.sk', 'core_notify', 'off@x.sk', 'm', 'T')).status, 'no_user')
  assert.equal((await rpc('a@x.sk', 'core_notify', 'b@x.sk', 'm', 'T', null, 'https://evil.example')).status, 'bad_input')
  assert.equal((await rpc('a@x.sk', 'core_notify', 'b@x.sk', 'm', 'T', null, '//evil.example')).status, 'bad_input')
  assert.equal((await rpc('a@x.sk', 'core_notify', 'b@x.sk', 'm', 'x'.repeat(201))).status, 'bad_input')
  assert.equal((await rpc('off@x.sk', 'core_notify', 'b@x.sk', 'm', 'T')).status, 'inactive')
})

test('core_inbox_read označí len moje správy', { skip: !have }, async () => {
  await rpc('b@x.sk', 'core_notify', 'a@x.sk', 'm', 'Pre Annu')
  const r = await rpc('b@x.sk', 'core_inbox_read')
  assert.equal(r.ok, true)
  assert.equal(r.n, 1)
  await as('a@x.sk')
  assert.equal((await rows('select * from public.core_inbox where read_at is null')).length, 1)
  await as(null)
})

test('priamy zápis a úprava schránky nie sú povolené', { skip: !have }, async () => {
  await as('a@x.sk')
  assert.ok(await fails(db.query("insert into public.core_inbox (to_email, module, title) values ('a@x.sk','m','t')")))
  assert.ok(await fails(db.query("update public.core_inbox set title = 'x'")))
  await as(null)
})
