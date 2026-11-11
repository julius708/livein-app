export const ROLES = {
  admin: 'Admin',
  assistant: 'Asistentka vedenia',
  operations: 'Operácie',
  onboarding: 'Onboarding',
  customer_service: 'Zákaznícky servis',
  cleaning: 'Upratovanie a pranie',
  pricing_it: 'Ceny a IT',
  marketing: 'Marketing',
  crm: 'CRM (leady a kontakty)',
  newsletter: 'Newsletter',
}
export const ROLE_CODES = Object.keys(ROLES)

/** Skupiny na domove: podľa toho, na čo appku potrebuješ (Július, 10. 11. 2026). Poradie = poradie na domove. */
export const GROUPS = [
  { id: 'prevadzka', icon: '🏢', title: 'Prevádzka bytov', desc: 'Kľúče, vstupy, príchody, upratovanie, práčovňa, opravy.' },
  { id: 'hostia', icon: '🛎️', title: 'Hostia a servis', desc: 'Zákaznícky servis, sprievodca bytom, voľné apartmány.' },
  { id: 'obchod', icon: '🤝', title: 'Obchod a majitelia', desc: 'Leady, newsletter, zaradenie a zariadenie bytov, ceny, ekonomika.' },
  { id: 'marketing', icon: '📣', title: 'Marketing a obsah', desc: 'Kampane, nápady na obsah, marketingový plán.' },
  { id: 'tim', icon: '🧠', title: 'Tím a vedomosti', desc: 'Znalostná báza, Guru, testy osobnosti, správa appky.' },
]
export const MODULES = [
  { id: 'ring', group: 'prevadzka', icon: '🚪', title: 'Vstupy hostí', desc: 'Časovo obmedzené odkazy na otvorenie vchodov (Ring) a automatika z Guesty.', roles: ['admin', 'operations', 'customer_service', 'assistant'] },
  { id: 'cs', group: 'hostia', icon: '🎧', title: 'Zákaznícky servis', desc: 'Prehľad zmeny, návrhy odpovedí hosťom, požiadavky a platby.', roles: ['admin', 'customer_service', 'assistant'] },
  { id: 'reservations', group: 'prevadzka', icon: '📅', title: 'Rezervácie a príchody', desc: 'Dnešné príchody, odchody a obsadenosť bytov.', roles: ['admin', 'operations', 'customer_service', 'assistant', 'cleaning'] },
  { id: 'cleaning', group: 'prevadzka', icon: '🧺', title: 'Upratovanie a pranie', desc: 'Plán upratovania, bielizeň, práčovňa a sklad.', roles: ['admin', 'operations', 'cleaning'] },
  { id: 'pracovna', group: 'prevadzka', icon: '🧼', title: 'Práčovňa', desc: 'Práčovňa a žehliareň: ako to funguje a koľko prádla treba.', roles: ['*'] },
  { id: 'onboarding', group: 'obchod', icon: '🏠', title: 'Zaradenie bytov', desc: 'Od zmluvy po prvého hosťa: checklist, Asana, údaje pre listing.', roles: ['admin', 'onboarding', 'operations'] },
  { id: 'furnishing', group: 'obchod', icon: '🛋️', title: 'Zariaďovanie bytov', desc: 'Návrhy zariadenia a nákupné zoznamy.', roles: ['admin', 'operations', 'onboarding'] },
  { id: 'pricing', group: 'obchod', icon: '📈', title: 'Ceny', desc: 'PriceLabs, výkon bytov a odporúčania.', roles: ['admin', 'pricing_it'] },
  { id: 'economy', group: 'obchod', href: '/ekonomika', internal: true, icon: '💶', title: 'Ekonomika', desc: 'Výnosy, obsadenosť, kanály, výhľad a bankové toky. Len pre vedenie (adminov).', roles: ['admin'] },
  { id: 'marketing', group: 'marketing', icon: '📣', title: 'Marketing a obsah', desc: 'Kampane, texty, fotky a webová stránka.', roles: ['admin', 'marketing', 'assistant'] },
  { id: 'kb', group: 'tim', icon: '📚', title: 'Znalostná báza a SOP', desc: 'Postupy, pravidlá a vzory odpovedí pre celý tím.', roles: ['*'] },
  { id: 'volne', group: 'hostia', href: 'https://booking.live-in.international/en/properties', internal: true, icon: '🏨', title: 'Voľné apartmány', desc: 'Náš rezervačný portál: čo je voľné, ceny a fotky. Keď hosť hľadá iný termín alebo byt s parkovaním.', roles: ['*'] },
  { id: 'ideas', group: 'marketing', href: '/napady', internal: true, icon: '💡', title: 'Nápady na obsah', desc: 'Zapíš situáciu z dňa za pár sekúnd. Marketing z nej spraví krátke video.', roles: ['*'] },
  { id: 'crm', group: 'obchod', href: '/crm', internal: true, icon: '📞', title: 'CRM: leady a kontakty', desc: 'Nové leady s 24-hodinovým odpočtom, zavolať jedným klikom, cesta leadu až po klienta. HubSpot a Asana sa zapisujú samy.', roles: ['crm'] },
  { id: 'newsletter', group: 'obchod', href: '/newsletter', internal: true, icon: '✉️', title: 'Newsletter pre majiteľov', desc: 'Nápady na témy, návrh textu, publikum z HubSpotu, testovací e-mail a odoslanie s potvrdením. História odoslaní.', roles: ['newsletter'] },
  { id: 'plan', group: 'marketing', href: '/plan', internal: true, icon: '🚀', title: 'Marketingový plán 2027', desc: 'Kam ideme: 160 až 170 bytov do konca 2026, ~345 na konci 2027, 15 nových mesačne, sociálne siete ako motor č. 1. Prečítaj si ho.', roles: ['*'] },
  { id: 'testy', group: 'tim', href: '/testy', internal: true, icon: '🧭', title: 'Testy osobnosti', desc: 'DISC, Big Five, 16 typov, tímové roly, pracovný štýl a hodnoty. Spoznaj svoj štýl a kolegov.', roles: ['*'] },
  { id: 'guru', group: 'tim', href: '/guru', internal: true, icon: '🧠', title: 'LIVE-IN Guru', desc: 'Opýtaj sa na byty, rezervácie, Práčovňu a nástenku. Odpovedá podľa tvojich oprávnení.', roles: ['*'] },
  { id: 'udrzba', group: 'prevadzka', href: '/udrzba', internal: true, icon: '🛠️', title: 'Údržba', desc: 'Hlásenie porúch, triáž, dopyt dodávateľom, súhlas majiteľa a objednávka. Pilot v test režime: správy idú len na povolené čísla.', roles: ['admin', 'operations', 'customer_service', 'assistant'] },
  { id: 'vyuctovanie', group: 'obchod', href: '/vyuctovanie', internal: true, icon: '🧾', title: 'Vyúčtovanie majiteľom', desc: 'Mesačná tabuľka nákladov, ktoré znova fakturujeme majiteľom bytov: po bytoch, so súčtami, stavmi a exportom do Excelu. Termín 15. v mesiaci.', roles: ['admin', 'assistant', 'operations'] },
  { id: 'kluce', group: 'prevadzka', href: '/kluce', internal: true, icon: '🔑', title: 'Kľúče', desc: 'Stena s kľúčmi v appke: kto má ktoré kľúče, zobrať a vrátiť jedným ťuknutím, zoznam podľa tašiek z Práčovne. Kiosk pre iPad v miestnosti s kľúčmi.', roles: ['admin', 'operations', 'cleaning', 'customer_service', 'assistant'] },
  { id: 'sprievodca', group: 'hostia', href: '/sprievodca', internal: true, icon: '📱', title: 'Sprievodca bytom a QR', desc: 'Trvalý QR na Wi-Fi a sprievodcu, druhý na recenzie. Karty bytov, pravidlá, tipy a štítky na tlač.', roles: ['admin', 'operations', 'customer_service'] },
  { id: 'admin', group: 'tim', icon: '⚙️', title: 'Správa appky', desc: 'Ľudia, ich roly a adresy modulov.', roles: ['admin'], href: '/admin/users', internal: true },
]

export function modulesFor(roles) {
  const r = roles || []
  return MODULES.filter((m) => m.roles.includes('*') || m.roles.some((x) => r.includes(x)))
}

export const LINKABLE = MODULES.filter((m) => !m.internal)
