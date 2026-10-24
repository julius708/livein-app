export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Načítavam">
      <div className="skel" style={{ height: 56, marginTop: 0, borderRadius: 0, marginLeft: -20, marginRight: -20 }} />
      <div className="skel" style={{ height: 190, marginTop: 22 }} />
      <div className="stats"><div className="skel" style={{ height: 84 }} /><div className="skel" style={{ height: 84 }} /><div className="skel" style={{ height: 84 }} /></div>
      <div className="tiles"><div className="skel" style={{ height: 150 }} /><div className="skel" style={{ height: 150 }} /><div className="skel" style={{ height: 150 }} /></div>
    </div>
  )
}
