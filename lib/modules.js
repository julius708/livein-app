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

export const MODULES = [
  { id: 'ring', icon: '🔑', title: 'Vstupy hostí', desc: 'Časovo obmedzené odkazy na otvorenie vchodov (Ring) a automatika z Guesty.', roles: ['admin', 'operations', 'customer_service', 'assistant'] },
  { id: 'cs', icon: '🎧', title: 'Zákaznícky servis', desc: 'Prehľad zmeny, návrhy odpovedí hosťom, požiadavky a platby.', roles: ['admin', 'customer_service', 'assistant'] },
  { id: 'reservations', icon: '📅', title: 'Rezervácie a príchody', desc: 'Dnešné príchody, odchody a obsadenosť bytov.', roles: ['admin', 'operations', 'customer_service', 'assistant', 'cleaning'] },
  { id: 'cleaning', icon: '🧺', title: 'Upratovanie a pranie', desc: 'Plán upratovania, bielizeň, práčovňa a sklad.', roles: ['admin', 'operations', 'cleaning'] },
  { id: 'pracovna', icon: '🧼', title: 'Práčovňa', desc: 'Práčovňa a žehliareň: ako to funguje a koľko prádla treba.', roles: ['*'] },
  { id: 'onboarding', icon: '🏠', title: 'Zaradenie bytov', desc: 'Od zmluvy po prvého hosťa: checklist, Asana, údaje pre listing.', roles: ['admin', 'onboarding', 'operations'] },
  { id: 'furnishing', icon: '🛋️', title: 'Zariaďovanie bytov', desc: 'Návrhy zariadenia a nákupné zoznamy.', roles: ['admin', 'operations', 'onboarding'] },
  { id: 'pricing', icon: '📈', title: 'Ceny', desc: 'PriceLabs, výkon bytov a odporúčania.', roles: ['admin', 'pricing_it'] },
  { id: 'economy', href: '/ekonomika', internal: true, icon: '💶', title: 'Ekonomika', desc: 'Výnosy, obsadenosť, kanály, výhľad a bankové toky. Len pre vedenie (adminov).', roles: ['admin'] },
  { id: 'marketing', icon: '📣', title: 'Marketing a obsah', desc: 'Kampane, texty, fotky a webová stránka.', roles: ['admin', 'marketing', 'assistant'] },
  { id: 'kb', icon: '📚', title: 'Znalostná báza a SOP', desc: 'Postupy, pravidlá a vzory odpovedí pre celý tím.', roles: ['*'] },
  { id: 'volne', href: 'https://booking.live-in.international/en/properties', internal: true, icon: '🏨', title: 'Voľné apartmány', desc: 'Náš rezervačný portál: čo je voľné, ceny a fotky. Keď hosť hľadá iný termín alebo byt s parkovaním.', roles: ['*'] },
  { id: 'ideas', href: '/napady', internal: true, icon: '💡', title: 'Nápady na obsah', desc: 'Zapíš situáciu z dňa za pár sekúnd. Marketing z nej spraví krátke video.', roles: ['*'] },
  { id: 'crm', href: '/crm', internal: true, icon: '📞', title: 'CRM: leady a kontakty', desc: 'Nové leady s 24-hodinovým odpočtom, zavolať jedným klikom, cesta leadu až po klienta. HubSpot a Asana sa zapisujú samy.', roles: ['crm'] },
  { id: 'newsletter', href: '/newsletter', internal: true, icon: '✉️', title: 'Newsletter pre majiteľov', desc: 'Nápady na témy, návrh textu, publikum z HubSpotu, testovací e-mail a odoslanie s potvrdením. História odoslaní.', roles: ['newsletter'] },
  { id: 'plan', href: '/plan', internal: true, icon: '🚀', title: 'Marketingový plán 2027', desc: 'Kam ideme: 160 až 170 bytov do konca 2026, ~345 na konci 2027, 15 nových mesačne, sociálne siete ako motor č. 1. Prečítaj si ho.', roles: ['*'] },
  { id: 'testy', href: '/testy', internal: true, icon: '🧭', title: 'Testy osobnosti', desc: 'DISC, Big Five, 16 typov, tímové roly, pracovný štýl a hodnoty. Spoznaj svoj štýl a kolegov.', roles: ['*'] },
  { id: 'guru', href: '/guru', internal: true, icon: '🧠', title: 'LIVE-IN Guru', desc: 'Opýtaj sa na byty, rezervácie, Práčovňu a nástenku. Odpovedá podľa tvojich oprávnení.', roles: ['*'] },
  { id: 'kluce', href: '/kluce', internal: true, icon: '🗝️', title: 'Kľúče', desc: 'Stena s kľúčmi v appke: kto má ktoré kľúče, zobrať a vrátiť jedným ťuknutím, zoznam podľa tašiek z Práčovne. Kiosk pre iPad v miestnosti s kľúčmi.', roles: ['admin', 'operations', 'cleaning', 'customer_service', 'assistant'] },
  { id: 'sprievodca', href: '/sprievodca', internal: true, icon: '📱', title: 'Sprievodca bytom a QR', desc: 'Trvalý QR na Wi-Fi a sprievodcu, druhý na recenzie. Karty bytov, pravidlá, tipy a štítky na tlač.', roles: ['admin', 'operations', 'customer_service'] },
  { id: 'admin', icon: '⚙️', title: 'Správa appky', desc: 'Ľudia, ich roly a adresy modulov.', roles: ['admin'], href: '/admin/users', internal: true },
]

export function modulesFor(roles) {
  const r = roles || []
  return MODULES.filter((m) => m.roles.includes('*') || m.roles.some((x) => r.includes(x)))
}

export const LINKABLE = MODULES.filter((m) => !m.internal)
