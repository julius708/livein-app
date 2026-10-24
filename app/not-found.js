export default function NotFound() {
  return (
    <div className="center">
      <div>
        <h2>Táto stránka neexistuje</h2>
        <p className="sub" style={{ marginTop: 8 }}>Možno bola presunutá alebo má preklep v adrese.</p>
        <a className="btn" href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>Na domov</a>
      </div>
    </div>
  )
}
