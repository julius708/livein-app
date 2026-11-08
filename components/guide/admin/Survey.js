'use client'
import { useActionState } from 'react'
import { saveSurveySettingsAction } from '@/app/sprievodca/actions'
import { QUESTIONS, SURVEY } from '@/lib/guide/survey'

/** Prehľad odpovedí (profil zákazníkov) a nastavenie darčeka. */
export default function Survey({ rows = [], settings = {}, isAdmin = false }) {
  const [st, act, pending] = useActionState(saveSurveySettingsAction, null)
  const sk = SURVEY.sk
  const g = settings.gift || {}
  const n = rows.length
  const counts = {}
  for (const q of QUESTIONS) { if (q.type === 'text') continue; counts[q.id] = {}; for (const r of rows) { const v = r.answers && r.answers[q.id]; if (v == null) continue; for (const x of Array.isArray(v) ? v : [v]) counts[q.id][x] = (counts[q.id][x] || 0) + 1 } }
  const langs = {}; for (const r of rows) langs[r.lang] = (langs[r.lang] || 0) + 1
  const countries = {}; for (const r of rows) { const c = r.answers && r.answers.country; if (c) countries[c.trim().toLowerCase()] = (countries[c.trim().toLowerCase()] || 0) + 1 }
  const rec = rows.map((r) => r.answers && r.answers.recommend).filter(Boolean)
  const Bar = ({ label, v }) => <div className="row" style={{ gap: 8 }}><span style={{ flex: '0 0 220px', fontSize: 13.5 }}>{label}</span><span style={{ flex: 1, background: '#173e2c12', borderRadius: 6, overflow: 'hidden', height: 14 }}><span style={{ display: 'block', height: '100%', width: `${n ? Math.round((v / n) * 100) : 0}%`, background: '#F46D16' }} /></span><b style={{ width: 48, textAlign: 'right', fontSize: 13 }}>{v}</b></div>
  return (
    <div className="sp-grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(300px,2fr)' }}>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Odpovede ({n})</h2><a className="btn line" href="/sprievodca/dotaznik/csv">Stiahnuť CSV</a></div>
        {n === 0 && <p className="hint">Zatiaľ žiadne odpovede. Dotazník je v sprievodcovi každého bytu (karta „Pomôžte nám vás spoznať“).</p>}
        {n > 0 && <>
          <p className="hint">Priemerné odporúčanie: <b>{rec.length ? (rec.reduce((a, b) => a + b, 0) / rec.length).toFixed(2) : '–'}</b> z 5 ({rec.length} hodnotení) · jazyky: {Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} ${c}`).join(', ')}</p>
          {QUESTIONS.filter((q) => q.type !== 'text').map((q) => <div key={q.id} style={{ marginTop: 12 }}><h3 style={{ margin: '0 0 6px' }}>{sk.q[q.id]}</h3>{(q.options || Array.from({ length: 5 }, (_, i) => i + 1)).map((o) => <Bar key={o} label={sk.o[o] || String(o)} v={counts[q.id][o] || 0} />)}</div>)}
          <h3 style={{ marginTop: 12 }}>Odkiaľ (najčastejšie)</h3><p className="hint">{Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([c, k]) => `${c} (${k})`).join(', ') || '–'}</p>
          <h3 style={{ marginTop: 12 }}>Posledné odkazy</h3>{rows.filter((r) => r.answers && r.answers.comment).slice(0, 20).map((r) => <p key={r.id} style={{ margin: '4px 0' }}>„{r.answers.comment}“ <small className="hint">{r.lang} · {new Date(r.created_at).toLocaleDateString('sk-SK')}</small></p>)}
        </>}
      </section>
      <section className="card">
        <h2>Darček a nastavenie</h2>
        <p className="hint">Darček má byť bez nákladov, ale s hodnotou: zľavový kód na priamu rezerváciu alebo digitálny darček (odkaz, napr. PDF sprievodca mestom). Zobrazí sa až po odoslaní dotazníka, v jazyku hosťa.</p>
        {!isAdmin && <p className="hint">Mení len admin. Stav: dotazník {settings.enabled === false ? 'vypnutý' : 'zapnutý'}, darček {g.enabled ? `zapnutý (${g.kind === 'link' ? 'odkaz' : `kód ${g.code}, ${g.value}`})` : 'vypnutý'}.</p>}
        {isAdmin && <form action={act} className="form">
          <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="enabled" defaultChecked={settings.enabled !== false} /> Dotazník zapnutý</label>
          <label className="row" style={{ display: 'flex' }}><input type="checkbox" name="gift_enabled" defaultChecked={!!g.enabled} /> Darček zapnutý</label>
          <label>Typ darčeka<select name="gift_kind" defaultValue={g.kind || 'code'}><option value="code">zľavový kód na priamu rezerváciu</option><option value="link">digitálny darček (odkaz)</option></select></label>
          <div className="two"><label>Kód<input type="text" name="gift_code" defaultValue={g.code || ''} placeholder="LIVEIN10" /></label><label>Hodnota (text)<input type="text" name="gift_value" defaultValue={g.value || ''} placeholder="10 %" /></label></div>
          <label>Odkaz (rezervačný portál alebo digitálny darček)<input type="url" name="gift_url" defaultValue={g.url || 'https://booking.live-in.international'} /></label>
          <label>Interná poznámka<input type="text" name="gift_note" defaultValue={g.note || ''} /></label>
          {st && !st.ok && <p className="err">{st.error}</p>}{st && st.ok && <p className="okmsg">Uložené.</p>}
          <button className="btn" disabled={pending}>Uložiť</button>
        </form>}
      </section>
    </div>
  )
}
