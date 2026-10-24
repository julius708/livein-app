'use client'
export default function Error({ error, reset }) {
  return (
    <div className="center">
      <div>
        <h2>Niečo sa pokazilo</h2>
        <p className="sub" style={{ marginTop: 8 }}>Skús to znova. Ak sa to opakuje, napíš Júliusóvi.</p>
        <button className="btn" onClick={() => reset()}>Skúsiť znova</button>
        {error && error.digest && <p className="hint" style={{ marginTop: 14 }}>Kód: <code>{error.digest}</code></p>}
      </div>
    </div>
  )
}
