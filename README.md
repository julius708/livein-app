# LIVE-IN super appka (livein-app)

Zdroj appky app.live-in.international (Next.js 15, App Router, JavaScript). Nasadenie: Vercel projekt
`livein-app` v tíme Pracovna APP je napojený na tento repozitár, vetva `main` = produkcia.

Pravidlo: nasadzuje sa len commitom do `main`. Nikdy nie cez `vercel deploy` zo súborov,
prepísalo by to novšiu produkciu.

Premenné prostredia (nastavuje Július vo Verceli): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.

Lokálne: `pnpm install`, `pnpm dev`. Overenie pred commitom: `pnpm build`.
