// Vektorový PDF štítok 150 × 105 mm v brandových farbách webu live-in.international: tmavozelený panel s logom a privítaním
// (gradient 1b4a35 → 12301f ako na webe), krémová plocha (f7f7f2) s ilustráciou a dvoma kartami s QR kódmi, oranžový akcent (F46D16).
// QR nesú iba trvalé HTTPS odkazy s verejným kódom bytu. Varianty: 'standard' (tmavé QR v bielej karte) a 'inverted' (biele QR
// v zelenej karte). Ilustrácia (lib/guide/art/label-art.png, vygenerovaná v Higgsfield podľa brandu) je voliteľná: bez nej sa
// vykreslí dekoratívna geometria v rovnakých farbách. Skúšobný hárok A4 má oba varianty.
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import { guideUrl, reviewUrl, TEMPLATE_VERSION } from './core.js'

const MM = 72 / 25.4
export const LABEL = { w: 150 * MM, h: 105 * MM }
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const C = { green: '#173e2c', greenLight: '#1b4a35', greenDark: '#12301f', orange: '#F46D16', cream: '#f7f7f2', ink: '#202522', muted: '#69655f', line: '#e8ece4', sage: '#bacbbd', white: '#ffffff' }
const GREEN = hex(C.green), WHITE = hex(C.white), INK = hex(C.ink), ORANGE = hex(C.orange), CREAM = hex(C.cream), MUTED = hex(C.muted), LINE = hex(C.line), SAGE = hex(C.sage)
const fontDir = path.join(process.cwd(), 'lib', 'guide', 'fonts')
const artPath = path.join(process.cwd(), 'lib', 'guide', 'art', 'label-art.png')
const read = (p) => fs.readFileSync(p)

async function fonts(doc) {
  doc.registerFontkit(fontkit)
  const reg = await doc.embedFont(read(path.join(fontDir, 'Figtree-Regular.ttf')), { subset: true })
  const bold = await doc.embedFont(read(path.join(fontDir, 'Figtree-Bold.ttf')), { subset: true })
  return { reg, bold }
}
async function logo(doc) { return doc.embedPng(read(path.join(process.cwd(), 'public', 'logo.png'))) }
async function art(doc) { try { return fs.existsSync(artPath) ? await doc.embedPng(read(artPath)) : null } catch { return null } }

/** QR ako vektorové štvorčeky. Vracia popis vykreslenia (testovateľný) a kreslí. */
export function qrModules(text) {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = q.modules.size, data = q.modules.data
  const dark = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) dark.push([x, y])
  return { size: n, dark }
}
function drawQr(page, text, x, y, size, color, quiet = 4) {
  const { size: n, dark } = qrModules(text)
  const cell = size / (n + quiet * 2)
  const ox = x + quiet * cell, oy = y + size - quiet * cell
  for (const [cx, cy] of dark) page.drawRectangle({ x: ox + cx * cell, y: oy - (cy + 1) * cell, width: cell + 0.15, height: cell + 0.15, color })
  return { modules: n, cell }
}
function fit(font, text, size, maxW) { let s = size; while (s > 6 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5; return s }
/** Zaoblený obdĺžnik (pdf-lib nemá natívne zaoblenie: dva obdĺžniky + štyri kruhy). */
function roundRect(page, { x, y, w, h, r, color, borderColor, borderWidth = 0 }) {
  const opts = borderColor ? { borderColor, borderWidth } : {}
  page.drawRectangle({ x: x + r, y, width: w - 2 * r, height: h, color, ...opts })
  page.drawRectangle({ x, y: y + r, width: w, height: h - 2 * r, color, ...opts })
  for (const [cx, cy] of [[x + r, y + r], [x + w - r, y + r], [x + r, y + h - r], [x + w - r, y + h - r]]) page.drawCircle({ x: cx, y: cy, size: r, color, ...opts })
  if (borderColor) { // prekryť vnútorné okraje, aby zostal len vonkajší rám
    page.drawRectangle({ x: x + r, y: y + borderWidth, width: w - 2 * r, height: h - 2 * borderWidth, color })
    page.drawRectangle({ x: x + borderWidth, y: y + r, width: w - 2 * borderWidth, height: h - 2 * r, color })
  }
}
/** Vertikálny gradient z pásikov (pdf-lib nemá gradienty); 48 pásikov je pri tlači plynulé. */
function gradientRect(page, { x, y, w, h, from, to, bands = 48 }) {
  const a = [parseInt(from.slice(1, 3), 16), parseInt(from.slice(3, 5), 16), parseInt(from.slice(5, 7), 16)]
  const b = [parseInt(to.slice(1, 3), 16), parseInt(to.slice(3, 5), 16), parseInt(to.slice(5, 7), 16)]
  const bh = h / bands
  for (let i = 0; i < bands; i++) { const t = i / (bands - 1); const c = a.map((v, k) => (v + (b[k] - v) * t) / 255); page.drawRectangle({ x, y: y + h - (i + 1) * bh, width: w, height: bh + 0.3, color: rgb(c[0], c[1], c[2]) }) }
}

/** Rozloženie štítku (čisté dáta, testuje sa, že pod logom nie je biela plocha a QR nezasahujú do loga). */
export function labelLayout({ variant = 'standard' } = {}) {
  const { w, h } = LABEL, pad = 6 * MM
  const panelW = 56 * MM, qr = 28 * MM, cardPad = 3 * MM
  const right = { x: panelW, w: w - panelW }
  const cardW = (right.w - 2 * pad - 5 * MM) / 2, cardH = qr + 2 * cardPad + 12 * MM
  const cardY = pad + 4 * MM
  const cards = [
    { key: 'guide', x: right.x + pad, title: { sk: 'Wi-Fi a sprievodca bytom', en: 'Wi-Fi & apartment guide' }, steps: { sk: 'Naskenujte · meno a e-mail · heslo', en: 'Scan · name & e-mail · password' } },
    { key: 'review', x: right.x + pad + cardW + 5 * MM, title: { sk: 'Vaša spätná väzba', en: 'Your feedback' }, steps: { sk: 'Naskenujte · 30 sekúnd · ďakujeme', en: 'Scan · 30 seconds · thank you' } },
  ].map((c) => ({ ...c, y: cardY, w: cardW, h: cardH }))
  const inverted = variant === 'inverted'
  return {
    variant, canvas: { color: 'cream' },
    bg: { x: 0, y: 0, w: panelW, h, color: 'green' },
    logo: { x: pad + 1 * MM, y: h - pad - 11 * MM, w: 30 * MM, h: 13.2 * MM, background: 'none' },
    welcome: { x: pad + 1 * MM, y: h - pad - 24 * MM },
    address: { x: pad + 1 * MM, y: h - pad - 40 * MM, maxW: panelW - 2 * pad - 2 * MM },
    support: { x: pad + 1 * MM, y: pad + 2 * MM, w: panelW - 2 * pad - 2 * MM, h: 12.5 * MM },
    art: { x: right.x, y: cardY + cardH + 4 * MM, w: right.w, h: h - (cardY + cardH + 4 * MM) },
    qrs: cards.map((c) => ({ key: c.key, x: c.x + (c.w - qr) / 2, y: c.y + cardPad + 1 * MM, size: qr, box: { pad: cardPad, color: inverted ? 'green' : 'white', radius: 2.5 * MM, x: c.x, y: c.y, w: c.w, h: c.h }, modules: inverted ? 'white' : 'ink', title: c.title, steps: c.steps })),
    code: { x: w - pad, y: pad - 1.5 * MM },
  }
}

async function drawLabel(doc, page, { address, name, code, supportPhone, baseUrl, variant, sample }, f, img, artImg) {
  const L = labelLayout({ variant })
  const { w, h } = LABEL
  const inverted = L.variant === 'inverted'
  // krémové plátno + zelený panel s gradientom ako na webe
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: CREAM })
  gradientRect(page, { x: L.bg.x, y: 0, w: L.bg.w, h, from: C.greenLight, to: C.greenDark })
  // jemná dekoratívna geometria panelu (šalviové a oranžové kruhy s nízkou krytím)
  page.drawCircle({ x: L.bg.w - 4 * MM, y: 20 * MM, size: 22 * MM, color: SAGE, opacity: 0.08 })
  page.drawCircle({ x: 10 * MM, y: 48 * MM, size: 9 * MM, color: ORANGE, opacity: 0.16 })
  // logo priamo na zelenej: žiadny biely obdĺžnik ani rám
  const lw = L.logo.w, lh = (lw * img.height) / img.width
  page.drawImage(img, { x: L.logo.x, y: h - 6 * MM - lh, width: lw, height: lh })
  // privítanie
  page.drawText('Vitajte', { x: L.welcome.x, y: L.welcome.y, size: 21, font: f.bold, color: WHITE })
  page.drawText('Welcome', { x: L.welcome.x, y: L.welcome.y - 13, size: 11.5, font: f.reg, color: SAGE })
  page.drawRectangle({ x: L.welcome.x, y: L.welcome.y - 20, width: 9 * MM, height: 1.1 * MM, color: ORANGE })
  // názov a adresa bytu
  const line1 = String(name || '').trim(), line2 = String(address || '').trim()
  let y = L.address.y
  if (line1) { const s = fit(f.bold, line1, 12.5, L.address.maxW); page.drawText(line1, { x: L.address.x, y, size: s, font: f.bold, color: WHITE }); y -= s + 4 }
  if (line2) { const words = line2.split(/,\s*/); let cur = ''; const lines = []; for (const wd of words) { const t = cur ? cur + ', ' + wd : wd; if (f.reg.widthOfTextAtSize(t, 9) > L.address.maxW && cur) { lines.push(cur); cur = wd } else cur = t } if (cur) lines.push(cur); for (const ln of lines.slice(0, 3)) { page.drawText(ln, { x: L.address.x, y, size: 9, font: f.reg, color: hex('#d9e2db') }); y -= 12 } }
  if (sample) { const t = 'UKÁŽKA / SAMPLE'; page.drawText(t, { x: L.address.x, y: y - 4, size: 8, font: f.bold, color: ORANGE }) }
  // podpora: oranžová pilulka
  const sp = L.support
  roundRect(page, { x: sp.x, y: sp.y, w: sp.w, h: sp.h, r: sp.h / 2, color: ORANGE })
  const supT = 'Pomoc / Help'
  page.drawText(supT, { x: sp.x + 4 * MM, y: sp.y + sp.h - 4.6 * MM, size: 7, font: f.reg, color: WHITE })
  const ps = fit(f.bold, String(supportPhone || ''), 10.5, sp.w - 8 * MM)
  page.drawText(String(supportPhone || ''), { x: sp.x + 4 * MM, y: sp.y + 2.8 * MM, size: ps, font: f.bold, color: WHITE })
  // ilustrácia (Higgsfield, brandové farby) alebo náhradná geometria
  const A = L.art
  if (artImg) {
    // vyplniť plochu pri zachovaní pomeru strán (orez výškou), s krémovým prechodom pod ňou
    const scale = Math.max(A.w / artImg.width, A.h / artImg.height)
    const iw = artImg.width * scale, ih = artImg.height * scale
    page.drawImage(artImg, { x: A.x + (A.w - iw) / 2, y: A.y + (A.h - ih) / 2, width: iw, height: ih })
    page.drawRectangle({ x: A.x, y: A.y, width: A.w, height: 2.5 * MM, color: CREAM, opacity: 0.9 })
  } else {
    page.drawCircle({ x: A.x + A.w * 0.72, y: A.y + A.h * 0.55, size: 14 * MM, color: SAGE, opacity: 0.35 })
    page.drawCircle({ x: A.x + A.w * 0.3, y: A.y + A.h * 0.6, size: 7 * MM, color: ORANGE, opacity: 0.25 })
    page.drawRectangle({ x: A.x + 8 * MM, y: A.y + 4 * MM, width: A.w - 16 * MM, height: 0.6 * MM, color: LINE })
  }
  // karty s QR
  const urls = { guide: guideUrl(baseUrl, code), review: reviewUrl(baseUrl, code) }
  for (const q of L.qrs) {
    const b = q.box
    roundRect(page, { x: b.x, y: b.y, w: b.w, h: b.h, r: b.radius, color: inverted ? GREEN : WHITE, borderColor: inverted ? undefined : LINE, borderWidth: 0.8 })
    page.drawRectangle({ x: b.x + b.pad, y: b.y + b.h - 1.2 * MM - 1.5 * MM, width: 10 * MM, height: 1.2 * MM, color: ORANGE })
    const tx = b.x + b.pad, tw = b.w - 2 * b.pad
    const ts = fit(f.bold, q.title.sk, 9, tw)
    page.drawText(q.title.sk, { x: tx, y: b.y + b.h - 7 * MM, size: ts, font: f.bold, color: inverted ? WHITE : INK })
    page.drawText(q.title.en, { x: tx, y: b.y + b.h - 10.6 * MM, size: fit(f.reg, q.title.en, 7.5, tw), font: f.reg, color: inverted ? SAGE : MUTED })
    drawQr(page, urls[q.key], q.x, q.y + 2.5 * MM, q.size, q.modules === 'ink' ? INK : WHITE, 0)
    page.drawText(q.steps.sk, { x: tx, y: b.y + 1.8 * MM + 7, size: fit(f.reg, q.steps.sk, 6.2, tw), font: f.reg, color: inverted ? SAGE : MUTED })
    page.drawText(q.steps.en, { x: tx, y: b.y + 1.8 * MM, size: fit(f.reg, q.steps.en, 6.2, tw), font: f.reg, color: inverted ? SAGE : MUTED })
  }
  // kód bytu a verzia (malé, vpravo dole)
  const ct = `Kód bytu / Code: ${code}   ·   v${TEMPLATE_VERSION}`
  page.drawText(ct, { x: L.code.x - f.reg.widthOfTextAtSize(ct, 6), y: L.code.y, size: 6, font: f.reg, color: MUTED })
  return urls
}

/** Jeden štítok (PDF bytes). */
export async function renderLabel(opts) {
  const doc = await PDFDocument.create()
  doc.setTitle(`LIVE-IN štítok ${opts.code}`); doc.setProducer('LIVE-IN Super App'); doc.setCreator('LIVE-IN Super App')
  const f = await fonts(doc), img = await logo(doc), a = await art(doc)
  const page = doc.addPage([LABEL.w, LABEL.h])
  const urls = await drawLabel(doc, page, { variant: 'standard', ...opts }, f, img, a)
  return { bytes: await doc.save(), urls }
}
/** Skúšobný hárok A4: oba varianty (biele QR v zelených kartách, štandardný kontrast) s orezovými značkami. */
export async function renderTestSheet(opts) {
  const doc = await PDFDocument.create()
  doc.setTitle('LIVE-IN skúšobný hárok štítkov'); doc.setProducer('LIVE-IN Super App')
  const f = await fonts(doc)
  const A4 = [595.28, 841.89], page = doc.addPage(A4)
  const x = (A4[0] - LABEL.w) / 2
  const slots = [{ y: A4[1] - 60 - LABEL.h, variant: 'inverted', label: 'Variant A: biele QR v zelených kartách (invertované)' }, { y: A4[1] - 60 - 2 * LABEL.h - 70, variant: 'standard', label: 'Variant B: štandardný kontrast (tmavé QR v bielych kartách)' }]
  page.drawText('Skúšobný hárok: vyskúšajte čítanie na iPhone aj Androide, z bežnej vzdialenosti a pri slabšom svetle. Ak variant A zlyhá čo i len raz, tlačí sa variant B.', { x: 30, y: A4[1] - 32, size: 8, font: f.reg, color: INK, maxWidth: A4[0] - 60, lineHeight: 10 })
  for (const s of slots) {
    page.drawText(s.label, { x, y: s.y + LABEL.h + 6, size: 9, font: f.bold, color: INK })
    for (const [cx, cy] of [[x, s.y], [x + LABEL.w, s.y], [x, s.y + LABEL.h], [x + LABEL.w, s.y + LABEL.h]]) { page.drawLine({ start: { x: cx - 10, y: cy }, end: { x: cx + 10, y: cy }, thickness: 0.3, color: INK }); page.drawLine({ start: { x: cx, y: cy - 10 }, end: { x: cx, y: cy + 10 }, thickness: 0.3, color: INK }) }
    const one = await PDFDocument.create(); const ff = await fonts(one), im = await logo(one), a = await art(one)
    const p = one.addPage([LABEL.w, LABEL.h]); await drawLabel(one, p, { ...opts, variant: s.variant }, ff, im, a)
    const [emb] = await doc.embedPdf(await one.save())
    page.drawPage(emb, { x, y: s.y })
  }
  return await doc.save()
}
