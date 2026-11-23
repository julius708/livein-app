/** Jednoduché vykreslenie Markdownu (nadpisy, odrážky, číslované zoznamy, tučné, odkazy, odseky) bez knižnice. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\[OVERIŤ\]/g, '<mark class="overit">OVERIŤ</mark>')
    .replace(/\[DOPLNIŤ\]/g, '<mark class="doplnit">DOPLNIŤ</mark>')
}
export function mdToHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n')
  let out = '', list = null, para = []
  const flushP = () => { if (para.length) { out += `<p>${inline(para.join(' '))}</p>`; para = [] } }
  const flushL = () => { if (list) { out += `</${list}>`; list = null } }
  for (const raw of lines) {
    const l = raw.trimEnd()
    const h = l.match(/^(#{1,4})\s+(.*)/)
    if (h) { flushP(); flushL(); out += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`; continue }
    const ul = l.match(/^\s*[-*]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/)
    if (ul || ol) { flushP(); const t = ul ? 'ul' : 'ol'; if (list !== t) { flushL(); out += `<${t}>`; list = t } out += `<li>${inline((ul || ol)[1])}</li>`; continue }
    if (l.startsWith('>')) { flushP(); flushL(); out += `<blockquote>${inline(l.slice(1).trim())}</blockquote>`; continue }
    if (!l.trim()) { flushP(); flushL(); continue }
    flushL(); para.push(l.trim())
  }
  flushP(); flushL()
  return out
}
