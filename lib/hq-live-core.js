// Ústredňa – z dát existujúcich modulov appky poskladá obsah oblastí a pravdivý stav zdrojov. Čistá funkcia (bez siete), testovaná.
// Vstup `raw` pripravuje lib/hq-live.js: každý kľúč je { data } alebo { error }. Čo sa nepodarilo načítať, sa nezobrazí ako nula, ale ako chyba zdroja.

import { plural } from './hq-labels.js'

const TZ = 'Europe/Bratislava'
const dayKey = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ })
const fmtDT = (t) => new Date(t).toLocaleString('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
const fmtT = (t) => new Date(t).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const fmtD = (t) => new Date(t).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ })
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const show = (v, suffix = '') => (num(v) == null ? '–' : new Intl.NumberFormat('sk-SK').format(num(v)) + suffix)
const eur = (cents) => (num(cents) == null ? '–' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(num(cents) / 100))
const ok = (x) => !!(x && !x.error && x.data != null)
const err = (x) => (x && x.error ? String(x.error).slice(0, 200) : null)
const max = (list) => list.filter(Boolean).sort().pop() || null

const monthLabel = (m) => { const t = Date.parse(String(m).length === 7 ? m + '-01' : m); return Number.isFinite(t) ? new Date(t).toLocaleDateString('sk-SK', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(m || 'mesiac') }
const STAGE = { new: 'Nový', contacted: 'Kontaktovaný', viewing: 'Obhliadka', offer: 'Ponuka' }
const MAINT_URGENT = ['critical', 'high', 'urgent']

export function buildLive(raw = {}, now = Date.now()) {
  const iso = new Date(now).toISOString()
  const areas = {}, sources = [], signals = []
  const src = (key, row) => sources.push({ key, ...row })
  const failed = (key, x, note) => src(key, { status: 'off', last_error: err(x) || 'Zdroj neodpovedal', last_error_at: iso, note })

  /* ---------- Prevádzka: rezervácie a byty (zrkadlo Guesty), práčovňa, opravy ---------- */
  const facts = ok(raw.facts) ? raw.facts.data : null, dash = ok(raw.dash) ? raw.dash.data : null, work = ok(raw.work) ? raw.work.data : null
  const cases = ok(raw.maint) ? raw.maint.data : null, damages = ok(raw.damages) ? raw.damages.data : null
  const numbers = ok(raw.numbers) ? raw.numbers.data : null
  if ((facts || dash) && numbers && numbers.updated_at) {
    src('guesty', { status: 'live', last_ok_at: new Date(numbers.updated_at).toISOString(), account: 'Zrkadlo Guesty v databáze appky', note: 'Rezervácie a byty sa čítajú zo zrkadla Guesty v databáze. Čas je z posledného hodinového prepočtu čísel z rezervácií.' })
  } else if (facts || dash) {
    src('guesty', { status: 'partial', account: 'Zrkadlo Guesty v databáze appky', note: 'Rezervácie a byty sa čítajú zo zrkadla, ktoré plní Práčovňa. Čas jeho poslednej synchronizácie sa nepodarilo zistiť, preto „čiastočne“.' })
  } else failed('guesty', raw.facts, 'Prehľad rezervácií sa nepodarilo načítať.')
  if (cases) src('maintenance', { status: 'live', last_ok_at: iso, account: 'Údržba v appke' }); else failed('maintenance', raw.maint, 'Prípady údržby sa nepodarilo načítať.')
  if (damages) src('asana', { status: 'live', last_ok_at: iso, account: 'Asana cez ASANA_TOKEN appky', note: 'Čítajú sa otvorené úlohy projektu Damages Reporting (obnova každých 5 minút). Zápis z ústredne do Asany zatiaľ nie je zapnutý.' })
  else src('asana', { status: 'pending', note: raw.damages && raw.damages.error ? 'Asana neodpovedala: ' + err(raw.damages) : 'Server nemá ASANA_TOKEN, úlohy z Asany sa nečítajú.' })
  {
    const urgent = (cases || []).filter((c) => MAINT_URGENT.includes(String(c.severity || '').toLowerCase()))
    areas.operations = {
      metrics: [
        { label: 'Príchody dnes', value: show(facts && facts.arrivals), note: facts ? `zajtra ${show(facts.tomorrow_arrivals)}` : 'nenačítané', href: '/' },
        { label: 'Odchody dnes', value: show(facts && facts.departures), note: 'z rezervácií Guesty', href: '/' },
        { label: 'Hostia v bytoch', value: show(facts && facts.guests_in_house), note: dash ? `obsadenosť ${show(dash.occupancy, ' %')}` : 'obsadenosť nenačítaná', href: '/' },
        { label: 'Otvorené opravy', value: cases ? show(cases.length) : '–', note: cases ? `${urgent.length} naliehavých` : 'nenačítané', href: '/udrzba' },
      ],
      lists: [
        { title: 'Dnešné príchody', link: ['Domov appky', '/'], empty: dash ? 'Dnes žiadne príchody.' : 'Zoznam príchodov sa nepodarilo načítať.', rows: ((dash && dash.arrivals_list) || []).slice(0, 8).map((r) => ({ title: r.name || 'Byt', sub: [r.city, r.guests != null ? `${r.guests} ${plural(r.guests, 'hosť', 'hostia', 'hostí')}` : '', r.nights != null ? `${r.nights} ${plural(r.nights, 'noc', 'noci', 'nocí')}` : ''].filter(Boolean).join(' · '), badge: r.source || '', tone: 'gray', href: '/' })) },
        { title: 'Otvorené prípady údržby', link: ['Údržba', '/udrzba'], empty: cases ? 'Žiadny otvorený prípad.' : 'Údržbu sa nepodarilo načítať.', rows: (cases || []).slice(0, 8).map((c) => ({ title: `${c.ref ? c.ref + ' · ' : ''}${c.listing_name || 'Byt'}`, sub: [c.category, String(c.symptoms || '').slice(0, 90), c.assignee_email ? 'rieši ' + c.assignee_email.split('@')[0] : 'bez riešiteľa'].filter(Boolean).join(' · '), badge: c.status, tone: MAINT_URGENT.includes(String(c.severity || '').toLowerCase()) ? 'red' : 'orange', href: `/udrzba/${c.id}` })) },
        ...(damages ? [{ title: 'Škody a opravy v Asane', link: ['Údržba', '/udrzba'], empty: 'V Asane nie je otvorená úloha.', rows: damages.slice(0, 6).map((t) => ({ title: t.listing || t.name || 'Úloha', sub: [t.problem, t.assignee ? 'rieši ' + t.assignee : 'nepridelené', t.due_on ? 'termín ' + t.due_on : ''].filter(Boolean).join(' · '), badge: t.section || 'Asana', tone: 'gray', href: t.url, external: true })) }] : []),
      ],
      notes: [work ? `Práčovňa: dnes treba zabaliť ${show(work.today_todo)} tašiek, zabalených ${show(work.today_packed)}, zajtra ${show(work.tomorrow_total)}.` : 'Údaje Práčovne sa nepodarilo načítať.'],
    }
    if (urgent.length) signals.push({ title: `${urgent.length} ${urgent.length === 1 ? 'naliehavý prípad' : 'naliehavé prípady'} údržby`, sub: urgent.slice(0, 2).map((c) => c.listing_name).filter(Boolean).join(', '), badge: 'Údržba', tone: 'red', href: '/udrzba' })
  }

  /* ---------- CRM: leady, obhliadky, HubSpot ---------- */
  // Počty sa berú z databázy ako presné počty (nie z dĺžky zoznamu), aby ich neskreslil limit 1000 riadkov na dotaz.
  const leads = ok(raw.leadCounts) ? raw.leadCounts.data : null, tasks = ok(raw.leadTasks) ? raw.leadTasks.data : null
  const nameOf = Object.fromEntries(((ok(raw.taskLeads) && raw.taskLeads.data) || []).map((l) => [l.id, l]))
  const overdueRows = (ok(raw.overdue) && raw.overdue.data.rows) || [], overdueCount = ok(raw.overdue) ? (raw.overdue.data.count ?? overdueRows.length) : 0
  const overdue = { length: overdueCount, rows: overdueRows }
  const viewings = (tasks || []).filter((t) => t.kind === 'viewing' && t.due_at).sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
  const upcoming = viewings.filter((t) => Date.parse(t.due_at) >= now - 3600e3), pastOpen = viewings.filter((t) => Date.parse(t.due_at) < now - 3600e3)
  const week = upcoming.filter((t) => Date.parse(t.due_at) < now + 7 * 86400e3)
  if (leads) src('crm', { status: 'live', last_ok_at: iso, account: 'CRM v appke' }); else failed('crm', raw.leadCounts, 'Leady sa nepodarilo načítať (CRM vyžaduje rolu CRM).')
  const sync = ok(raw.crmSync) ? raw.crmSync.data : null, queue = ok(raw.queue) ? raw.queue.data : null
  const qErrors = (queue || []).filter((x) => x.last_error)
  if (sync && sync.last_run) src('hubspot', { status: 'live', last_ok_at: new Date(sync.last_run).toISOString(), account: 'HubSpot cez synchronizáciu CRM (každých 10 minút)', note: queue ? `Vo fronte zápisov čaká ${queue.length}, s chybou ${qErrors.length}.` : null, ...(qErrors.length ? { last_error: 'Zápis do HubSpotu/Asany zlyhal pri ' + qErrors.length + ' položkách', last_error_at: qErrors.length && Date.parse(sync.last_run) < now - 3600e3 ? iso : null } : {}) })
  else src('hubspot', { status: 'pending', note: raw.crmSync && raw.crmSync.error ? 'Stav synchronizácie sa nepodarilo načítať.' : 'Synchronizácia CRM s HubSpotom zatiaľ nezapísala žiadny beh.' })
  const viewRow = (t) => { const l = nameOf[t.lead_id] || {}; const p = t.payload || {}; return { title: `${fmtDT(t.due_at)} · ${l.name || t.title || 'Obhliadka'}`, sub: [p.address || l.city, p.with_name ? 's ' + p.with_name : '', l.assigned_to ? 'rieši ' + String(l.assigned_to).split('@')[0] : ''].filter(Boolean).join(' · '), badge: Date.parse(t.due_at) < now - 3600e3 ? 'Po termíne' : dayKey(t.due_at) === dayKey(now) ? 'Dnes' : 'Naplánované', tone: Date.parse(t.due_at) < now - 3600e3 ? 'red' : dayKey(t.due_at) === dayKey(now) ? 'orange' : '', href: t.lead_id ? `/crm/lead/${t.lead_id}` : '/crm', clock: fmtT(t.due_at), day: dayKey(t.due_at) } }
  areas.visits = {
    metrics: [
      { label: 'Obhliadky · 7 dní', value: tasks ? show(week.length) : '–', note: 'otvorené úlohy typu obhliadka', href: '/crm' },
      { label: 'Dnes', value: tasks ? show(upcoming.filter((t) => dayKey(t.due_at) === dayKey(now)).length) : '–', note: 'podľa času v CRM', href: '/crm' },
      { label: 'Po termíne', value: tasks ? show(pastOpen.length) : '–', note: 'obhliadka bez zapísaného výsledku', href: '/crm' },
      { label: 'Leady po lehote', value: leads ? show(overdue.length) : '–', note: 'nové, bez prvého kontaktu', href: '/crm' },
    ],
    lists: [
      { title: 'Najbližšie obhliadky', link: ['CRM', '/crm'], empty: tasks ? 'V CRM nie je naplánovaná žiadna obhliadka.' : 'Úlohy CRM sa nepodarilo načítať.', rows: upcoming.slice(0, 10).map(viewRow) },
      ...(pastOpen.length ? [{ title: 'Obhliadky bez zapísaného výsledku', link: ['CRM', '/crm'], rows: pastOpen.slice(-8).reverse().map(viewRow) }] : []),
    ],
    notes: ['Obhliadky sú z úloh v CRM. Google Calendar tímu nie je pripojený, takže iné stretnutia tu nie sú.'],
  }
  if (overdue.length) signals.push({ title: `${overdue.length} ${overdue.length === 1 ? 'lead čaká' : overdue.length < 5 ? 'leady čakajú' : 'leadov čaká'} po lehote`, sub: overdue.rows.slice(0, 3).map((l) => l.name).filter(Boolean).join(', '), badge: 'CRM', tone: 'red', href: '/crm' })
  if (pastOpen.length) signals.push({ title: `${pastOpen.length} ${pastOpen.length === 1 ? 'obhliadka' : 'obhliadok'} bez zapísaného výsledku`, sub: 'Termín prešiel a úloha je stále otvorená.', badge: 'Obhliadky', tone: 'orange', href: '/crm' })

  /* ---------- Nehnuteľnosti: cesta leadu + investičné ponuky ---------- */
  const props = ok(raw.invProps) ? raw.invProps.data : null, inq = ok(raw.invInq) ? raw.invInq.data : null, invSrc = ok(raw.invSources) ? raw.invSources.data : null
  const byStage = leads || {}
  const activeProps = (props || []).filter((p) => !['sold', 'withdrawn'].includes(p.status))
  if (invSrc) {
    const lastOk = max(invSrc.filter((x) => x.enabled).map((x) => x.last_ok_at)), bad = invSrc.filter((x) => x.enabled && x.last_error_at && (!x.last_ok_at || x.last_error_at > x.last_ok_at))
    src('invest-feed', lastOk ? { status: 'live', last_ok_at: lastOk, account: `${invSrc.filter((x) => x.enabled).length} zapnutých zdrojov ponúk`, ...(bad.length ? { note: 'S chybou: ' + bad.map((x) => x.name || x.key).join(', ') } : {}) } : { status: 'pending', note: 'Zdroje investičných ponúk zatiaľ nemajú úspešný beh.' })
  } else src('invest-feed', { status: 'pending', note: 'Stav zdrojov investičných ponúk sa nepodarilo načítať.' })
  areas.properties = {
    metrics: [
      ...['new', 'contacted', 'viewing', 'offer'].map((s) => ({ label: 'Leady · ' + STAGE[s], value: leads ? show(byStage[s] || 0) : '–', note: s === 'new' ? `${overdue.length} po lehote` : 'otvorené', href: '/crm' })),
    ],
    lists: [
      { title: 'Investičné nehnuteľnosti', link: ['Otvoriť', '/investicie'], empty: 'Údaje investícií sa nepodarilo načítať.', rows: props ? [
        { title: `${show(activeProps.length)} aktívnych ponúk`, sub: `z ${show(props.length)} v databáze`, badge: 'Ponuky', tone: '', href: '/investicie' },
        { title: `${show((inq || []).filter((q) => !['closed', 'lost', 'done'].includes(q.status)).length)} otvorených dopytov klientov`, sub: inq ? `z ${show(inq.length)} dopytov` : 'dopyty nenačítané', badge: 'Dopyty', tone: '', href: '/investicie/dopyty' },
      ] : [] },
    ],
    notes: [facts && facts.listings != null ? `V prevádzke je ${show(facts.listings)} nehnuteľností (zrkadlo Guesty).` : 'Počet bytov v prevádzke sa nepodarilo načítať.', 'Karta jedného bytu naprieč CRM, Guesty a úlohami zatiaľ neexistuje; odkazy vedú do príslušných modulov.'],
  }

  /* ---------- Marketing: nápady na obsah, newsletter ---------- */
  const ideas = ok(raw.ideas) ? raw.ideas.data : null, lastNl = ok(raw.newsletter) ? (raw.newsletter.data || [])[0] : null
  const ideaCount = (s) => (ideas || []).filter((i) => i.status === s).length
  areas.marketing = {
    metrics: [
      { label: 'Nápady · nové', value: ideas ? show(ideaCount('new')) : '–', note: 'čakajú na výber', href: '/napady' },
      { label: 'Nápady · vybrané', value: ideas ? show(ideaCount('selected')) : '–', note: 'čakajú na scenár', href: '/napady' },
      { label: 'Scenáre hotové', value: ideas ? show(ideaCount('script_done')) : '–', note: 'pripravené na natáčanie', href: '/napady' },
      { label: 'Posledný newsletter', value: lastNl && lastNl.sent_at ? fmtD(lastNl.sent_at) : '–', note: lastNl ? `${show(lastNl.sent_count)} odoslaných` : raw.newsletter && raw.newsletter.error ? 'nenačítané' : 'zatiaľ žiadny', href: '/newsletter' },
    ],
    lists: lastNl ? [{ title: 'Naposledy odoslané', link: ['Newsletter', '/newsletter'], rows: [{ title: lastNl.subject || 'Newsletter', sub: `${fmtD(lastNl.sent_at)} · ${show(lastNl.sent_count)} príjemcov`, badge: 'Odoslané', tone: '', href: '/newsletter' }] }] : [],
    notes: ['Zobrazenia videí a výkon kampaní tu nie sú: účty YouTube, Meta a TikTok nie sú k appke pripojené.'],
  }
  src('content', ideas ? { status: 'live', last_ok_at: iso, account: 'Nápady na obsah a newsletter v appke' } : { status: 'off', last_error: err(raw.ideas) || 'nenačítané', last_error_at: iso })

  /* ---------- Financie: vyúčtovanie majiteľom, ekonomika ---------- */
  const period = ok(raw.billing) ? raw.billing.data : null, eco = ok(raw.economy) ? raw.economy.data : null
  areas.finance = {
    metrics: [
      { label: 'Vyúčtovanie · ' + (period ? monthLabel(period.month) : 'mesiac'), value: period ? eur(period.stats.sumC) : '–', note: period ? `${show(period.stats.apts)} bytov · ${period.status === 'closed' ? 'uzavreté' : 'otvorené'}` : 'nenačítané', href: '/vyuctovanie' },
      { label: 'Riadky bez sumy', value: period ? show(period.stats.missing) : '–', note: period ? `${show(period.stats.zistit)} treba zistiť` : '', href: '/vyuctovanie' },
      { label: 'Čaká na cenu opravy', value: period ? show(period.stats.patrik) : '–', note: 'vo vyúčtovaní', href: '/vyuctovanie' },
      { label: 'Ekonomika', value: eco && eco.updated_at ? fmtD(eco.updated_at) : '–', note: eco && eco.updated_at ? 'posledná aktualizácia podkladu' : 'podklad nedostupný', href: '/ekonomika' },
    ],
    lists: [],
    notes: ['Výnosy, obsadenosť a bankové toky sú v module Ekonomika; ústredňa z neho zatiaľ ukazuje len čas poslednej aktualizácie, nie sumy.'],
  }
  if (eco && eco.updated_at) {
    src('finance', { status: 'live', last_ok_at: new Date(eco.updated_at).toISOString(), account: 'Podklad Ekonomiky (zostavuje Ring) a vyúčtovanie majiteľom' })
    src('pricelabs', { status: 'partial', last_ok_at: new Date(eco.updated_at).toISOString(), account: 'Len ako súčasť podkladu Ekonomiky', note: 'PriceLabs nemá v appke vlastné prepojenie. Jeho údaje sú len vo vnútri podkladu Ekonomiky, ktorý zostavuje Ring.' })
  } else { src('finance', period ? { status: 'partial', last_ok_at: iso, note: 'Vyúčtovanie sa číta; podklad Ekonomiky nie je dostupný.' } : { status: 'off', last_error: err(raw.economy) || err(raw.billing) || 'nenačítané', last_error_at: iso }); src('pricelabs', { status: 'off', note: 'PriceLabs nemá v appke vlastné prepojenie.' }) }
  if (period && period.status !== 'closed' && period.stats.missing > 0) signals.push({ title: `Vyúčtovanie ${monthLabel(period.month)}: ${period.stats.missing} ${plural(period.stats.missing, 'riadok', 'riadky', 'riadkov')} bez sumy`, sub: 'Termín vyúčtovania je 15. v mesiaci.', badge: 'Financie', tone: 'orange', href: '/vyuctovanie' })

  /* ---------- Správy: nástenka tímu; pošta a WhatsApp nie sú pripojené ---------- */
  const notes = ok(raw.board) ? raw.board.data : null
  areas.messages = {
    metrics: [],
    lists: [{ title: 'Nástenka tímu', link: ['Domov appky', '/'], empty: notes ? 'Na nástenke nie je žiadny oznam.' : 'Nástenku sa nepodarilo načítať.', rows: (notes || []).slice(0, 8).map((n) => ({ title: String(n.text || '').slice(0, 140), sub: [n.author_name, n.date].filter(Boolean).join(' · '), badge: 'Oznam', tone: 'gray', href: '/' })) }],
    notes: ['Firemná pošta (Gmail, Outlook) ani WhatsApp nie sú k appke pripojené: appka vie e-maily len odosielať. Správy hostí sú v Zákazníckom servise a v Guesty Inboxe.'],
  }

  /* ---------- Znalosti ---------- */
  const kb = ok(raw.kb) ? (raw.kb.data || [])[0] : null
  areas.knowledge = {
    metrics: [], lists: [],
    notes: [kb && kb.finished_at ? `Znalostná báza Guru sa naposledy obnovila ${fmtDT(kb.finished_at)}${kb.ok === false ? ' s chybou' : ''}.` : 'Čas poslednej obnovy znalostnej bázy sa nepodarilo načítať.'],
  }
  if (kb && kb.finished_at) src('kb', { status: 'live', last_ok_at: kb.ok === false ? null : new Date(kb.finished_at).toISOString(), ...(kb.ok === false ? { last_error: String(kb.error || 'Obnova zlyhala').slice(0, 200), last_error_at: new Date(kb.finished_at).toISOString() } : {}), account: 'Znalostná báza Guru (obnova každých 6 hodín)' })

  /* ---------- to, čo appka nemá ---------- */
  src('gmail', { status: 'off', note: 'Appka nemá čítanie schránok. Treba vybrať firemné schránky a spôsob prístupu.' })
  src('outlook', { status: 'off', note: 'Appka nemá čítanie schránok. Treba vybrať firemné schránky a spôsob prístupu.' })
  src('whatsapp', { status: 'off', note: 'Appka má len odkazy na WhatsApp, nie prístup ku konverzáciám.' })
  src('calendar', { status: 'off', note: 'Google Calendar nie je k appke pripojený. Obhliadky sa berú z úloh v CRM.' })
  src('social', { status: 'off', note: 'Účty YouTube, Meta a TikTok nie sú k appke pripojené.' })

  const today = upcoming.filter((t) => dayKey(t.due_at) === dayKey(now)).map(viewRow)
  // Podklady pre grafy a živé čísla: len to, čo zdroje naozaj vrátili (inak null a graf sa nevykreslí).
  const pct = (v) => (num(v) == null ? null : Math.max(0, Math.min(100, num(v))))
  const bk = dash ? pct(dash.booking_pct) : null, ab = dash ? pct(dash.airbnb_pct) : null
  const charts = {
    week: dash && Array.isArray(dash.week) ? dash.week.slice(0, 7).map((d) => ({ day: d.day, label: new Date(d.day + 'T12:00:00Z').toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }), today: d.day === dayKey(now), arr: num(d.arr) || 0, dep: num(d.dep) || 0 })) : null,
    cities: dash && Array.isArray(dash.cities) ? dash.cities.slice(0, 6).map((c) => ({ label: c.city || '–', value: num(c.guests) || 0, sub: `${show(c.staying)} ${plural(num(c.staying) || 0, 'pobyt', 'pobyty', 'pobytov')}` })) : null,
    channels: bk != null && ab != null ? [{ label: 'Booking', pct: bk }, { label: 'Airbnb', pct: ab }, { label: 'Ostatné', pct: Math.max(0, 100 - bk - ab) }] : null,
    funnel: leads ? ['new', 'contacted', 'viewing', 'offer'].map((s) => ({ label: STAGE[s], value: byStage[s] || 0 })) : null,
    occupancy: dash ? pct(dash.occupancy) : null,
  }
  const kpis = {
    arrivals: facts ? num(facts.arrivals) : null, departures: facts ? num(facts.departures) : null, guests: facts ? num(facts.guests_in_house) : null, listings: facts ? num(facts.listings) : null,
    occupancy: charts.occupancy, next7: dash ? num(dash.next7_arrivals) : null, avgStay: dash ? num(dash.avg_stay) : null, monthNights: dash ? num(dash.month_nights) : null,
    staysYtd: numbers ? num(numbers.stays_ytd) : null, staysYtdPrev: numbers ? num(numbers.stays_ytd_prev) : null, nightsYtd: numbers ? num(numbers.nights_ytd) : null, guestsSince2025: numbers ? num(numbers.guests_since_2025) : null,
    overdueLeads: leads ? overdue.length : null, openRepairs: cases ? cases.length : null,
  }
  return {
    areas, sources, signals, charts, kpis,
    overview: {
      calendar: (today.length ? today : week.slice(0, 4).map(viewRow)).slice(0, 5), calendarTitle: today.length ? 'Dnes v kalendári' : 'Najbližšie obhliadky', calendarCount: tasks ? week.length : null,
      marketing: areas.marketing.metrics.slice(0, 3).map((m) => ({ title: `${m.value} · ${m.label}`, sub: m.note, href: m.href })),
      operations: facts ? `${show(facts.arrivals)} ${plural(num(facts.arrivals) || 0, 'príchod', 'príchody', 'príchodov')}, ${show(facts.departures)} ${plural(num(facts.departures) || 0, 'odchod', 'odchody', 'odchodov')}, ${show(facts.guests_in_house)} hostí v bytoch` : null,
    },
  }
}
