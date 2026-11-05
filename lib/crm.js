// CRM (leady): čisté pravidlá bez DOM a bez siete – štádiá, smerovanie, priority, odpočet, mapovanie na HubSpot a Asanu.

export const STAGES = [
  { id: 'new', label: 'Nový', short: '1 · Nový', hs: { hs_lead_status: 'NEW' }, asana: 'LEAD 1 · Nový' },
  { id: 'contacted', label: 'Kontaktovaný', short: '2 · Kontaktovaný', hs: { hs_lead_status: 'ATTEMPTED_TO_CONTACT' }, asana: 'LEAD 2 · Kontaktovaný' },
  { id: 'viewing', label: 'Obhliadka', short: '3 · Obhliadka', hs: { hs_lead_status: 'IN_PROGRESS' }, asana: 'LEAD 4 · Obhliadka / hovor' },
  { id: 'offer', label: 'Ponuka', short: '4 · Ponuka', hs: { hs_lead_status: 'IN_PROGRESS' }, asana: 'LEAD 5 · Ponuka poslaná' },
  { id: 'client', label: 'Klient', short: '5 · Klient', hs: { lifecyclestage: 'customer' }, asana: 'LEAD 6 · Podpísaný' },
  { id: 'lost', label: 'Stratený', short: '✕ · Stratený', hs: { hs_lead_status: 'UNQUALIFIED' }, asana: 'LEAD ✕ · Stratený' },
]
export const STAGE_IDS = STAGES.map((s) => s.id)
export const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[0]
export const OPEN_STAGES = ['new', 'contacted', 'viewing', 'offer']

export const SOURCES = ['Facebook / Instagram', 'Web formulár', 'Odporúčanie', 'Maklér / partner', 'Telefón / WhatsApp', 'Iné / neznáme']
export const LOST_REASONS = ['Nedvolal / nedostupný', 'Cena / rozpočet', 'Lokalita mimo služieb', 'Vybral si iného', 'Nebol to reálny záujem', 'Iné']

export const ASSIGNEES = { kosice: 'patrik@live-in.co.uk', default: 'zuzana@live-in.international', escalate: 'julius@live-in.co.uk' }
export const CITY_GROUPS = ['Bratislava', 'Košice', 'Trnava', 'Iné']
/** Mestá, v ktorých naozaj operujeme: len tie sa počítajú do úspešnosti leadov (rozhodnutie Július, 5. 11. 2026). */
export const CORE_CITIES = ['Bratislava', 'Košice']
export const isCoreCity = (l) => CORE_CITIES.includes(l && l.city_group)

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Zjednotené mesto: Bratislava / Košice / Trnava / Iné (aj z mestských častí a preklepov). */
export function cityGroup(city) {
  const c = fold(city)
  if (!c) return 'Iné'
  if (/kosic/.test(c)) return 'Košice'
  if (/bratislav|petrzalk|ruzinov|nove mesto|\brac(a|e)\b|karlova ves|dubravk|lamac|devin|vajnor|podunaj|vrakun|jarovc|rusovc|cunov|stare mesto|\bba\b/.test(c)) return 'Bratislava'
  if (/trnav/.test(c)) return 'Trnava'
  return 'Iné'
}

/** Komu lead patrí, aká má priorita a po koľkých hodinách sa spúšťa alarm. */
export function route(group) {
  if (group === 'Košice') return { assigned_to: ASSIGNEES.kosice, priority: 'high', alarm_hours: 24 }
  if (group === 'Bratislava') return { assigned_to: ASSIGNEES.default, priority: 'high', alarm_hours: 24 }
  if (group === 'Trnava') return { assigned_to: ASSIGNEES.default, priority: 'normal', alarm_hours: 24 }
  return { assigned_to: ASSIGNEES.default, priority: 'low', alarm_hours: 72 }
}

/** Telefón v tvare +421…; slovenské čísla bez predvoľby dostanú +421. Vráti '' pri nezmysle. */
export function normalizePhone(p) {
  let d = String(p ?? '').replace(/[^\d+]/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = '+' + d.slice(2)
  if (!d.startsWith('+')) {
    if (/^0\d{9}$/.test(d)) d = '+421' + d.slice(1)
    else if (/^421\d{9}$/.test(d)) d = '+' + d
    else if (/^9\d{8}$/.test(d)) d = '+421' + d
    else d = '+' + d
  }
  return /^\+\d{7,15}$/.test(d) ? d : ''
}
export const telLink = (p) => (normalizePhone(p) ? 'tel:' + normalizePhone(p) : '')
/** wa.me odkaz; predvyplnená správa bez diakritiky. */
export function waLink(p, text = '') {
  const n = normalizePhone(p).replace('+', '')
  if (!n) return ''
  const msg = fold(text).replace(/\s+/g, ' ')
  return 'https://wa.me/' + n + (msg ? '?text=' + encodeURIComponent(msg) : '')
}

/** Zdroj zo Zapieru / Asany / HubSpotu na našich 6 hodnôt. */
export function normalizeSource(s) {
  const f = fold(s)
  if (!f) return 'Iné / neznáme'
  if (/facebook|instagram|\bfb\b|\big\b|meta/.test(f)) return 'Facebook / Instagram'
  if (/web|formul|stranka|website|organic|direct|paid_search|google/.test(f)) return 'Web formulár'
  if (/odporuc|referral|referr/.test(f)) return 'Odporúčanie'
  if (/makler|partner|realit/.test(f)) return 'Maklér / partner'
  if (/telefon|whatsapp|phone|sms|call/.test(f)) return 'Telefón / WhatsApp'
  const exact = SOURCES.find((x) => fold(x) === f)
  return exact || 'Iné / neznáme'
}

/** Štádium podľa HubSpotu (čo platí, keď to niekto zmenil priamo tam). */
export function stageFromHubspot({ lifecyclestage, hs_lead_status } = {}) {
  if (lifecyclestage === 'customer') return 'client'
  switch (hs_lead_status) {
    case 'ATTEMPTED_TO_CONTACT': case 'CONNECTED': return 'contacted'
    case 'IN_PROGRESS': case 'OPEN_DEAL': return 'viewing'
    case 'UNQUALIFIED': return 'lost'
    case 'NEW': default: return 'new'
  }
}
/** Čo zapísať do HubSpotu pri zmene štádia. */
export function hubspotPropsForStage(stage, { connected = false } = {}) {
  const s = stageOf(stage)
  const props = { ...s.hs }
  if (stage === 'contacted' && connected) props.hs_lead_status = 'CONNECTED'
  return props
}
/** Štádium podľa názvu sekcie v Asane (LEAD 3 · Kvalifikovaný berieme ako kontaktovaný). */
export function stageFromAsanaSection(name) {
  const f = fold(name)
  if (!/^lead/.test(f)) return null
  if (/lead 1/.test(f)) return 'new'
  if (/lead 2|lead 3/.test(f)) return 'contacted'
  if (/lead 4/.test(f)) return 'viewing'
  if (/lead 5/.test(f)) return 'offer'
  if (/lead 6/.test(f)) return 'client'
  if (/straten|✕|\bx\b/.test(f)) return 'lost'
  return null
}

/** Rozhodnutie pri jednorazovom importe z HubSpotu: klient / lead / nie lead a štádium. Staré leady bez 24 h alarmu. */
export function importKind({ lifecyclestage, hs_lead_status, createdate } = {}) {
  if (lifecyclestage === 'customer') return { kind: 'client', stage: 'client' }
  const created = createdate && Number.isFinite(Date.parse(createdate)) ? new Date(createdate) : null
  const mailSync = created && created.toISOString().slice(0, 10) === '2026-11-04' && !hs_lead_status
  if (mailSync) return { kind: 'not_lead', stage: 'new' }
  if (hs_lead_status === 'UNQUALIFIED') return { kind: 'lead', stage: 'lost' }
  return { kind: 'lead', stage: stageFromHubspot({ lifecyclestage, hs_lead_status }) }
}

export function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstname: '', lastname: '' }
  if (parts.length === 1) return { firstname: parts[0], lastname: '' }
  return { firstname: parts.slice(0, -1).join(' '), lastname: parts.at(-1) }
}
export const fullName = (c) => [c.firstname, c.lastname].filter(Boolean).join(' ').trim() || c.email || ''

/** Meno z názvu úlohy v Asane („Nový kontakt: Jana Nová“, „Web dopyt: Krátkodobá správa — Jana Nová“). */
export function parseAsanaLeadName(title) {
  const t = String(title || '').trim()
  let m = t.match(/^nov[yý] kontakt:\s*(.+)$/i)
  if (m) return m[1].trim()
  m = t.match(/^web dopyt:.*?[—–-]\s*(.+)$/i)
  if (m) return m[1].trim()
  return t
}

/** Odpočet do lehoty: stav a text. ok > 8 h, soon 2–8 h, critical < 2 h, over po lehote. */
export function countdown(due_at, now = Date.now()) {
  if (!due_at) return { ms: null, state: 'none', label: '—', pct: 100 }
  const ms = Date.parse(due_at) - now, H = 3600e3
  const a = Math.abs(ms), h = Math.floor(a / H), m = Math.floor((a % H) / 60000)
  const label = (ms < 0 ? '+' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  const state = ms < 0 ? 'over' : ms < 2 * H ? 'critical' : ms < 8 * H ? 'soon' : 'ok'
  return { ms, state, label, hours: ms / H }
}
/** Percento zostávajúcej lehoty (na kruh). */
export function remainingPct(due_at, alarm_hours = 24, now = Date.now()) {
  if (!due_at) return 100
  return Math.max(0, Math.min(100, ((Date.parse(due_at) - now) / (alarm_hours * 3600e3)) * 100))
}

/** Pripomienky pre nevybavený lead: 12 h, 20 h, 24 h po prijatí a potom každé 4 h po lehote; eskalácia 24 h po lehote. */
export function dueReminders(lead, now = Date.now()) {
  if (lead.stage !== 'new' || lead.kind !== 'lead' || !lead.due_at) return []
  const H = 3600e3, received = Date.parse(lead.received_at), due = Date.parse(lead.due_at), done = lead.reminders || {}
  const out = []
  const push = (key, title) => { if (!done[key] && now >= due - (24 - Number(key.slice(1))) * H) out.push({ key, title }) }
  if (lead.alarm_hours === 24) { push('h12', 'Lead čaká už 12 hodín'); push('h20', 'Lead čaká 20 hodín, zostávajú 4') }
  if (now >= due && !done.h24) out.push({ key: 'h24', title: 'Lead je po lehote' })
  const overH = Math.floor((now - due) / H)
  if (overH >= 4) { const k = 'o' + Math.floor(overH / 4) * 4; if (!done[k]) out.push({ key: k, title: `Lead je ${Math.floor(overH / 4) * 4} h po lehote` }) }
  if (now - due >= 24 * H && !done.escalated) out.push({ key: 'escalated', title: 'Eskalácia: lead 24 h po lehote', escalate: true })
  void received
  return out
}

/** Kľúč idempotencie pre webhook: Asana gid, inak e-mail, inak telefón. */
export function leadIdentity({ asana_task_gid, email, phone }) {
  if (asana_task_gid) return { field: 'asana_task_gid', value: String(asana_task_gid) }
  if (email) return { field: 'email', value: String(email).trim().toLowerCase() }
  const p = normalizePhone(phone)
  if (p) return { field: 'phone', value: p }
  return null
}

/* ---------- týždne: tento, minulý, pred 2, pred 3; všetko staršie ako 4 týždne je „Staré“ ---------- */
export const WEEKS = [
  { id: 'w0', label: 'Tento týždeň', short: 'Tento' },
  { id: 'w1', label: 'Minulý týždeň', short: 'Minulý' },
  { id: 'w2', label: 'Pred 2 týždňami', short: '−2 týž.' },
  { id: 'w3', label: 'Pred 3 týždňami', short: '−3 týž.' },
  { id: 'old', label: 'Staré', short: 'Staré' },
]
const DAY = 864e5
function tzOffset(ts) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const o = {}
  for (const p of f.formatToParts(new Date(ts))) o[p.type] = p.value
  const local = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour === '24' ? 0 : o.hour), Number(o.minute), Number(o.second))
  return local - ts
}
/** Začiatok týždňa (pondelok 00:00 bratislavského času) pre daný okamih, ako UTC ms. */
export function weekStart(ts = Date.now()) {
  const off = tzOffset(ts), local = ts + off
  const dayStart = Math.floor(local / DAY) * DAY
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7
  return dayStart - dow * DAY - off
}
/** Do ktorého týždňa lead patrí podľa dátumu prijatia: 'w0'…'w3' alebo 'old'. */
export function weekBucket(received_at, now = Date.now()) {
  const t = Date.parse(received_at)
  if (!Number.isFinite(t)) return 'old'
  const w0 = weekStart(now)
  if (t >= w0) return 'w0'
  for (let i = 1; i <= 3; i++) if (t >= w0 - i * 7 * DAY) return 'w' + i
  return 'old'
}
/** Rozsah týždňa pre popis (od – do), ako UTC ms. */
export function weekRange(id, now = Date.now()) {
  const w0 = weekStart(now), i = Number(String(id).replace('w', ''))
  if (id === 'old' || !Number.isFinite(i)) return { from: null, to: w0 - 3 * 7 * DAY }
  return { from: w0 - i * 7 * DAY, to: w0 - (i - 1) * 7 * DAY }
}
