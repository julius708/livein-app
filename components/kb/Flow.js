const LBL = { s: 'Začiatok', a: 'Krok', q: 'Rozhodnutie', d: 'Doplniť', e: 'Eskalácia', ok: 'Výsledok' }

function Node({ n, br }) {
  return (
    <div className={`fnode ${n.k}${br ? ' br' : ''}`}>
      {n.k !== 's' && n.k !== 'ok' && <b>{LBL[n.k]}</b>}
      {n.t}
      {n.n && <small>{n.n}</small>}
    </div>
  )
}

/** Zvislá mapa problému: uzly pod sebou, rozhodnutia s vetvami Áno/Nie vedľa. */
export default function Flow({ nodes = [] }) {
  return (
    <div className="flow">
      {nodes.map((n, i) => (
        <div key={i} className="frow-wrap">
          {i > 0 && <div className="farr" aria-hidden="true">{nodes[i - 1].k === 'q' && nodes[i - 1].no ? <i>{nodes[i - 1].no}</i> : null}</div>}
          <div className="frow">
            <Node n={n} />
            {n.k === 'q' && (n.br || []).map((b, j) => <div key={j}><div className="flbl">{b.l}</div><Node n={b} br /></div>)}
          </div>
        </div>
      ))}
    </div>
  )
}
