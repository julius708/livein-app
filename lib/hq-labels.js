// Ústredňa – popisky a oblasti pre obrazovku. Bez importov, aby sa dal súbor použiť aj v prehliadači.

export const OP_LABEL = { assign: 'Zadanie', accept: 'Prevzatie', step: 'Krok', block: 'Blokovanie', result: 'Výsledok', verify: 'Overenie verzie', apply: 'Potvrdenie zapracovania' }

export const STATUS = {
  prepared: { label: 'Čaká na prevzatie', tone: 'orange' },
  accepted: { label: 'Prevzaté', tone: '' },
  working: { label: 'Pracuje sa', tone: '' },
  blocked: { label: 'Blokované', tone: 'red' },
  result_ready: { label: 'Výsledok čaká na kontrolu', tone: 'orange' },
  verified: { label: 'Verzia overená', tone: '' },
  applied: { label: 'Zapracované', tone: '' },
}

/**
 * Oblasti ústredne. Všetky zostávajú v navigácii aj pred pripojením; `links` vedú na existujúce moduly appky.
 * `sources` sú kľúče zdrojov z hq_sources (pokrytie).
 */
export const AREAS = [
  { id: 'overview', nav: 'Prehľad', icon: 'layout', title: 'Dobrý deň.', sub: 'Všetko dôležité, na jednom mieste.', live: true },
  { id: 'attention', nav: 'Moja pozornosť', icon: 'dot', title: 'Čo potrebuje tvoje rozhodnutie.', sub: 'Blokovania, výsledky na kontrolu a neprevzaté zadania z registra práce.', live: true },
  { id: 'messages', nav: 'Správy', icon: 'inbox', title: 'Každá konverzácia má kontext.', sub: 'E-maily a WhatsApp spolu s bytom, vlastníkom a ďalším krokom.', sources: ['gmail', 'outlook', 'whatsapp', 'slack'], links: [['Zákaznícky servis', '/cs'], ['CRM: leady a kontakty', '/crm']] },
  { id: 'agents', nav: 'Ľudia a agenti', icon: 'users', title: 'Vieš, kto posúva veci dopredu.', sub: 'Zadania, výsledky a prekážky naprieč GPT, Claude a tímom.', live: true },
  { id: 'visits', nav: 'Obhliadky', icon: 'calendar', title: 'Plán, potvrdenie, ďalší krok.', sub: 'Spoločný kalendár tímu a výsledky stretnutí.', sources: ['calendar'], links: [['CRM: leady a obhliadky', '/crm']] },
  { id: 'properties', nav: 'Nehnuteľnosti', icon: 'building', title: 'Od prvého kontaktu po hostí.', sub: 'Príležitosti, obchodné prípady a byty v prevádzke.', sources: ['hubspot', 'guesty', 'invest-feed'], links: [['Investičné nehnuteľnosti', '/investicie'], ['Zaradenie bytov', '/zaradenie'], ['CRM', '/crm']] },
  { id: 'marketing', nav: 'Marketing', icon: 'chart', title: 'Obsah, ktorý prináša výsledky.', sub: 'Od zobrazení videa až po nové obhliadky a zákazky.', sources: ['social', 'facebook-leads', 'smartemailing'], links: [['Marketingový plán 2027', '/plan'], ['Nápady na obsah', '/napady'], ['Newsletter', '/newsletter']] },
  { id: 'operations', nav: 'Prevádzka', icon: 'clipboard', extra: true, title: 'Každý byt pripravený.', sub: 'Hostia, upratovanie, údržba, práčovňa a zásoby.', sources: ['guesty', 'pricelabs'], links: [['Údržba', '/udrzba'], ['Kľúče', '/kluce'], ['Práčovňa', '/pracovna'], ['Vstupy hostí', '/ring']] },
  { id: 'finance', nav: 'Financie', icon: 'wallet', extra: true, title: 'Jasný obraz firemných peňazí.', sub: 'Príjmy, záväzky a vyúčtovania majiteľov.', sources: ['finance'], links: [['Ekonomika', '/ekonomika'], ['Vyúčtovanie majiteľom', '/vyuctovanie']] },
  { id: 'knowledge', nav: 'Znalosti', icon: 'book', extra: true, title: 'Informácie pri správnom prípade.', sub: 'Dokumenty, pravidlá, rozhodnutia a karty nehnuteľností.', sources: ['agent-files'], links: [['Znalostná báza a SOP', '/kb'], ['LIVE-IN Guru', '/guru'], ['Sprievodca bytom', '/sprievodca']] },
  { id: 'connections', nav: 'Prepojenia', icon: 'unplug', extra: true, title: 'Vieš, odkiaľ informácie prichádzajú.', sub: 'Pokrytie zdrojov a čas poslednej úspešnej aktualizácie.', live: true },
]

export const SOURCE_STATUS = { live: { label: 'Naživo', tone: '' }, partial: { label: 'Čiastočne', tone: 'orange' }, error: { label: 'Chyba', tone: 'red' }, stale: { label: 'Neaktuálne', tone: 'orange' }, pending: { label: 'Čaká na pripojenie', tone: 'orange' }, off: { label: 'Nepripojené', tone: 'gray' } }

/** „pred 5 min“ – relatívny čas po slovensky. */
export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((now - t) / 60e3))
  if (m < 1) return 'práve teraz'
  if (m < 60) return `pred ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `pred ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'včera' : `pred ${d} dňami`
}
export const statusOf = (s) => STATUS[s] || { label: s, tone: 'gray' }
