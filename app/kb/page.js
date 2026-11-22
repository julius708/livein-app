import Link from 'next/link'
import KbShell from '@/components/kb/KbShell'
import Tile from '@/components/kb/Tile'
import { requireTeam, STATUS, fmtD } from '@/lib/kb-viewer'

export const dynamic = 'force-dynamic'
const KIND = { sop: 'SOP', mapa: 'Mapa', faq: 'FAQ', doc: 'Dokument' }
const href = (r) => r.kind === 'sop' ? `/kb/sop/${r.id}` : r.kind === 'mapa' ? `/kb/mapy/${r.id}` : r.kind === 'faq' ? `/kb/faq#q${r.id}` : `/kb/dokumenty/${r.id.split('/').map(encodeURIComponent).join('/')}`

export default async function Home({ searchParams }) {
  const sp = await searchParams
  const q = String(sp?.q || '').trim()
  const kind = String(sp?.typ || '')
  const { s, me } = await requireTeam()
  let results = [], error = ''
  if (q.length >= 2) {
    const { data, error: e } = await s.rpc('kb_search', { q, lim: 60 })
    if (e) error = e.message; else results = (data || []).filter((r) => !kind || r.kind === kind)
  }
  const counts = {}
  for (const r of results) counts[r.kind] = (counts[r.kind] || 0) + 1
  return (
    <KbShell active="home" intro={{ eyebrow: 'Jedno miesto pre tím', title: 'Čo hľadáš?', text: 'SOP, FAQ, dokumenty a mapy problémov. Hľadá aj bez diakritiky.' }}>
      <form className="search-big" action="/kb" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="napr. kúrenie, city tax, neskorý check-out, parkovanie…" aria-label="Hľadať" autoFocus />
        <button className="btn" type="submit">Hľadať</button>
      </form>
      {q.length >= 2 && (
        <>
          <div className="filters">
            <Link className={!kind ? 'on' : ''} href={`/kb?q=${encodeURIComponent(q)}`}>Všetko ({results.length})</Link>
            {['sop', 'mapa', 'faq', 'doc'].map((k) => <Link key={k} className={kind === k ? 'on' : ''} href={`/kb?q=${encodeURIComponent(q)}&typ=${k}`}>{KIND[k]} ({counts[k] || 0})</Link>)}
          </div>
          {error && <p className="msg err">{error}</p>}
          {!error && results.length === 0 && <p className="hint" style={{ marginTop: 14 }}>Nič sa nenašlo. Skús iné slovo alebo kratší výraz.</p>}
          <ul className="results">
            {results.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link href={href(r)}>
                  <span className={`kind ${r.kind}`}>{KIND[r.kind]}</span>
                  <b>{r.title}</b>
                  <span className="st">{STATUS[r.status] || r.status || ''}{r.updated_at ? ` · ${fmtD(r.updated_at)}` : ''}</span>
                  {r.kind === 'doc' ? <p dangerouslySetInnerHTML={{ __html: r.snippet }} /> : <p>{r.snippet}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {q.length < 2 && (
        <div className="tiles" style={{ marginTop: 22 }}>
          <Tile href="/kb/sop" icon="📘" title="SOP a postupy" desc="Schválené postupy, verzie a termíny kontroly." />
          <Tile href="/kb/mapy" icon="🧭" title="Mapy problémov" desc="Čo robiť krok za krokom, keď hosť nahlási problém." />
          <Tile href="/kb/faq" icon="💬" title="FAQ pre hostí" desc="Odpovede na najčastejšie otázky hostí." />
          <Tile href="/kb/dokumenty" icon="📂" title="Dokumenty" desc="Firemná báza, karty bytov a podklady z Drive." />
          <Tile href="/kb/poucenia" icon="💡" title="Poučenia" desc="Čo sa stalo a čo zmeniť, podklad pre úpravy SOP." />
        </div>
      )}
    </KbShell>
  )
}
