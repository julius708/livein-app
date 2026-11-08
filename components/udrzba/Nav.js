export default function UdrzbaNav({ active = 'cases', pilot }) {
  const items = [['cases', '/udrzba', 'Prípady'], ['vendors', '/udrzba/dodavatelia', 'Dodávatelia'], ['settings', '/udrzba/nastavenia', 'Nastavenia bytov a pilotu'], ['dash', '/udrzba/prehlad', 'Prehľad hovorov']]
  return (
    <div className="ud-head">
      <div><h1>🔧 Údržba a hlas (pilot)</h1><p className="hint">Hlásenie → triáž → dopyty → ponuky → súhlas majiteľa → objednávka → doklady → uzavretie.</p></div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
        <nav className="ud-nav">{items.map(([id, href, label]) => <a key={id} href={href} className={active === id ? 'on' : ''}>{label}</a>)}</nav>
        {pilot && <span className={`ud-pilot${pilot.enabled ? ' on' : ''}`}>{pilot.enabled ? 'Pilot zapnutý' : 'Pilot vypnutý: nič sa neposiela ani nevolá'}{pilot.test_mode !== false ? ` · test režim (${(pilot.allowed_emails || []).length} adries, ${(pilot.allowed_phones || []).length} čísel)` : ' · ostrá prevádzka'}</span>}
      </div>
    </div>
  )
}
