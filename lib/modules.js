export const ROLES = {
  admin: 'Admin',
  assistant: 'Asistentka vedenia',
  operations: 'Operácie',
  onboarding: 'Onboarding',
  customer_service: 'Zákaznícky servis',
  cleaning: 'Upratovanie a pranie',
  pricing_it: 'Ceny a IT',
  marketing: 'Marketing',
}
export const ROLE_CODES = Object.keys(ROLES)

export const MODULES = [
  { id: 'ring', icon: '🔑', title: 'Vstupy hostí', desc: 'Časovo obmedzené odkazy na otvorenie vchodov (Ring) a automatika z Guesty.', roles: ['admin', 'operations', 'customer_service', 'assistant'] },
  { id: 'cs', icon: '🎧', title: 'Zákaznícky servis', desc: 'Prehľad zmeny, návrhy odpovedí hosťom, požiadavky a platby.', roles: ['admin', 'customer_service', 'assistant'] },
  { id: 'reservations', icon: '📅', title: 'Rezervácie a príchody', desc: 'Dnešné príchody, odchody a obsadenosť bytov.', roles: ['admin', 'operations', 'customer_service', 'assistant', 'cleaning'] },
  { id: 'cleaning', icon: '🧺', title: 'Upratovanie a pranie', desc: 'Plán upratovania, bielizeň, práčovňa a sklad.', roles: ['admin', 'operations', 'cleaning'] },
  { id: 'pracovna', icon: '🧼', title: 'Práčovňa', desc: 'Práčovňa a žehliareň: ako to funguje a koľko prádla treba.', roles: ['*'] },
  { id: 'onboarding', icon: '🏠', title: 'Onboarding bytov a leady', desc: 'Od prvého kontaktu s majiteľom po prvé vyúčtovanie.', roles: ['admin', 'onboarding', 'operations'] },
  { id: 'furnishing', icon: '🛋️', title: 'Zariaďovanie bytov', desc: 'Návrhy zariadenia a nákupné zoznamy.', roles: ['admin', 'operations', 'onboarding'] },
  { id: 'pricing', icon: '📈', title: 'Ceny', desc: 'PriceLabs, výkon bytov a odporúčania.', roles: ['admin', 'pricing_it'] },
  { id: 'economy', icon: '💶', title: 'Ekonomika', desc: 'Financie a čísla firmy. Len pre vedenie (adminov).', roles: ['admin'] },
  { id: 'marketing', icon: '📣', title: 'Marketing a obsah', desc: 'Kampane, texty, fotky a webová stránka.', roles: ['admin', 'marketing', 'assistant'] },
  { id: 'kb', icon: '📚', title: 'Znalostná báza a SOP', desc: 'Postupy, pravidlá a vzory odpovedí pre celý tím.', roles: ['*'] },
  { id: 'guru', href: '/guru', internal: true, icon: '🧠', title: 'LIVE-IN Guru', desc: 'Opýtaj sa na byty, rezervácie, Práčovňu a nástenku. Odpovedá podľa tvojich oprávnení.', roles: ['*'] },
  { id: 'admin', icon: '⚙️', title: 'Správa appky', desc: 'Ľudia, ich roly a adresy modulov.', roles: ['admin'], href: '/admin/users', internal: true },
]

export function modulesFor(roles) {
  const r = roles || []
  return MODULES.filter((m) => m.roles.includes('*') || m.roles.some((x) => r.includes(x)))
}

export const LINKABLE = MODULES.filter((m) => !m.internal)
