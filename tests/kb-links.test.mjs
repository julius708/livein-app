// Znalostná báza je súčasť hlavnej appky: všetky interné odkazy a revalidácie musia mať predponu /kb.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = [...walk('app/kb'), ...walk('components/kb')].filter((f) => f.endsWith('.js'))

test('odkazy a presmerovania v znalostnej báze majú predponu /kb', () => {
  const bad = []
  for (const f of files) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/(?:href=\{?|redirect\(|revalidatePath\(|action=)[`"']\/(?!kb\b)([^`"'\s}]*)/g)) bad.push(`${f}: /${m[1]}`)
    for (const m of s.matchAll(/`\/(sop|mapy|faq|dokumenty|poucenia)[/#?`$]/g)) bad.push(`${f}: ${m[0]}`)
  }
  assert.deepEqual(bad, [])
})
test('znalostná báza používa spoločné prihlásenie hlavnej appky, nie vlastný klient', () => {
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /@supabase\/ssr|lib\/supabase'/, f)
})
