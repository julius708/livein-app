import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateRawSync } from 'node:zlib'
import { buildXlsx, zip, crc32, STYLE } from '../lib/xlsx-lite.js'

// Čítanie ZIPu späť (centrálny adresár), nech test nezávisí od externého nástroja
function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--
  assert.ok(e >= 0, 'chýba koniec ZIP archívu')
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = {}
  for (let i = 0; i < n; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50)
    const comp = buf.readUInt32LE(p + 20), raw = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42), crc = buf.readUInt32LE(p + 16)
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8')
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28), data = inflateRawSync(buf.slice(off + 30 + lnl + lel, off + 30 + lnl + lel + comp))
    assert.equal(data.length, raw); assert.equal(crc32(data), crc, `CRC ${name}`)
    out[name] = data.toString('utf8'); p += 46 + nl + el + cl
  }
  return out
}

test('crc32 zodpovedá známej hodnote', () => { assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926) })
test('zip: súbory sa dajú rozbaliť s platným CRC, aj s diakritikou v názve', () => {
  const f = unzip(zip([{ name: 'a.txt', data: 'ahoj' }, { name: 'č/ž.txt', data: 'Žltý kôň '.repeat(500) }]))
  assert.equal(f['a.txt'], 'ahoj'); assert.equal(f['č/ž.txt'].length, 'Žltý kôň '.repeat(500).length)
})
test('xlsx: štruktúra balíčka, hárky, texty so špeciálnymi znakmi, čísla, štýly a zafixovaný riadok', () => {
  const f = unzip(buildXlsx([
    { name: 'Prehľad', cols: [12, 48], rows: [[{ v: 'Nadpis <&> "x"', s: 'title' }], [], ['Byt', { v: 1234.5, s: 'money' }, null, { v: 7, s: 'num' }]] },
    { name: 'Zlý/názov:*?[]', freeze: true, rows: [['A', 1], [null, 'ž']] },
  ]))
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(f[n], n)
  assert.ok(f['xl/workbook.xml'].includes('name="Prehľad"')); assert.ok(f['xl/workbook.xml'].includes('name="Zlý názov    "') || f['xl/workbook.xml'].includes('name="Zlý názov'))
  assert.ok(f['xl/worksheets/sheet1.xml'].includes('Nadpis &lt;&amp;&gt; &quot;x&quot;')); assert.ok(f['xl/worksheets/sheet1.xml'].includes(`<c r="B3" s="${STYLE.money}"><v>1234.5</v></c>`))
  assert.ok(f['xl/worksheets/sheet1.xml'].includes('<col min="2" max="2" width="48" customWidth="1"/>')); assert.ok(f['xl/worksheets/sheet2.xml'].includes('state="frozen"'))
  assert.ok(f['xl/styles.xml'].includes('FF2F5233')); assert.ok(!f['xl/worksheets/sheet1.xml'].includes('r="C3"'))
})
