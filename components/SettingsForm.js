'use client'
import { useActionState } from 'react'
import { saveSettings } from '@/app/admin/settings/actions'

export default function SettingsForm({ modules, urls, auth }) {
  const [state, action, pending] = useActionState(saveSettings, null)
  return (
    <form action={action}>
      <section className="card">
        <h2>Adresy modulov</h2>
        <p className="sub">Keď má modul adresu, zobrazí sa ľuďom s príslušnou rolou ako aktívna dlaždica na domovskej obrazovke. Bez adresy je v časti „Pripravujeme“.</p>
        <div className="urls">
          {modules.map((m) => (
            <div className="url" key={m.id}>
              <div className="ic" aria-hidden="true">{m.icon}</div>
              <div>
                <div className="t">{m.title}</div>
                <div className="d">{m.desc}</div>
                <input className="f sm" name={`url-${m.id}`} defaultValue={urls[m.id] || ''} placeholder="https://…" inputMode="url" autoComplete="off" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Prihlásenie</h2>
        <p className="sub">E-mailový odkaz funguje vždy. Google tlačidlo zapni až po nastavení poskytovateľa Google v Supabase (Authentication → Providers), inak by ľuďom ukazovalo chybu.</p>
        <label className="lb" htmlFor="defpw">Dočasné heslo pre nových ľudí a reset</label>
        <input id="defpw" className="f" name="default_password" defaultValue={auth.default_password || 'livein'} minLength={6} required autoComplete="off" style={{ maxWidth: 320, marginBottom: 14 }} />
        <label className="switch">
          <input type="checkbox" name="google" defaultChecked={!!auth.google} />
          <span><b>Tlačidlo „Pokračovať cez Google“</b><small>Zobrazí sa na prihlasovacej stránke.</small></span>
        </label>
      </section>

      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Ukladám…' : 'Uložiť nastavenia'}</button>
        {state && state.ok && <span className="msg ok" style={{ marginTop: 0 }}>Uložené ✓</span>}
        {state && !state.ok && <span className="msg err" style={{ marginTop: 0 }}>{state.error}</span>}
      </div>
    </form>
  )
}
