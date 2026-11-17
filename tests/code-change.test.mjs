import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './helpers/fake-supabase.mjs'
import { isAllowedPath, isSensitive, canApprove, ghClient, queueChange, processChange, refreshChange, approveChange, rejectChange, revertChange, tickChanges, MAX_OPEN } from '../lib/code-change.js'

const json = (st, body) => ({ status: st, ok: st < 300, json: async () => body, text: async () => JSON.stringify(body) })
/** Atrapa GitHub API: súbory na main, vetvy, PR, kontroly. */
function mockGitHub(over = {}) {
  const st = { main: { 'lib/billing-core.js': { content: "export const A = 1\nexport const B = 2\n", sha: 's-core' }, 'lib/billing-ops.js': { content: 'export const ops = 1\n', sha: 's-ops' }, 'middleware.js': { content: 'secret\n', sha: 's-mw' }, 'components/vyuctovanie/Board.js': { content: 'board\n', sha: 's-board' } }, branches: { main: 'sha-main' }, branchFiles: {}, prs: {}, log: [], checks: { runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }], statuses: [{ context: 'Vercel', state: 'success', target_url: 'https://preview.example' }] }, mergeable: true, extraFile: null, ...over }
  const f = async (url, o = {}) => {
    const u = new URL(url), m = o.method || 'GET', p = decodeURIComponent(u.pathname.replace('/repos/o/r', '')), body = o.body ? JSON.parse(o.body) : null
    st.log.push(`${m} ${p}`)
    if (u.pathname === '/graphql') return json(200, { data: { revertPullRequest: { revertPullRequest: { number: 9, url: 'https://github.example/pull/9', id: 'REV_node' } } } })
    if (p.startsWith('/git/trees/')) return json(200, { tree: Object.keys(st.main).map((path) => ({ type: 'blob', path })) })
    if (p === '/git/ref/heads/main') return json(200, { object: { sha: st.branches.main } })
    if (p === '/git/refs' && m === 'POST') { st.branches[body.ref.replace('refs/heads/', '')] = body.sha; return json(201, {}) }
    if (p.startsWith('/git/refs/heads/') && m === 'DELETE') { delete st.branches[p.replace('/git/refs/heads/', '')]; return json(204, {}) }
    if (p.startsWith('/contents/') && m === 'GET') { const path = p.replace('/contents/', ''); const x = st.main[path]; return x ? json(200, { content: Buffer.from(x.content).toString('base64'), sha: x.sha }) : json(404, { message: 'Not Found' }) }
    if (p.startsWith('/contents/') && m === 'PUT') { const path = p.replace('/contents/', ''); (st.branchFiles[body.branch] = st.branchFiles[body.branch] || {})[path] = Buffer.from(body.content, 'base64').toString(); return json(200, {}) }
    if (p === '/pulls' && m === 'POST') { st.prs[7] = { number: 7, html_url: 'https://github.example/pull/7', node_id: 'PR_node', head: { sha: 'head-1', ref: body.head }, state: 'open', merged: false, draft: false, title: body.title }; return json(201, st.prs[7]) }
    const pr = p.match(/^\/pulls\/(\d+)(\/files|\/merge)?$/)
    if (pr) {
      const n = pr[1]
      if (pr[2] === '/files') { const files = Object.keys(st.branchFiles[st.prs[n].head.ref] || {}).map((filename) => ({ filename, status: 'modified', additions: 1, deletions: 0 })); if (st.extraFile) files.push({ filename: st.extraFile, status: 'modified', additions: 1, deletions: 0 }); return json(200, files) }
      if (pr[2] === '/merge') { st.prs[n].merged = true; st.prs[n].state = 'closed'; st.merged = body; return json(200, { merged: true, sha: 'merge-sha' }) }
      if (m === 'PATCH') { st.prs[n].state = body.state; return json(200, st.prs[n]) }
      return json(200, { ...st.prs[n], mergeable: st.mergeable, merge_commit_sha: 'merge-sha' })
    }
    if (p.endsWith('/check-runs')) return json(200, { check_runs: st.checks.runs })
    if (p.endsWith('/status')) return json(200, { statuses: st.checks.statuses })
    return json(404, { message: 'nenamockované ' + p })
  }
  f.st = st
  return f
}
const tool = (id, name, input) => ({ status: 200, ok: true, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] }), text: async () => '' })
const aiScript = (...steps) => { let i = 0; const f = async () => steps[Math.min(i++, steps.length - 1)]; return f }
const GOOD = () => aiScript(tool('1', 'list_files', {}), tool('2', 'read_file', { path: 'lib/billing-core.js' }), tool('3', 'edit_file', { path: 'lib/billing-core.js', old: 'export const B = 2', new: 'export const B = 3' }), tool('4', 'write_file', { path: 'tests/billing-nova.test.mjs', content: '// test\n' }), tool('5', 'finish', { title: 'Zmena B na 3', summary: 'Hodnota B sa zmení na 3.', risks: 'nízke' }))
const mk = () => ({ s: fakeSupabase(), gh: null })
const setup = async (ai, ghOver) => {
  const s = fakeSupabase(); const gf = mockGitHub(ghOver); const gh = ghClient({ token: 't', repo: 'o/r', fetchImpl: gf })
  const q = await queueChange(s, { who: 'martina@x.sk', name: 'Martina', title: 'Zmena B', request: 'Zmeň B na 3', transcript: 'Používateľ: zmeň B' })
  return { s, gf, gh, q, run: () => processChange(s, q.change.id, { gh, key: 'k', fetchImpl: ai }) }
}

test('okruh súborov: povolené len súbory modulu Vyúčtovanie; autentifikácia, middleware, chat a iné moduly nie', () => {
  for (const ok of ['lib/billing-core.js', 'lib/billing-ops.js', 'components/vyuctovanie/Board.js', 'app/vyuctovanie/vyuctovanie.css', 'app/vyuctovanie/actions.js', 'tests/billing.test.mjs', 'docs/vyuctovanie/README.md']) assert.equal(isAllowedPath(ok), true, ok)
  for (const bad of ['middleware.js', 'lib/auth.js', 'lib/billing-chat.js', 'lib/code-change.js', 'components/vyuctovanie/ChatPanel.js', 'components/vyuctovanie/ChangesTab.js', 'app/api/cron/invest-run/route.js', 'package.json', '.github/workflows/ci.yml', 'vercel.json', 'supabase/migrations/x.sql', '../lib/billing-core.js', '/lib/billing-core.js', 'lib/billing-core.js/../auth.js', 'lib//billing-core.js', 'tests/billing-chat.test.mjs', 'app/investicie/actions.js', '.env']) assert.equal(isAllowedPath(bad), false, bad)
  assert.equal(isSensitive('app/vyuctovanie/actions.js'), true); assert.equal(isSensitive('components/vyuctovanie/Board.js'), false)
})
test('schvaľovateľ: len admin s rolou „Schvaľovateľ zmien kódu“; bez roly nemôže nikto', () => {
  assert.equal(canApprove({ roles: ['admin', 'code_approver'], active: true }), true)
  assert.equal(canApprove({ roles: ['admin'], active: true }), false); assert.equal(canApprove({ roles: ['code_approver'], active: true }), false)
  assert.equal(canApprove({ roles: ['admin', 'code_approver'], active: false }), false); assert.equal(canApprove(null), false)
})
test('AI pripraví zmenu: vetva, commity len povolených súborov, pull request, stav „čaká na schválenie“; nič sa nezlúči', async () => {
  const t = await setup(GOOD()); const r = await t.run()
  assert.equal(r.ok, true)
  const row = t.s.db.tables.billing_changes[0]
  assert.equal(row.status, 'ready'); assert.equal(row.pr_number, 7); assert.match(row.branch, /^chat\//); assert.equal(row.title, 'Zmena B na 3')
  assert.deepEqual(row.files.map((f) => f.path).sort(), ['lib/billing-core.js', 'tests/billing-nova.test.mjs'])
  const bf = t.gf.st.branchFiles[row.branch]
  assert.match(bf['lib/billing-core.js'], /B = 3/); assert.match(bf['lib/billing-core.js'], /A = 1/)   // upravil sa len určený riadok
  assert.equal(t.gf.st.main['lib/billing-core.js'].content.includes('B = 2'), true)   // main sa nemení
  assert.ok(!t.gf.st.log.some((l) => l.includes('/merge')))
})
test('zakázané súbory: AI ich nemôže čítať ani meniť; bez povolenej zmeny sa PR nevytvorí', async () => {
  const ai = aiScript(tool('1', 'read_file', { path: 'middleware.js' }), tool('2', 'edit_file', { path: 'middleware.js', old: 'secret', new: 'x' }), tool('3', 'write_file', { path: 'lib/auth.js', content: 'x' }), tool('4', 'write_file', { path: '../x.js', content: 'x' }), tool('5', 'finish', { title: 't', summary: 's' }))
  const t = await setup(ai); const r = await t.run()
  assert.equal(r.ok, false); assert.equal(t.s.db.tables.billing_changes[0].status, 'failed'); assert.match(t.s.db.tables.billing_changes[0].error, /žiadna zmena/)
  assert.ok(!t.gf.st.log.some((l) => l.startsWith('POST /pulls') || l.startsWith('POST /git/refs')))
})
test('zmena, ktorá potrebuje databázu, sa neimplementuje a vysvetlí sa', async () => {
  const t = await setup(aiScript(tool('1', 'finish', { title: 'Nový stĺpec', summary: 'Treba stĺpec invoice_date.', needs_db: true }))); await t.run()
  const row = t.s.db.tables.billing_changes[0]; assert.equal(row.status, 'failed'); assert.match(row.error, /databázy/)
})
test('edit_file: nenájdený alebo neunikátny text sa vráti AI ako chyba, súbor ostane nezmenený', async () => {
  const ai = aiScript(tool('1', 'edit_file', { path: 'lib/billing-core.js', old: 'neexistuje', new: 'x' }), tool('2', 'edit_file', { path: 'lib/billing-core.js', old: 'export const', new: 'const' }), tool('3', 'finish', { title: 't', summary: 's' }))
  const t = await setup(ai); await t.run()
  assert.equal(t.s.db.tables.billing_changes[0].status, 'failed')
  assert.ok(!t.gf.st.log.some((l) => l.startsWith('PUT /contents/')))
})
test('schválenie jedným klikom: len schvaľovateľ, len po zelených testoch a Vercel náhľade, len pre nezmenený commit; potom squash zlúčenie', async () => {
  const t = await setup(GOOD()); await t.run()
  const id = t.s.db.tables.billing_changes[0].id
  const deps = { gh: t.gh }
  // nie je schvaľovateľ
  assert.equal((await approveChange(t.s, id, { who: 'martina@x.sk', approver: false, expectedSha: 'head-1', gh: t.gh })).ok, false)
  // kontroly ešte bežia
  t.gf.st.checks = { runs: [{ name: 'CI', status: 'in_progress' }], statuses: [{ context: 'Vercel', state: 'pending' }] }
  let r = await approveChange(t.s, id, { who: 'j@x.sk', approver: true, expectedSha: 'head-1', gh: t.gh }); assert.equal(r.ok, false); assert.match(r.error, /Kontroly ešte neprebehli/)
  // testy zlyhali
  t.gf.st.checks = { runs: [{ name: 'CI', status: 'completed', conclusion: 'failure' }], statuses: [{ context: 'Vercel', state: 'success' }] }
  r = await approveChange(t.s, id, { who: 'j@x.sk', approver: true, expectedSha: 'head-1', gh: t.gh }); assert.equal(r.ok, false); assert.match(r.error, /testy zlyhali/)
  // všetko zelené, ale commit sa zmenil po otvorení
  t.gf.st.checks = { runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }], statuses: [{ context: 'Vercel', state: 'success', target_url: 'https://preview.example' }] }
  r = await approveChange(t.s, id, { who: 'j@x.sk', approver: true, expectedSha: 'stary-commit', gh: t.gh }); assert.equal(r.ok, false); assert.match(r.error, /upravila/)
  // PR s cudzím súborom
  t.gf.st.extraFile = 'middleware.js'
  r = await approveChange(t.s, id, { who: 'j@x.sk', approver: true, expectedSha: 'head-1', gh: t.gh }); assert.equal(r.ok, false); assert.match(r.error, /mimo povoleného okruhu/)
  assert.ok(!t.gf.st.log.some((l) => l.includes('/merge')))
  // v poriadku
  t.gf.st.extraFile = null
  r = await approveChange(t.s, id, { who: 'j@x.sk', approver: true, expectedSha: 'head-1', gh: t.gh })
  assert.equal(r.ok, true)
  assert.equal(t.gf.st.merged.merge_method, 'squash'); assert.equal(t.gf.st.merged.sha, 'head-1')
  const row = t.s.db.tables.billing_changes[0]; assert.equal(row.status, 'merged'); assert.equal(row.decided_by, 'j@x.sk')
  assert.equal(Object.keys(t.gf.st.branches).some((b) => b.startsWith('chat/')), false)   // vetva sa zmazala
  void deps
})
test('zamietnutie zatvorí PR a zmaže vetvu; nasadená zmena sa dá vrátiť cez revert PR, ktorý ide do rovnakého schvaľovania', async () => {
  const t = await setup(GOOD()); await t.run()
  const id = t.s.db.tables.billing_changes[0].id
  assert.equal((await rejectChange(t.s, id, { who: 'x', approver: false, gh: t.gh })).ok, false)
  assert.equal((await rejectChange(t.s, id, { who: 'j@x.sk', approver: true, gh: t.gh })).ok, true)
  assert.equal(t.gf.st.prs[7].state, 'closed'); assert.equal(t.s.db.tables.billing_changes[0].status, 'rejected')
  // revert
  const t2 = await setup(GOOD()); await t2.run()
  const id2 = t2.s.db.tables.billing_changes[0].id
  t2.gf.st.checks.runs = [{ name: 'CI', status: 'completed', conclusion: 'success' }]
  await approveChange(t2.s, id2, { who: 'j@x.sk', approver: true, expectedSha: 'head-1', gh: t2.gh })
  // GitHub revert PR zasahuje len tie isté súbory
  t2.gf.st.branchFiles['revert'] = { 'lib/billing-core.js': 'x' }; t2.gf.st.prs[9] = { number: 9, head: { sha: 'r1', ref: 'revert' }, state: 'open' }
  assert.equal((await revertChange(t2.s, id2, { who: 'x', approver: false, gh: t2.gh })).ok, false)
  const rv = await revertChange(t2.s, id2, { who: 'j@x.sk', approver: true, gh: t2.gh })
  assert.equal(rv.ok, true)
  const rows = t2.s.db.tables.billing_changes
  assert.equal(rows.length, 2); assert.equal(rows[1].kind, 'revert'); assert.equal(rows[1].status, 'ready')
  assert.equal((await revertChange(t2.s, rows[1].id, { who: 'j@x.sk', approver: true, gh: t2.gh })).ok, false)   // revert sa nevracia dokola
})
test('fronta: najviac 3 otvorené návrhy; cron spracuje čakajúce a zruší zaseknuté', async () => {
  const s = fakeSupabase()
  for (let i = 0; i < MAX_OPEN; i++) assert.equal((await queueChange(s, { who: 'a@b.sk', title: 'z' + i, request: 'r' })).ok, true)
  const r = await queueChange(s, { who: 'a@b.sk', title: 'ďalšia', request: 'r' }); assert.equal(r.ok, false); assert.match(r.error, /Čakajú už/)
  assert.equal((await queueChange(s, { who: 'a@b.sk', title: '', request: 'r' })).ok, false)
  const s2 = fakeSupabase({ billing_changes: [{ id: 'st', status: 'working', started_at: new Date(Date.now() - 20 * 60e3).toISOString() }] })
  const out = await tickChanges(s2, { gh: ghClient({ token: 't', repo: 'o/r', fetchImpl: mockGitHub() }), key: 'k' })
  assert.equal(out.stuck, 1); assert.equal(s2.db.tables.billing_changes[0].status, 'failed')
})
test('súbežné spracovanie jednej zmeny: druhý beh ju už nebere', async () => {
  const t = await setup(GOOD())
  const [a, b] = await Promise.all([t.run(), processChange(t.s, t.q.change.id, { gh: t.gh, key: 'k', fetchImpl: GOOD() })])
  assert.equal([a, b].filter((x) => x.skipped).length, 1)
  assert.equal(t.gf.st.log.filter((l) => l === 'POST /pulls').length, 1)
})
test('stav kontrol: bez CI behov je „čaká“, po 6 minútach „nespustilo sa“; zlúčenie zvonku sa prejaví', async () => {
  const t = await setup(GOOD(), { checks: { runs: [], statuses: [] } }); await t.run()
  let row = t.s.db.tables.billing_changes[0]
  let f = await refreshChange(t.s, row, { gh: t.gh, now: Date.now() }); assert.equal(f.checks.ci, 'pending'); assert.equal(f.checks.ready_to_merge, false)
  row = t.s.db.tables.billing_changes[0]
  f = await refreshChange(t.s, { ...row, updated_at: new Date(Date.now() - 10 * 60e3).toISOString() }, { gh: t.gh, now: Date.now() }); assert.equal(f.checks.ci, 'none')
  t.gf.st.prs[7].merged = true
  f = await refreshChange(t.s, t.s.db.tables.billing_changes[0], { gh: t.gh }); assert.equal(f.status, 'merged')
  void mk
})
test('Vercel náhľad sa rozpozná aj ako kontrola (check run), nie len ako commit status', async () => {
  const t = await setup(GOOD(), { checks: { runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }, { name: 'Vercel', status: 'completed', conclusion: 'success' }], statuses: [] } }); await t.run()
  const f = await refreshChange(t.s, t.s.db.tables.billing_changes[0], { gh: t.gh })
  assert.equal(f.checks.vercel, 'success'); assert.equal(f.checks.ci, 'success'); assert.equal(f.checks.ready_to_merge, true)
  assert.deepEqual(f.checks.ci_runs.map((x) => x.name), ['CI'])
})
