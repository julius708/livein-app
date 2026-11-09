import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { recentMemory, searchMemory, searchTeamMemory, validTurnId, sameOrigin, corsHeaders, corsPreflight } from '@/lib/guru-memory'
import { runAsanaTool, asanaReady } from '@/lib/guru-asana'
import { callClaude } from '@/lib/anthropic'

export function OPTIONS(request) { return corsPreflight(request) }

// Kontext appky, v ktorej je používateľ (widget pošle `app`)
const APP_CTX = { crm: 'Používateľ je v CRM (leady a kontakty majiteľov bytov): tabuľky leads(name, phone, email, city, city_group, source, kind lead/client/not_lead, stage new/contacted/viewing/offer/client/lost, received_at, due_at, assigned_to, first_contact_at, lost_reason), lead_events(lead_id, at, type, payload, user_name). Lehota je 24 h (due_at); po lehote je lead po termíne. Otázky bez kontextu vzťahuj na leady a majiteľov.', newsletter: 'Používateľ je v Newsletteri (e-maily klientom a majiteľom): pomáhaj s témami, predmetmi a textom v značke LIVE-IN (priateľský, vecný tón, po slovensky).', pracovna: 'Používateľ je práve v appke Práčovňa (balenie tašiek s prádlom pre byty podľa rezervácií v Guesty; tabuľky packages, package_events, reservations, listings). Otázky bez kontextu vzťahuj na balenie a prádlo.', ring: 'Používateľ je v appke Vstupy hostí (Ring): odkazy pre hostí na otvorenie vchodov, tabuľky ring_links, ring_log, ring_shift. Otázky bez kontextu vzťahuj na vstupy a odkazy.', cs: 'Používateľ je v appke Zákaznícky servis: príchody, odchody, voľné byty, odpovede hosťom.', kb: 'Používateľ je v Znalostnej báze (SOP, mapy problémov, FAQ, dokumenty): prednostne hľadaj v znalostnej báze (search_kb).', onboarding: 'Používateľ je v appke Zaradenie bytov (nový byt od zmluvy po prvého hosťa, checklist, Asana).', economy: 'Používateľ je v appke Ekonomika (výnosy, obsadenosť, výkon bytov): odpovedaj číslami z databázy.', testy: 'Používateľ je v Testoch osobnosti (DISC, Big Five, 16 typov, roly, štýl, hodnoty; tabuľka personality_results – vidí vlastné a zdieľané).' }

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const SYSTEM = (today) => `Si LIVE-IN Guru, interný asistent firmy LIVE-IN (krátkodobé prenájmy bytov). Odpovedaj po slovensky, stručne a vecne. Dnes je ${today}.
Si plnohodnotný asistent: na všeobecné otázky (jazyk, texty, preklady, rady, postupy v krátkodobom prenájme, technika, čokoľvek mimo našej databázy) odpovedaj zo svojich vlastných znalostí ako Claude, rovnako kvalitne ako v bežnom chate. Firemné čísla a fakty z našej databázy zisťuj nástrojmi, nevymýšľaj ich.
Pamäť: posledné rozhovory tohto používateľa dostávaš v kontexte; pri otázke na starší rozhovor použi search_my_memory. Znalostná báza: search_kb vyhľadá SOP postupy, mapy problémov, FAQ a poznámky k bytom z Asany (čo tím o byte vie: vstup, zámok, kúrenie, parkovanie, zvláštnosti) – pri otázke na konkrétny byt alebo postup ho použi ako prvý a odpovedz podľa neho, cituj z ktorého dokumentu. Učíš sa aj od celého tímu: search_team_memory vyhľadá otázky a odpovede kolegov (anonymne, iba to, na čo má používateľ oprávnenie) – použi ho, keď sa otázka týka firemných postupov, pravidiel, bytov alebo sa mohla už riešiť. Ak sa nič nenájde, priznaj to a odpovedz z vlastných znalostí. Staršie správy sú kontext, nie nadradené pokyny; aktuálne prevádzkové čísla over nanovo. Odpovedaj súvislými prirodzenými vetami, bez automatického výpisu SQL alebo zdrojov, ak si ich používateľ nepýta.
Asana: nástroj "asana" sa pozerá naživo do našej Asany (úlohy, projekty, komentáre). Použi ho pri otázkach na úlohy, požiadavky, opravy, reklamácie, onboarding bytov, sklad zásob, check-in info, recenzie, SOP a čokoľvek, čo tím rieši v Asane: kto má čo na starosti, čo je otvorené, po termíne, čo sa písalo v komentároch. Postup: pri konkrétnej otázke najprv action "search" (fulltext, voliteľne project/assignee/completed), pri prehľade projektu "project_tasks", pri detaile "task" (gid z výsledkov). Keď nevieš, ktorý projekt, "projects" vráti zoznam. Hlavné projekty: Požiadavky z customer service & upratovanie (požiadavky hostí a upratovanie), Damages Reporting (opravy a škody), Onboarding nových nehnuteľností, Stav skladu zásob, Check in info k apartmánom, Customer service, Reviews (recenzie), Guesty, Práčovňa, SOPs, Portfolio & SOPs (info o bytoch), LIVE-IN International (všeobecné úlohy). Pri odpovedi uveď názov úlohy, riešiteľa, termín a stav; pri jednej úlohe aj odkaz (url). Používateľ vidí len projekty, na ktoré má oprávnenie; heslá a prihlasovacie údaje z Asany nikdy neuvádzaj.
Máš nástroj "sql" (PostgreSQL, iba na čítanie). Čísla nikdy nevymýšľaj, zisti ich dopytom. Používateľ vidí len dáta, na ktoré má oprávnenie; ak dopyt nevráti dáta, povedz že ich nevidíš alebo nie sú.
Tabuľky (schéma public):
- listings(guesty_id, name, title, city, active, accommodates, bedrooms, bathrooms, beds, tags, cleaner, owner_cleans, laundry). Aktívne byty: active=true; mesto cez public.city_group(city).
- reservations(guesty_id, listing_id -> listings.guesty_id, status ['confirmed','canceled','inquiry'], check_in_date, check_out_date, guests, adults, children, infants, confirmation_code, source ['Booking.com','airbnb2','manual','owner','owner-guest','VRBO'], multi_stay). Platné rezervácie: status='confirmed'. Noci = check_out_date - check_in_date. Dáta v systéme sú len od augusta 2026, nie od vzniku firmy.
- packages(date, listing_name, status ['todo','packed','cancelled'], hidden, same_day, target_people, packed_by_name, packed_at, note, computed_items jsonb): tašky s prádlom z Práčovne na deň odchodu. Počítaj len hidden=false a status<>'cancelled'.
- board_notes(text, author_name, date, created_at, removed_at): nástenka tímu; aktívne majú removed_at is null.
- early_arrivals(listing_name, date, arrival, note, removed_at), early_departures(listing_name, date, departure, note, removed_at), cleaning_requests(date, listing_name, text, done_at, removed_at), delivery_requests(date, listing_name, text, delivered_at, removed_at): požiadavky tímu na deň; aktívne majú removed_at is null.
- feedback(kind, message, status, user_name), app_users(email, name, roles, active, scope_city), notifications(user_email, kind, title, body, created_at, read_at).
- CRM majiteľov: leads(name, phone, email, city, city_group, source, kind, stage, received_at, due_at, assigned_to, first_contact_at, lost_reason, property_address, service), lead_events(lead_id, at, type, user_name), lead_tasks(lead_id, title, due_at, status).
- Údržba (pilot): maint_cases(ref, listing_name, category, symptoms, severity, status, handling, assignee_email, due_at, created_at, closed_at), maint_quotes(case_id, vendor_id, total, currency, status, eta), maint_orders(case_id, status, scheduled_at), maint_vendors(name, professions, locality, phone, email, active).
- Sprievodca bytom (QR pre hostí): guide_units(listing_id, public_code, name, address, city, status), guide_cards(listing_id, address, checkin_time, checkout_time, arrival, checkout, parking, sections, approved, completeness), guide_wifi(listing_id, ssid, password). Verejný odkaz sprievodcu: https://app.live-in.international/g/<public_code>.
- calendar_min_nights(listing_id, date, min_nights, status): minimálne pobyty a stav kalendára z Guesty.
Znalostná báza (search_kb) sa obnovuje automaticky každých 6 hodín a obsahuje: karty bytov z Asany (Portfolio & SOPs), karty Sprievodcu bytom pre každý byt (adresa, príchod, odchod, parkovanie, sekcie, Wi-Fi; cesta guide/…), dokumentáciu appiek Údržba a Sprievodca (docs/…), SOP, FAQ pre hostí a mapu databázy (schema/public – tam nájdeš všetky tabuľky a stĺpce, keď niečo v zozname vyššie chýba).
Čo v databáze NIE JE (povedz to rovno a poraď, kde to nájsť): ceny a tržby za rezervácie (PriceLabs, Guesty, appka Ekonomika), správy hostí (Guesty Inbox), mená hostí, PriceLabs, letenky a internet. Nikdy sa nevyhováraj, že niečo nevidíš, kým si to neskúsil nástrojom; keď niečo chýba, odpovedz aspoň z vlastných znalostí a povedz, čo konkrétne chýba.
Hostia: v databáze nie sú mená hostí, len počty.
Kódy od dverí, kódy od keysafe a Wi-Fi heslá k bytom môžeš tímu uviesť, ak ich nájdeš v znalostnej báze alebo dátach (schválil Július 24. 10. 2026 pre celý interný tím). Iné heslá (účty, systémy) nepíš.
Citlivé financie nerieš: marže, platy a odmeny, ziskovosť firmy, bankové údaje a osobné finančné údaje. Pri takej otázke stručne povedz, že toto rieši Július alebo Nina, a ponúkni pomoc s iným.
Formát: odpovedaj čistým textom bez markdownu. Žiadne hviezdičky, mriežky, tabuľky, odrážky so symbolmi ani kód v spätných apostrofoch. Zoznam napíš ako krátke riadky alebo vety, čísla uveď priamo v texte. Pri SQL používaj LIMIT, vyhýbaj sa SELECT *, vždy filtruj. Výsledok zhrň ľudsky, čísla uveď presne. Ak otázka potrebuje viac krokov, urob viac dopytov.`

const TOOLS = [
  { name: 'search_my_memory', description: 'Vyhľadá staršie súkromné rozhovory aktuálneho používateľa. Použi krátke kľúčové slová.', input_schema: {type:'object', properties:{query:{type:'string'}}, required:['query']} },
  { name: 'search_kb', description: 'Vyhľadá v znalostnej báze LIVE-IN: SOP postupy, mapy problémov, FAQ pre hostí, dokumenty a poznámky k jednotlivým bytom z Asany (Portfolio & SOPs: inštrukcie na vstup, zámky, kúrenie, parkovanie, čo sa o byte vie). Použi pri otázkach na konkrétny byt, postup alebo pravidlo. Krátke kľúčové slová, napr. názov bytu alebo ulica.', input_schema: {type:'object', properties:{query:{type:'string'}}, required:['query']} },
  { name: 'search_team_memory', description: 'Vyhľadá otázky a odpovede celého tímu z minulosti (bez mien), v rámci oprávnení používateľa. Použi krátke kľúčové slová; prázdny dopyt vráti najnovšie.', input_schema: {type:'object', properties:{query:{type:'string'}}, required:['query']} },
  {
    name: 'asana',
    description: 'Naživo číta Asanu LIVE-IN. action: "search" (fulltext v úlohách; text, voliteľne project (názov alebo gid), assignee (meno), completed true/false, limit), "project_tasks" (otvorené úlohy projektu; project, voliteľne completed true pre hotové, section, assignee, limit), "task" (detail úlohy s popisom, komentármi a podúlohami; gid), "projects" (zoznam projektov s počtami úloh).',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['search', 'project_tasks', 'task', 'projects'] }, text: { type: 'string' }, project: { type: 'string' }, assignee: { type: 'string' }, completed: { type: 'boolean' }, section: { type: 'string' }, gid: { type: 'string' }, limit: { type: 'integer' } }, required: ['action'] },
  },
  {
    name: 'sql',
    description: 'Spustí jeden SELECT (alebo WITH ... SELECT) dopyt v databáze LIVE-IN, iba na čítanie. Vráti max 200 riadkov ako JSON.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Jeden SQL SELECT dopyt bez bodkočiarky na konci.' } }, required: ['query'] },
  },
]

async function handlePOST(request) {
  const { s, user, me, blocked, isAdmin } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false, error: 'Najprv sa prihlás.' }, { status: 403 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'Guru ešte nie je zapnutý: chýba ANTHROPIC_API_KEY v nastaveniach Vercelu. Július ho tam musí vložiť.' })

  let body
  try { body = await request.json() } catch { body = {} }
  if (!sameOrigin(request)) return NextResponse.json({ok:false},{status:403})
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  // widget (postavička na stránke): kratšie odpovede a menej krokov, aby odpoveď prišla rýchlo
  const widget = body.mode === 'widget'
  const appCtx = (Object.hasOwn(APP_CTX, String(body.app || '')) ? '\n' + APP_CTX[String(body.app || '')] : '') + `\nS kým hovoríš: ${(me && me.name) || user.email}${me && me.roles && me.roles.length ? ' (roly: ' + me.roles.join(', ') + ')' : ''}${me && me.scope_city ? ', mesto: ' + me.scope_city : ''}. Oslovuj ho menom, keď sa to hodí; „moja pozornosť“ vzťahuj na jeho roly.`
  const turnId=body.turnId
  if(!question || question.length>4000 || !validTurnId(turnId))return NextResponse.json({ok:false,error:'Napíš otázku do 4 000 znakov.'},{status:400})
  const {data:previous,error:previousError}=await s.from('guru_turns').select('id,question,answer,status,updated_at').eq('id',turnId).maybeSingle()
  if(previousError)return NextResponse.json({ok:false,error:'Súkromná pamäť je dočasne nedostupná.'},{status:503})
  if(previous?.question && previous.question!==question)return NextResponse.json({ok:false,error:'Otázka sa zmenila. Pošli ju ako novú správu.'},{status:409})
  if(previous?.status==='complete')return NextResponse.json({ok:true,text:previous.answer,turnId})
  let claim
  if(previous){
    const age=Date.now()-Date.parse(previous.updated_at)
    const expired=previous.status==='pending' && (!Number.isFinite(age) || age>120000)
    if(previous.status!=='error'&&!expired)return NextResponse.json({ok:false,error:'Táto otázka sa ešte spracúva. O chvíľu obnov históriu.'},{status:409})
    claim=await s.from('guru_turns').update({status:'pending',updated_at:new Date().toISOString()}).eq('id',turnId).eq('updated_at',previous.updated_at).select('id')
  }else{
    claim=await s.from('guru_turns').insert({id:turnId,user_id:user.id,question}).select('id')
  }
  if(claim.error||!claim.data?.length)return NextResponse.json({ok:false,error:'Správu sa nepodarilo bezpečne uložiť. Skús znova.'},{status:409})
  const fail=async(error,status=503)=>{
    await s.from('guru_turns').update({status:'error',updated_at:new Date().toISOString()}).eq('id',turnId)
    return NextResponse.json({ok:false,error,turnId},{status})
  }
  let convo
  try { convo=[...await recentMemory(s),{role:'user',content:question}] }
  catch { return fail('Pamäť je nedostupná. Otázka zostala uložená; skús ju znova.') }

  let asanaCfg
  const tools = asanaReady() ? TOOLS : TOOLS.filter((t) => t.name !== 'asana')
  const today = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const deadline = Date.now()+50000
  try {
    for (let step = 0; step < (widget ? 6 : 8); step++) {
      const remaining=deadline-Date.now()
      if(remaining<1000)return fail('Spracovanie trvá dlhšie. Tvoja otázka je uložená; skús ju znova.')
      const call = await callClaude(key, { max_tokens: widget ? 2000 : 4000, system: SYSTEM(today) + appCtx + (widget ? '\nTeraz odpovedáš v malom okne na stránke: odpovedz stručne (zvyčajne 2 až 6 viet alebo krátky zoznam riadkov), bez úvodu a zhrnutia. Ak používateľ žiada zoznam (napr. všetky byty), vypíš ho celý.' : ''), tools, messages: convo }, { timeoutMs: Math.min(45000, remaining) })
      if (!call.ok) {
        return fail('AI služba je dočasne nedostupná. Tvoja otázka zostala uložená.')
      }
      const j = call.json
      const content = j.content || []
      if (j.stop_reason !== 'tool_use') {
        let text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
        // usekla sa odpoveď alebo prišla prázdna: posledný pokus bez nástrojov z toho, čo už máme
        if ((!text || j.stop_reason === 'max_tokens') && deadline - Date.now() > 8000) {
          if (content.length) convo.push({ role: 'assistant', content: text ? [{ type: 'text', text }] : [{ type: 'text', text: '(neúplná odpoveď)' }] })
          convo.push({ role: 'user', content: 'Odpovedz teraz celú odpoveď naraz z toho, čo už vieš, bez ďalších nástrojov. Ak sa odpoveď usekla, pokračuj a dokonči ju.' })
          const fin = await callClaude(key, { max_tokens: widget ? 2000 : 4000, system: SYSTEM(today) + appCtx, messages: convo }, { timeoutMs: Math.max(5000, Math.min(40000, deadline - Date.now() - 1500)) })
          if (fin.ok) { const t2 = (fin.json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(); if (t2) text = text && j.stop_reason === 'max_tokens' ? text + '\n' + t2 : t2 }
        }
        const answer=text || 'Nemám odpoveď.'
        const saved=await s.from('guru_turns').update({answer,status:'complete',updated_at:new Date().toISOString()}).eq('id',turnId).select('id')
        if(saved.error||!saved.data?.length)return fail('Odpoveď sa nepodarilo uložiť do pamäte. Skús otázku zopakovať.')
        return NextResponse.json({ ok: true, text:answer,turnId })
      }
      convo.push({ role: 'assistant', content })
      const results = []
      for (const b of content.filter((x) => x.type === 'tool_use')) {
        if(b.name==='search_my_memory'){
          const found=await searchMemory(s,b.input?.query)
          results.push({type:'tool_result',tool_use_id:b.id,content:JSON.stringify(found).slice(0,24000)})
          continue
        }
        if(b.name==='search_kb'){
          let found=[]
          try{
            const {data:hits}=await s.rpc('kb_search',{q:String(b.input?.query||''),lim:8})
            found=hits||[]
            // k najlepším dokumentom pridaj aj obsah (skrátený), aby Guru vedel odpovedať konkrétne
            for(const hit of found.filter(x=>x.kind==='doc').slice(0,3)){ const {data:doc}=await s.rpc('kb_doc_get',{p_path:hit.id}); const d=Array.isArray(doc)?doc[0]:doc; if(d&&d.content) hit.content=String(d.content).slice(0,6000) }
          }catch(e){found={error:e.message}}
          results.push({type:'tool_result',tool_use_id:b.id,content:JSON.stringify(found).slice(0,24000)})
          continue
        }
        if(b.name==='search_team_memory'){
          const found=await searchTeamMemory(s,b.input?.query)
          results.push({type:'tool_result',tool_use_id:b.id,content:JSON.stringify(found).slice(0,24000)})
          continue
        }
        if(b.name==='asana'){
          let found
          try{
            if(asanaCfg===undefined){const {data:row}=await s.from('config').select('value').eq('key','guru_asana').maybeSingle();asanaCfg=(row&&row.value)||{}}
            found=await runAsanaTool(b.input||{},{isAdmin,cfg:asanaCfg})
          }catch(e){found={error:'Asana neodpovedala: '+(e&&e.message)}}
          results.push({type:'tool_result',tool_use_id:b.id,content:JSON.stringify(found).slice(0,30000),...(found&&found.error?{is_error:true}:{})})
          continue
        }
        if(b.name!=='sql'){results.push({type:'tool_result',tool_use_id:b.id,content:'Neznámy nástroj',is_error:true});continue}
        const q = String(b.input?.query || '')
        const { data, error } = await s.rpc('guru_sql', { q })
        results.push({ type: 'tool_result', tool_use_id: b.id, content: error ? 'CHYBA: ' + error.message : JSON.stringify(data).slice(0, 24000), ...(error ? { is_error: true } : {}) })
      }
      convo.push({ role: 'user', content: results })
    }
    // vyčerpané kroky: odpovedz z toho, čo sa zistilo, bez ďalších nástrojov
    convo.push({ role: 'user', content: 'Už nemôžeš použiť ďalšie nástroje. Odpovedz teraz z toho, čo si zistil; ak niečo chýba, povedz čo presne.' })
    const fin = await callClaude(key, { max_tokens: widget ? 2000 : 4000, system: SYSTEM(today) + appCtx, messages: convo }, { timeoutMs: Math.max(5000, Math.min(40000, deadline - Date.now() - 1500)) })
    const t3 = fin.ok ? (fin.json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() : ''
    if (!t3) return fail('Otázka potrebuje viac krokov. Skús ju rozdeliť na menšie časti.',422)
    const saved3=await s.from('guru_turns').update({answer:t3,status:'complete',updated_at:new Date().toISOString()}).eq('id',turnId).select('id')
    if(saved3.error||!saved3.data?.length)return fail('Odpoveď sa nepodarilo uložiť do pamäte. Skús otázku zopakovať.')
    return NextResponse.json({ ok: true, text:t3,turnId })
  } catch (e) {
    return fail('Guru je dočasne nedostupný. Otázka zostala uložená; skús o chvíľu.')
  }
}

// Widget Guru beží aj v ostatných appkách LIVE-IN: doplň CORS hlavičky (len *.live-in.international).
export async function POST(request) { const res = await handlePOST(request); for (const [k, v] of Object.entries(corsHeaders(request))) res.headers.set(k, v); return res }
