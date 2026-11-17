// Návrhy zmien kódu z chatu Pomocník: AI pripraví zmenu v obmedzenom okruhu súborov modulu Vyúčtovanie, otvorí pull request na GitHube
// a človek ju schváli jedným klikom (až po zelených testoch a úspešnom Vercel náhľade). Nič sa nenasadí bez schválenia; kľúč GitHubu je len na serveri.
import { callMessages } from './anthropic.js'

/** Schvaľovať smie len admin s rolou „Schvaľovateľ zmien kódu“ (prideľuje sa v Správe appky). Bez roly nemôže schváliť nikto. */
export const APPROVER_ROLE = 'code_approver'
export const canApprove = (me) => !!(me && me.active !== false && (me.roles || []).includes('admin') && (me.roles || []).includes(APPROVER_ROLE))
export const REPO = 'julius708/livein-app'
export const BASE = 'main'
export const MAX_FILES = 8
export const MAX_FILE_BYTES = 60000
export const MAX_OPEN = 3

/* ---------- okruh súborov, ktoré smie chat meniť ---------- */
export const ALLOWED = [
  /^lib\/billing-(?:core|ops|server)\.js$/,
  /^lib\/xlsx-lite\.js$/,
  /^components\/vyuctovanie\/(?!ChatPanel|ChangesTab)[A-Za-z0-9._-]+\.js$/,
  /^app\/vyuctovanie\/(?:[A-Za-z0-9._-]+|export)(?:\/[A-Za-z0-9._-]+)*\.(?:js|css)$/,
  /^tests\/billing(?!-chat)[A-Za-z0-9._-]*\.test\.mjs$/,
  /^tests\/xlsx-lite\.test\.mjs$/,
  /^docs\/vyuctovanie\/[A-Za-z0-9._-]+\.md$/,
]
export const isAllowedPath = (p) => typeof p === 'string' && p.length < 160 && !p.includes('..') && !p.startsWith('/') && !p.includes('\\') && !p.includes('//') && ALLOWED.some((re) => re.test(p))
/** Súbory, ktoré rozhodujú o ukladaní dát a oprávneniach: zmena sa v schvaľovaní zvýrazní. */
export const SENSITIVE = [/^app\/vyuctovanie\/actions\.js$/, /^lib\/billing-ops\.js$/, /^lib\/billing-server\.js$/, /^app\/vyuctovanie\/export\//]
export const isSensitive = (p) => SENSITIVE.some((re) => re.test(p))

/* ---------- klient GitHub REST API ---------- */
export function ghClient({ token, repo = REPO, fetchImpl = fetch }) {
  const call = async (url, { method = 'GET', body } = {}) => {
    const r = await fetchImpl(url, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', 'user-agent': 'app-zmeny' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}: ${String(j.message || '').slice(0, 160)}`), { status: r.status })
    return j
  }
  const api = (path, o) => call(`https://api.github.com/repos/${repo}${path}`, o)
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/')
  return {
    async getFile(path, ref = BASE) { try { const j = await api(`/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`); return { content: Buffer.from(j.content || '', 'base64').toString('utf8'), sha: j.sha } } catch (e) { if (e.status === 404) return null; throw e } },
    async tree(ref = BASE) { const j = await api(`/git/trees/${encodeURIComponent(ref)}?recursive=1`); return (j.tree || []).filter((x) => x.type === 'blob').map((x) => x.path) },
    async refSha(branch = BASE) { return (await api(`/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha },
    createBranch(name, sha) { return api('/git/refs', { method: 'POST', body: { ref: `refs/heads/${name}`, sha } }) },
    putFile({ path, content, branch, message, sha }) { return api(`/contents/${enc(path)}`, { method: 'PUT', body: { message, content: Buffer.from(content, 'utf8').toString('base64'), branch, ...(sha ? { sha } : {}) } }) },
    createPR({ title, head, body }) { return api('/pulls', { method: 'POST', body: { title, head, base: BASE, body } }) },
    getPR(n) { return api(`/pulls/${n}`) },
    async prFiles(n) { return (await api(`/pulls/${n}/files?per_page=100`)).map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })) },
    async checkRuns(sha) { return (await api(`/commits/${sha}/check-runs?per_page=50`)).check_runs || [] },
    commitStatus(sha) { return api(`/commits/${sha}/status`) },
    merge(n, { sha, title }) { return api(`/pulls/${n}/merge`, { method: 'PUT', body: { merge_method: 'squash', sha, commit_title: title } }) },
    closePR(n) { return api(`/pulls/${n}`, { method: 'PATCH', body: { state: 'closed' } }) },
    async deleteBranch(name) { try { await api(`/git/refs/heads/${encodeURIComponent(name)}`, { method: 'DELETE' }) } catch { /* vetva už nemusí existovať */ } },
    async revertPR(nodeId, title) {
      const j = await call('https://api.github.com/graphql', { method: 'POST', body: { query: 'mutation($id:ID!,$t:String!){revertPullRequest(input:{pullRequestId:$id,title:$t}){revertPullRequest{number url id}}}', variables: { id: nodeId, t: title } } })
      if (j.errors && j.errors.length) throw new Error('GitHub: ' + String(j.errors[0].message).slice(0, 160))
      return j.data.revertPullRequest.revertPullRequest
    },
  }
}

/* ---------- AI: príprava zmeny ---------- */
const TOOLS = [
  { name: 'list_files', description: 'Zoznam súborov, ktoré smieš čítať a meniť.', input_schema: { type: 'object', properties: {} } },
  { name: 'read_file', description: 'Prečíta súbor z hlavnej vetvy (alebo jeho už upravenú verziu).', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'edit_file', description: 'Nahradí PRESNE jeden výskyt textu `old` textom `new` v súbore (najprv ho prečítaj). Uprednostni pred write_file.', input_schema: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
  { name: 'write_file', description: 'Zapíše celý súbor (nový alebo nahradí existujúci). Len pre nové súbory alebo malé súbory.', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'finish', description: 'Ukonči prácu. Povinné: stručný názov, zhrnutie po slovensky pre schvaľovateľa (čo sa zmení a čo uvidí používateľ), riziká. Ak zmena vyžaduje zmenu databázy, nastav needs_db a nič neimplementuj.', input_schema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, risks: { type: 'string' }, needs_db: { type: 'boolean' } }, required: ['title', 'summary'] } },
]
const SYSTEM = `Si vývojár aplikácie LIVE-IN (Next.js 15 App Router, React 19, JavaScript, bez nových závislostí). Pripravuješ MALÚ, bezpečnú zmenu v module „Vyúčtovanie majiteľom“ podľa požiadavky kolegyne. Tvoju zmenu ešte skontrolujú automatické testy a človek pred nasadením.

PRAVIDLÁ
- Meň len súbory, ktoré vypíše list_files. Auth, middleware, iné moduly, databázu a premenné prostredia nikdy.
- Žiadne zmeny databázy: použi existujúce stĺpce (napr. poznámku). Ak sa požiadavka bez novej tabuľky/stĺpca spraviť nedá, zavolaj finish s needs_db=true a vysvetli, čo treba.
- Sumy sa počítajú v centoch (lib/billing-core.js: lineCents, eurC); formátovanie bez Intl (NBSP). Texty v appke po slovensky, jazyk pre používateľa jednoduchý.
- Zmena výpočtu alebo pravidla patrí do lib/billing-core.js s testom v tests/billing*.test.mjs (node:test, ESM). Zachovaj existujúce exporty a správanie, ktoré sa nemá meniť.
- Server nikdy nedôveruje klientovi: validácia a oprávnenia ostávajú v lib/billing-ops.js a app/vyuctovanie/actions.js.
- Najprv si prečítaj súvisiace súbory. Rob čo najmenšiu zmenu; po úprave skontroluj importy, exporty a zátvorky.
- Na konci zavolaj finish.`

/**
 * @returns { ok, title, summary, risks, staged: Map(path → content), original: Map(path → {sha, content}) } | { ok:false, error }
 */
export async function generateChange({ gh, key, request, transcript = '', fetchImpl = fetch, budgetMs = 200000 }) {
  if (!key) return { ok: false, error: 'Chýba ANTHROPIC_API_KEY.' }
  const staged = new Map(), original = new Map()
  const t0 = Date.now()
  const load = async (path) => {
    if (staged.has(path)) return staged.get(path)
    if (!original.has(path)) { const f = await gh.getFile(path); original.set(path, f ? { sha: f.sha, content: f.content } : null) }
    const o = original.get(path); return o ? o.content : null
  }
  const msgs = [{ role: 'user', content: `Požiadavka od používateľa:\n${request}\n\nRozhovor (kontext):\n${transcript || '(bez kontextu)'}` }]
  let fin = null
  for (let i = 0; i < 16 && !fin; i++) {
    if (Date.now() - t0 > budgetMs) return { ok: false, error: 'Príprava zmeny trvala príliš dlho. Skús menšiu požiadavku.' }
    const r = await callMessages(key, { max_tokens: 12000, system: SYSTEM, tools: TOOLS, messages: msgs }, { fetchImpl, timeout: 90000 })
    if (!r.ok) return { ok: false, error: `AI neodpovedá (HTTP ${r.status || 'sieť'}).` }
    const blocks = r.json.content || []
    msgs.push({ role: 'assistant', content: blocks })
    const uses = blocks.filter((b) => b.type === 'tool_use')
    if (!uses.length) { msgs.push({ role: 'user', content: 'Pokračuj nástrojmi a skonči volaním finish.' }); continue }
    const results = []
    for (const u of uses) {
      const a = u.input || {}
      let out
      try {
        if (u.name === 'list_files') out = { files: (await gh.tree()).filter(isAllowedPath) }
        else if (u.name === 'read_file') { if (!isAllowedPath(a.path)) out = { error: 'Tento súbor nesmieš čítať ani meniť.' }; else { const c = await load(a.path); out = c == null ? { error: 'Súbor neexistuje.' } : { content: c.length > 50000 ? c.slice(0, 50000) + '\n…(skrátené)' : c } } }
        else if (u.name === 'edit_file') {
          if (!isAllowedPath(a.path)) out = { error: 'Tento súbor nesmieš meniť.' }
          else {
            const cur = await load(a.path)
            if (cur == null) out = { error: 'Súbor neexistuje (pre nový súbor použi write_file).' }
            else {
              const n = a.old ? cur.split(a.old).length - 1 : 0
              if (n !== 1) out = { error: n === 0 ? 'Text `old` sa v súbore nenašiel (musí sedieť presne).' : `Text \`old\` sa nachádza ${n}×; uveď unikátny úsek.` }
              else if (!staged.has(a.path) && staged.size >= MAX_FILES) out = { error: `Najviac ${MAX_FILES} súborov v jednej zmene.` }
              else { const next = cur.replace(a.old, () => String(a.new ?? '')); if (Buffer.byteLength(next) > MAX_FILE_BYTES) out = { error: 'Súbor by bol príliš veľký.' }; else { staged.set(a.path, next); out = { ok: true } } }
            }
          }
        } else if (u.name === 'write_file') {
          if (!isAllowedPath(a.path)) out = { error: 'Tento súbor nesmieš zapisovať.' }
          else if (typeof a.content !== 'string' || Buffer.byteLength(a.content) > MAX_FILE_BYTES) out = { error: 'Obsah chýba alebo je príliš veľký.' }
          else if (!staged.has(a.path) && staged.size >= MAX_FILES) out = { error: `Najviac ${MAX_FILES} súborov v jednej zmene.` }
          else { await load(a.path); staged.set(a.path, a.content); out = { ok: true } }
        } else if (u.name === 'finish') { fin = a; out = { ok: true } }
        else out = { error: 'Neznámy nástroj.' }
      } catch (e) { out = { error: 'Chyba pri čítaní repozitára: ' + String(e && e.message).slice(0, 120) } }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) })
    }
    msgs.push({ role: 'user', content: results })
  }
  if (!fin) return { ok: false, error: 'AI nedokončila zmenu.' }
  if (fin.needs_db) return { ok: false, error: `Zmena vyžaduje úpravu databázy, ktorú musí spraviť vývojár: ${String(fin.summary || '').slice(0, 400)}` }
  if (!staged.size) return { ok: false, error: `Nevznikla žiadna zmena súborov. ${String(fin.summary || '').slice(0, 300)}` }
  const changed = [...staged.entries()].filter(([p, c]) => !original.get(p) || original.get(p).content !== c)
  if (!changed.length) return { ok: false, error: 'Zmena nič nemení.' }
  return { ok: true, title: String(fin.title || 'Zmena z chatu').slice(0, 120), summary: String(fin.summary || '').slice(0, 1500), risks: String(fin.risks || '').slice(0, 800), staged: new Map(changed), original }
}

/* ---------- životný cyklus: fronta → pull request → kontroly → schválenie ---------- */
const iso = () => new Date().toISOString()
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data }

export async function queueChange(s, { who, name, title, request, transcript }) {
  const t = String(title || '').trim().slice(0, 140), req = String(request || '').trim().slice(0, 3000)
  if (!t || !req) return { ok: false, error: 'Chýba názov alebo popis zmeny.' }
  const open = must(await s.from('billing_changes').select('id').in('status', ['queued', 'working', 'ready']), 'zmeny') || []
  if (open.length >= MAX_OPEN) return { ok: false, error: `Čakajú už ${open.length} návrhy zmien. Najprv ich schváľ alebo zamietni.` }
  const r = await s.from('billing_changes').insert({ requested_by: String(who).toLowerCase(), requested_name: name || null, title: t, request: req, transcript: transcript ? String(transcript).slice(0, 2500) : null }).select('*').single()
  return r.error ? { ok: false, error: r.error.message } : { ok: true, change: r.data }
}

/** Spracuje jednu zmenu zo fronty (volá cron aj okamžité spustenie po zaradení). `admin` = klient so service role. */
export async function processChange(admin, id, { gh, key, fetchImpl = fetch, now = Date.now() } = {}) {
  const claim = await admin.from('billing_changes').update({ status: 'working', started_at: new Date(now).toISOString(), error: null }).eq('id', id).eq('status', 'queued').select('*')
  const row = claim.data && claim.data[0]
  if (!row) return { ok: false, skipped: true }
  const fail = async (error) => { await admin.from('billing_changes').update({ status: 'failed', error: String(error).slice(0, 500) }).eq('id', id); return { ok: false, error } }
  let branch = null
  try {
    const g = await generateChange({ gh, key, request: row.request, transcript: row.transcript || '', fetchImpl })
    if (!g.ok) return await fail(g.error)
    for (const p of g.staged.keys()) if (!isAllowedPath(p)) return await fail('Zmena sa dotýka súboru mimo povoleného okruhu.')
    const baseSha = await gh.refSha()
    branch = `chat/${id.slice(0, 8)}`
    await gh.createBranch(branch, baseSha)
    for (const [path, content] of g.staged) await gh.putFile({ path, content, branch, message: `Vyúčtovanie: ${g.title}`, sha: g.original.get(path) ? g.original.get(path).sha : undefined })
    const body = `${g.summary}\n\n**Riziká:** ${g.risks || 'neuvedené'}\n\nPripravené chatom Pomocník (Vyúčtovanie) na žiadosť: ${row.requested_name || 'člen tímu'}.\n\nPožiadavka:\n> ${row.request.replace(/\n/g, '\n> ')}\n\nNasadenie schvaľuje človek v aplikácii až po zelených testoch a úspešnom Vercel náhľade.`
    const pr = await gh.createPR({ title: `Vyúčtovanie: ${g.title}`, head: branch, body })
    const files = [...g.staged.keys()].map((p) => ({ path: p, status: g.original.get(p) ? 'modified' : 'added', sensitive: isSensitive(p) }))
    await admin.from('billing_changes').update({ status: 'ready', branch, pr_number: pr.number, pr_url: pr.html_url, pr_node: pr.node_id, head_sha: pr.head && pr.head.sha, summary: g.summary, risks: g.risks, files, title: g.title }).eq('id', id)
    return { ok: true, pr: pr.number }
  } catch (e) {
    if (branch) await gh.deleteBranch(branch)
    return await fail('Pull request sa nepodarilo pripraviť: ' + String(e && e.message).slice(0, 200))
  }
}

/** Obnoví stav PR: kontroly (CI), Vercel náhľad, zlúčenie/zatvorenie zvonku. */
export async function refreshChange(admin, row, { gh, now = Date.now() } = {}) {
  if (!row || row.status !== 'ready' || !row.pr_number) return row
  const pr = await gh.getPR(row.pr_number)
  const patch = {}
  if (pr.merged) { patch.status = 'merged'; patch.merged_sha = pr.merge_commit_sha }
  else if (pr.state === 'closed') patch.status = 'rejected'
  const sha = pr.head.sha
  const [runs, st] = await Promise.all([gh.checkRuns(sha).catch(() => []), gh.commitStatus(sha).catch(() => ({ statuses: [] }))])
  const isV = (r) => /vercel/i.test(r.name || '') || /vercel/i.test((r.app && r.app.slug) || '')
  const ciRuns = runs.filter((r) => !isV(r)), vRuns = runs.filter(isV)
  const bad = ciRuns.some((r) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(r.conclusion))
  const done = ciRuns.length > 0 && ciRuns.every((r) => r.status === 'completed')
  const ci = !ciRuns.length ? (now - Date.parse(row.updated_at || row.created_at) > 6 * 60e3 ? 'none' : 'pending') : bad ? 'failure' : done && ciRuns.every((r) => ['success', 'skipped', 'neutral'].includes(r.conclusion)) ? 'success' : 'pending'
  // Vercel náhľad: commit status „Vercel …“ alebo kontrola (check run) Vercelu
  const v = (st.statuses || []).find((x) => /vercel/i.test(x.context))
  const vState = v ? v.state : vRuns.length ? (vRuns.some((r) => ['failure', 'cancelled', 'timed_out'].includes(r.conclusion)) ? 'failure' : vRuns.every((r) => r.status === 'completed' && r.conclusion === 'success') ? 'success' : 'pending') : null
  const vercel = !vState ? 'pending' : vState === 'success' ? 'success' : vState === 'pending' ? 'pending' : 'failure'
  const checks = { ci, vercel, head_sha: sha, mergeable: pr.mergeable, preview: v && v.target_url ? v.target_url : null, ci_runs: ciRuns.map((r) => ({ name: r.name, conclusion: r.conclusion || r.status })), at: new Date(now).toISOString() }
  checks.ready_to_merge = ci === 'success' && vercel === 'success' && pr.mergeable !== false && !pr.draft && !patch.status
  const next = { ...patch, head_sha: sha, checks }
  await admin.from('billing_changes').update(next).eq('id', row.id)
  return { ...row, ...next }
}

/** Schválenie jedným klikom: znova overí oprávnenie, kontroly, súbory v PR a nezmenený commit, potom zlúči (squash). `approver` určuje volajúca akcia z roly. */
export async function approveChange(admin, id, { who, approver, expectedSha, gh }) {
  if (!approver) return { ok: false, error: 'Nasadenie môže schváliť len admin s rolou „Schvaľovateľ zmien kódu“.' }
  const row = must(await admin.from('billing_changes').select('*').eq('id', id).maybeSingle(), 'zmena')
  if (!row || row.status !== 'ready') return { ok: false, error: 'Táto zmena už nečaká na schválenie.' }
  const fresh = await refreshChange(admin, row, { gh })
  if (fresh.status !== 'ready') return { ok: false, error: 'Stav zmeny sa medzitým zmenil. Obnov zoznam.' }
  const c = fresh.checks || {}
  if (!c.ready_to_merge) return { ok: false, error: c.ci === 'failure' ? 'Automatické testy zlyhali, zmenu nemožno nasadiť.' : c.vercel === 'failure' ? 'Náhľad vo Verceli zlyhal.' : 'Kontroly ešte neprebehli. Počkaj na zelené testy a náhľad.' }
  if (!expectedSha || expectedSha !== c.head_sha) return { ok: false, error: 'Zmena sa upravila po tom, ako si ju otvoril. Obnov zoznam a skontroluj ju znova.' }
  const files = await gh.prFiles(row.pr_number)
  if (files.length > MAX_FILES || files.some((f) => !isAllowedPath(f.path))) return { ok: false, error: 'Pull request obsahuje súbory mimo povoleného okruhu. Neschvaľujem.' }
  try { await gh.merge(row.pr_number, { sha: c.head_sha, title: `Vyúčtovanie: ${row.title}` }) } catch (e) { return { ok: false, error: 'Zlúčenie zlyhalo: ' + String(e && e.message).slice(0, 160) } }
  await admin.from('billing_changes').update({ status: 'merged', decided_by: String(who).toLowerCase(), decided_at: iso() }).eq('id', id)
  if (row.branch) await gh.deleteBranch(row.branch)
  return { ok: true }
}
export async function rejectChange(admin, id, { who, approver, gh }) {
  if (!approver) return { ok: false, error: 'Zamietnuť môže len admin s rolou „Schvaľovateľ zmien kódu“.' }
  const row = must(await admin.from('billing_changes').select('*').eq('id', id).maybeSingle(), 'zmena')
  if (!row || !['ready', 'queued', 'failed'].includes(row.status)) return { ok: false, error: 'Túto zmenu už nemožno zamietnuť.' }
  if (row.pr_number) { try { await gh.closePR(row.pr_number) } catch { /* už zatvorený */ } }
  if (row.branch) await gh.deleteBranch(row.branch)
  await admin.from('billing_changes').update({ status: 'rejected', decided_by: String(who).toLowerCase(), decided_at: iso() }).eq('id', id)
  return { ok: true }
}
/** Vrátenie nasadenej zmeny: GitHub pripraví revert PR, ten ide do rovnakého schvaľovania. */
export async function revertChange(admin, id, { who, approver, gh }) {
  if (!approver) return { ok: false, error: 'Vrátiť zmenu môže len admin s rolou „Schvaľovateľ zmien kódu“.' }
  const row = must(await admin.from('billing_changes').select('*').eq('id', id).maybeSingle(), 'zmena')
  if (!row || row.status !== 'merged' || !row.pr_node || row.kind === 'revert') return { ok: false, error: 'Túto zmenu nemožno vrátiť.' }
  const open = must(await admin.from('billing_changes').select('id').in('status', ['queued', 'working', 'ready']), 'zmeny') || []
  if (open.length >= MAX_OPEN) return { ok: false, error: 'Najprv vybav čakajúce návrhy.' }
  const rv = await gh.revertPR(row.pr_node, `Vrátiť: ${row.title}`)
  const files = (await gh.prFiles(rv.number)).map((f) => ({ path: f.path, status: f.status, sensitive: isSensitive(f.path) }))
  if (files.some((f) => !isAllowedPath(f.path))) { try { await gh.closePR(rv.number) } catch { /* nič */ } return { ok: false, error: 'Vrátenie by zasiahlo súbory mimo okruhu.' } }
  const ins = await admin.from('billing_changes').insert({ requested_by: String(who).toLowerCase(), title: `Vrátiť: ${row.title}`, request: `Vrátenie zmeny „${row.title}“`, status: 'ready', kind: 'revert', pr_number: rv.number, pr_url: rv.url, pr_node: rv.id, files, summary: 'Vráti späť predchádzajúcu schválenú zmenu.' }).select('id').single()
  return ins.error ? { ok: false, error: ins.error.message } : { ok: true, id: ins.data.id, pr_url: rv.url }
}
/** Cron: spracuje čakajúce zmeny, obnoví stav pripravených a zruší zaseknuté. */
export async function tickChanges(admin, deps) {
  const out = { processed: 0, refreshed: 0, stuck: 0 }
  const stuck = must(await admin.from('billing_changes').select('id,started_at').eq('status', 'working'), 'zmeny') || []
  for (const r of stuck) if (Date.now() - Date.parse(r.started_at) > 9 * 60e3) { await admin.from('billing_changes').update({ status: 'failed', error: 'Príprava zmeny sa zasekla (časový limit).' }).eq('id', r.id); out.stuck++ }
  const queued = must(await admin.from('billing_changes').select('id').eq('status', 'queued').order('created_at').limit(1), 'zmeny') || []
  for (const q of queued) { const r = await processChange(admin, q.id, deps); if (!r.skipped) out.processed++ }
  const ready = must(await admin.from('billing_changes').select('*').eq('status', 'ready'), 'zmeny') || []
  for (const r of ready) { try { await refreshChange(admin, r, deps) ; out.refreshed++ } catch (e) { console.error('[zmeny] refresh', String(e && e.message).slice(0, 100)) } }
  return out
}
