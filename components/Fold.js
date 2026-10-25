/** Na telefóne zbalená sekcia s nadpisom na rozkliknutie; na počítači je obsah vždy zobrazený (čisté CSS, bez JS). */
export default function Fold({ id, title, hint, open = false, children }) {
  return (
    <div className="fold">
      <input type="checkbox" id={`fold-${id}`} className="fold-t" defaultChecked={open} />
      <label htmlFor={`fold-${id}`} className="fold-h"><span>{title}{hint ? <small>{hint}</small> : null}</span><i aria-hidden="true">⌄</i></label>
      <div className="fold-b">{children}</div>
    </div>
  )
}
