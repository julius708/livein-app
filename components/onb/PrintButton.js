'use client'
export default function PrintButton({ label = '🖨️ Uložiť ako PDF' }) { return <button type="button" className="btn" onClick={() => window.print()}>{label}</button> }
