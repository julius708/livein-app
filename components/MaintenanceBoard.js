const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', timeZone: 'UTC' })

// Servisný prehľad: voľné byty a byty, ktoré sa čoskoro uvoľnia (údaje z rezervácií).
export default function MaintenanceBoard({ free = [], vacating = [], total = 0 }) {
  return (
    <section className="card mt" aria-label="Údržba a voľné byty">
      <h2>🔧 Údržba a voľné byty</h2>
      <p className="mt-sub">Kedy sa dá v byte opravovať: voľné teraz a byty, ktoré sa uvoľnia v najbližších dňoch ({total} nehnuteľností).</p>
      <div className="mt-cols">
        <div>
          <h3>Voľné teraz <b>{free.length}</b></h3>
          {free.length === 0 && <p className="hint">Momentálne nie je voľný žiadny byt.</p>}
          <ul className="mt-l">
            {free.map((x, k) => (
              <li key={k}><span className="n">{x.name}</span><span className="m">{x.city}</span><span className="d">{x.next ? `ďalší príchod ${fmt(x.next)}` : 'bez rezervácie na 14 dní'}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Uvoľnia sa do 3 dní s voľným oknom <b>{vacating.length}</b></h3>
          {vacating.length === 0 && <p className="hint">Nič sa nechystá.</p>}
          <ul className="mt-l">
            {vacating.slice(0, 10).map((x, k) => (
              <li key={k}><span className="n">{x.name}</span><span className="m">{x.city}</span><span className="d">odchod {fmt(x.out)} · {x.next ? `voľné do ${fmt(x.next)}` : 'ďalej voľné'}</span></li>
            ))}
          </ul>
          {vacating.length > 10 && (
            <details className="mt-more"><summary>Zobraziť všetkých {vacating.length}</summary>
              <ul className="mt-l">
                {vacating.slice(10).map((x, k) => (
                  <li key={k}><span className="n">{x.name}</span><span className="m">{x.city}</span><span className="d">odchod {fmt(x.out)} · {x.next ? `voľné do ${fmt(x.next)}` : 'ďalej voľné'}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
      <p className="mt-sub">Nahlásené opravy a škody sú v Asane: <a href="https://app.asana.com/0/1206810423653476/list" target="_blank" rel="noreferrer">Repair and Maintenance</a> · <a href="https://app.asana.com/0/1218054437943454/list" target="_blank" rel="noreferrer">Damages Reporting</a></p>
      <style>{`.mt h3{font-size:15px;margin:14px 0 8px}.mt h3 b{background:#F46D16;color:#fff;border-radius:99px;padding:1px 9px;font-size:13px;margin-left:6px}.mt-sub{color:#6b6866;font-size:14px;margin:4px 0}.mt-cols{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.mt-l{list-style:none;margin:0;padding:0}.mt-l li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0;border-bottom:1px solid #eceae6}.mt-l .n{font-weight:600;color:#363433}.mt-l .m{color:#6b6866;font-size:13px;text-align:right}.mt-l .d{grid-column:1/-1;font-size:13px;color:#363433}.mt-more summary{cursor:pointer;color:#F46D16;font-weight:600;margin-top:8px}.mt a{color:#F46D16}`}</style>
    </section>
  )
}
