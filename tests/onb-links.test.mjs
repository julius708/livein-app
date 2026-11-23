// Zaradenie bytov je súčasť hlavnej appky: interné odkazy a revalidácie majú predponu /zaradenie, webhook Higgsfieldu je verejný a smeruje na hlavnú doménu.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = [...walk('app/zaradenie'), ...walk('components/onb')].filter((f) => f.endsWith('.js'))

test('odkazy a presmerovania v Zaradení majú predponu /zaradenie', () => {
  const bad = []
  for (const f of files) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/(?:href=\{?|redirect\(|revalidatePath\()[`"']\/(?!zaradenie\b)([^`"'\s}]*)/g)) bad.push(`${f}: /${m[1]}`)
  }
  assert.deepEqual(bad, [])
})
test('webhook Higgsfieldu: verejná cesta a adresa na hlavnej doméne', () => {
  assert.match(readFileSync('middleware.js', 'utf8'), /'\/zaradenie\/api\/hf\/webhook'/)
  const actions = readFileSync('app/zaradenie/[id]/dizajn/actions.js', 'utf8')
  assert.match(actions, /https:\/\/app\.live-in\.international\/zaradenie\/api\/hf\/webhook/)
  assert.doesNotMatch(actions, /livein-zaradenie\.vercel\.app/)
})
test('Zaradenie používa spoločné prihlásenie hlavnej appky', () => {
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /@supabase\/ssr|lib\/supabase'/, f)
})
