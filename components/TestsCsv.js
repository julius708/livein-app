'use client'
import { TESTS } from '@/lib/personality-tests'

/** Export všetkých výsledkov do CSV (len admin). Bunky začínajúce =+-@ sa chránia pred vzorcami. */
export default function CsvButton({ rows }) {
  const download = () => {
    const head = ['meno', 'email', 'test', 'vysledok', 'skore', 'zdielane', 'datum']
    const body = rows.map((r) => [r.name, r.email, TESTS[r.test_key] ? TESTS[r.test_key].title : r.test_key, r.summary, JSON.stringify(r.scores), r.shared ? 'ano' : 'nie', r.created_at])
    const csv = '﻿' + [head, ...body].map((row) => row.map((c) => { c = String(c == null ? '' : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"' }).join(',')).join('\n')
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const l = document.createElement('a'); l.href = u; l.download = 'vysledky-testov.csv'; l.click(); URL.revokeObjectURL(u)
  }
  return <button type="button" className="li-shortcut" onClick={download}>⬇️ Export CSV</button>
}
