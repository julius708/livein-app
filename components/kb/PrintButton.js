'use client'
/** Export PDF: otvorí tlač prehliadača, kde sa dokument uloží ako PDF (tlačový štýl skryje navigáciu). */
export default function PrintButton({ label = 'Export PDF' }) {
  return <button type="button" className="btn" onClick={() => window.print()}>{label}</button>
}
