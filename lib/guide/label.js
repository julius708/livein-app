// Vektorový PDF štítok 150 × 105 mm: logo priamo na značkovej zelenej (bez bieleho rámu), adresa, Wi-Fi a Recenzie v SK/EN,
// dva QR kódy (iba trvalé HTTPS odkazy s verejným kódom bytu) a overené číslo podpory. Varianty: 'inverted' (biele QR na zelenej)
// a 'standard' (tmavé QR v bielej ploche iba pod kódom). Skúšobný hárok A4 má oba varianty.
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import { guideUrl, reviewUrl, TEMPLATE_VERSION } from './core.js'

const MM = 72 / 25.4
export const LABEL = { w: 150 * MM, h: 105 * MM }
const GREEN = rgb(0x17 / 255, 0x3e / 255, 0x2c / 255), WHITE = rgb(1, 1, 1), INK = rgb(0x1f / 255, 0x2a / 255, 0x24 / 255), ORANGE = rgb(0xf4 / 255, 0x6d / 255, 0x16 / 255)
const fontDir = path.join(process.cwd(), 'lib', 'guide', 'fonts')
const read = (p) => fs.readFileSync(p)

async function fonts(doc) {
  doc.registerFontkit(fontkit)
  const reg = await doc.embedFont(read(path.join(fontDir, 'Figtree-Regular.ttf')), { subset: true })
  const bold = await doc.embedFont(read(path.join(fontDir, 'Figtree-Bold.ttf')), { subset: true })
  return { reg, bold }
}
async function logo(doc) { return doc.embedPng(read(path.join(process.cwd(), 'public', 'logo.png'))) }

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

/** Rozloženie štítku (čisté dáta, testuje sa, že pod logom nie je biela plocha). */
export function labelLayout({ variant = 'standard' } = {}) {
  const { w, h } = LABEL, pad = 7 * MM
  const qr = 34 * MM
  return {
    variant, bg: { x: 0, y: 0, w, h, color: 'green' },
    logo: { x: pad, y: h - pad - 11 * MM, w: 30 * MM, h: 13.2 * MM, background: 'none' },
    address: { x: pad, y: h - pad - 20 * MM, maxW: w - 2 * pad },
    qrs: [
      { key: 'guide', x: pad, y: pad + 7 * MM, size: qr, box: variant === 'standard' ? { pad: 2 * MM, color: 'white', radius: 2 * MM } : null, modules: variant === 'standard' ? 'ink' : 'white', title: { sk: 'Wi-Fi a sprievodca', en: 'Wi-Fi & guide' } },
      { key: 'review', x: w - pad - qr, y: pad + 7 * MM, size: qr, box: variant === 'standard' ? { pad: 2 * MM, color: 'white', radius: 2 * MM } : null, modules: variant === 'standard' ? 'ink' : 'white', title: { sk: 'Recenzia', en: 'Review' } },
    ],
    middle: { x: pad + qr + 6 * MM, w: w - 2 * (pad + qr + 6 * MM) },
    support: { x: pad, y: pad - 1 * MM },
  }
}

async function drawLabel(doc, page, { address, name, code, supportPhone, baseUrl, variant, sample }, f, img) {
  const L = labelLayout({ variant })
  const { w, h } = LABEL
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: GREEN })
  // logo priamo na zelenej: žiadny biely obdĺžnik ani rám
  const lw = L.logo.w, lh = (lw * img.height) / img.width
  page.drawImage(img, { x: L.logo.x, y: h - 7 * MM - lh, width: lw, height: lh })
  if (sample) { page.drawText('UKÁŽKA / SAMPLE', { x: w - 7 * MM - f.bold.widthOfTextAtSize('UKÁŽKA / SAMPLE', 9), y: h - 7 * MM - 8, size: 9, font: f.bold, color: ORANGE }) }
  // adresa
  const line1 = String(name || '').trim(), line2 = String(address || '').trim()
  let y = h - 7 * MM - lh - 5 * MM
  if (line1) { const s = fit(f.bold, line1, 13, L.address.maxW); page.drawText(line1, { x: L.address.x, y, size: s, font: f.bold, color: WHITE }); y -= s + 3 }
  if (line2) { const s = fit(f.reg, line2, 10.5, L.address.maxW); page.drawText(line2, { x: L.address.x, y, size: s, font: f.reg, color: WHITE }) }
  // QR bloky
  const urls = { guide: guideUrl(baseUrl, code), review: reviewUrl(baseUrl, code) }
  for (const q of L.qrs) {
    if (q.box) page.drawRectangle({ x: q.x - q.box.pad, y: q.y - q.box.pad, width: q.size + 2 * q.box.pad, height: q.size + 2 * q.box.pad, color: WHITE, borderColor: WHITE })
    drawQr(page, urls[q.key], q.x, q.y, q.size, q.modules === 'ink' ? INK : WHITE, 0)
    const ty = q.y + q.size + (q.box ? q.box.pad : 0) + 2.5 * MM
    page.drawText(q.title.sk, { x: q.x, y: ty + 11, size: 10.5, font: f.bold, color: WHITE })
    page.drawText(q.title.en, { x: q.x, y: ty, size: 9, font: f.reg, color: WHITE })
  }
  // stred: čo naskenovať
  const mx = L.middle.x, mw = L.middle.w
  const mid = [['Naskenujte kód', f.bold, 10.5], ['Scan the code', f.reg, 9], ['', f.reg, 4], ['Wi-Fi po overení rezervácie', f.reg, 8], ['Wi-Fi after booking check', f.reg, 8]]
  let my = L.qrs[0].y + L.qrs[0].size - 4
  for (const [t, font, s] of mid) { if (t) { const fs = fit(font, t, s, mw); page.drawText(t, { x: mx + (mw - font.widthOfTextAtSize(t, fs)) / 2, y: my, size: fs, font, color: WHITE }) } my -= s + 4 }
  // podpora
  const sup = `Pomoc / Help: ${supportPhone}`
  page.drawText(sup, { x: (w - f.bold.widthOfTextAtSize(sup, 10)) / 2, y: 4.5 * MM, size: 10, font: f.bold, color: WHITE })
  page.drawText(`v${TEMPLATE_VERSION}`, { x: w - 7 * MM - f.reg.widthOfTextAtSize(`v${TEMPLATE_VERSION}`, 6), y: 4.5 * MM, size: 6, font: f.reg, color: WHITE, opacity: 0.7 })
  return urls
}

/** Jeden štítok (PDF bytes). */
export async function renderLabel(opts) {
  const doc = await PDFDocument.create()
  doc.setTitle(`LIVE-IN štítok ${opts.code}`); doc.setProducer('LIVE-IN Super App'); doc.setCreator('LIVE-IN Super App')
  const f = await fonts(doc), img = await logo(doc)
  const page = doc.addPage([LABEL.w, LABEL.h])
  const urls = await drawLabel(doc, page, { variant: 'standard', ...opts }, f, img)
  return { bytes: await doc.save(), urls }
}
/** Skúšobný hárok A4: oba varianty (biele QR na zelenej, štandardný kontrast) s orezovými značkami. */
export async function renderTestSheet(opts) {
  const doc = await PDFDocument.create()
  doc.setTitle('LIVE-IN skúšobný hárok štítkov'); doc.setProducer('LIVE-IN Super App')
  const f = await fonts(doc), img = await logo(doc)
  const A4 = [595.28, 841.89], page = doc.addPage(A4)
  const x = (A4[0] - LABEL.w) / 2
  const slots = [{ y: A4[1] - 60 - LABEL.h, variant: 'inverted', label: 'Variant A: biele QR na zelenej (invertované)' }, { y: A4[1] - 60 - 2 * LABEL.h - 70, variant: 'standard', label: 'Variant B: štandardný kontrast (tmavé QR v bielej ploche iba pod kódom)' }]
  page.drawText('Skúšobný hárok: vyskúšajte čítanie na iPhone aj Androide, z bežnej vzdialenosti a pri slabšom svetle. Ak variant A zlyhá čo i len raz, tlačí sa variant B.', { x: 30, y: A4[1] - 32, size: 8, font: f.reg, color: INK, maxWidth: A4[0] - 60, lineHeight: 10 })
  for (const s of slots) {
    page.drawText(s.label, { x, y: s.y + LABEL.h + 6, size: 9, font: f.bold, color: INK })
    // orezové značky
    for (const [cx, cy] of [[x, s.y], [x + LABEL.w, s.y], [x, s.y + LABEL.h], [x + LABEL.w, s.y + LABEL.h]]) { page.drawLine({ start: { x: cx - 10, y: cy }, end: { x: cx + 10, y: cy }, thickness: 0.3, color: INK }); page.drawLine({ start: { x: cx, y: cy - 10 }, end: { x: cx, y: cy + 10 }, thickness: 0.3, color: INK }) }
    const sub = await PDFDocument.create(); sub.registerFontkit(fontkit)
    // kreslíme priamo na A4 s posunom cez vnorenú stránku: jednoduchšie je vykresliť štítok ako samostatnú stránku a vložiť ako formulár
    const one = await PDFDocument.create(); const ff = await fonts(one), im = await logo(one)
    const p = one.addPage([LABEL.w, LABEL.h]); await drawLabel(one, p, { ...opts, variant: s.variant }, ff, im)
    const [emb] = await doc.embedPdf(await one.save())
    page.drawPage(emb, { x, y: s.y })
  }
  return await doc.save()
}
