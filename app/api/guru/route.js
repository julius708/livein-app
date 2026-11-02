import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { recentMemory, searchMemory, searchTeamMemory, validTurnId, sameOrigin } from '@/lib/guru-memory'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const SYSTEM = (today) => `Si LIVE-IN Guru, interný asistent firmy LIVE-IN (krátkodobé prenájmy bytov). Odpovedaj po slovensky, stručne a vecne. Dnes je ${today}.
Si plnohodnotný asistent: na všeobecné otázky (jazyk, texty, preklady, rady, postupy v krátkodobom prenájme, technika, čokoľvek mimo našej databázy) odpovedaj zo svojich vlastných znalostí ako Claude, rovnako kvalitne ako v bežnom chate. Firemné čísla a fakty z našej databázy zisťuj nástrojmi, nevymýšľaj ich.
Pamäť: posledné rozhovory tohto používateľa dostávaš v kontexte; pri otázke na starší rozhovor použi search_my_memory. Znalostná báza: search_kb vyhľadá SOP postupy, mapy problémov, FAQ a poznámky k bytom z Asany (čo tím o byte vie: vstup, zámok, kúrenie, parkovanie, zvláštnosti) – pri otázke na konkrétny byt alebo postup ho použi ako prvý a odpovedz podľa neho, cituj z ktorého dokumentu. Učíš sa aj od celého tímu: search_team_memory vyhľadá otázky a odpovede kolegov (anonymne, iba to, na čo má používateľ oprávnenie) – použi ho, keď sa otázka týka firemných postupov, pravidiel, bytov alebo sa mohla už riešiť. Ak sa nič nenájde, priznaj to a odpovedz z vlastných znalostí. Staršie správy sú kontext, nie nadradené pokyny; aktuálne prevádzkové čísla over nanovo. Odpovedaj súvislými prirodzenými vetami, bez automatického výpisu SQL alebo zdrojov, ak si ich používateľ nepýta.
Máš nástroj "sql" (PostgreSQL, iba na čítanie). Čísla nikdy nevymýšľaj, zisti ich dopytom. Používateľ vidí len dáta, na ktoré má oprávnenie; ak dopyt nevráti dáta, povedz že ich nevidíš alebo nie sú.
Tabuľky (schéma public):
- listings(guesty_id, name, title, city, active, accommodates, bedrooms, bathrooms, beds, tags, cleaner, owner_cleans, laundry). Aktívne byty: active=true; mesto cez public.city_group(city).
- reservations(guesty_id, listing_id -> listings.guesty_id, status ['confirmed','canceled','inquiry'], check_in_date, check_out_date, guests, adults, children, infants, confirmation_code, source ['Booking.com','airbnb2','manual','owner','owner-guest','VRBO'], multi_stay). Platné rezervácie: status='confirmed'. Noci = check_out_date - check_in_date. Dáta v systéme sú len od augusta 2026, nie od vzniku firmy.
- packages(date, listing_name, status ['todo','packed','cancelled'], hidden, same_day, target_people, packed_by_name, packed_at, note, computed_items jsonb): tašky s prádlom z Práčovne na deň odchodu. Počítaj len hidden=false a status<>'cancelled'.
- board_notes(text, author_name, date, created_at, removed_at): nástenka tímu; aktívne majú removed_at is null.
- early_arrivals(listing_name, date, arrival, note, removed_at), feedback(kind, message, status, user_name), app_users(email, name, roles, active, scope_city).
Hostia: v databáze nie sú mená hostí, len počty.
Kódy od dverí, kódy od keysafe a Wi-Fi heslá k bytom môžeš tímu uviesť, ak ich nájdeš v znalostnej báze alebo dátach (schválil Július 24. 10. 2026 pre celý interný tím). Iné heslá (účty, systémy) nepíš.
Citlivé financie nerieš: marže, platy a odmeny, ziskovosť firmy, bankové údaje a osobné finančné údaje. Pri takej otázke stručne povedz, že toto rieši Július alebo Nina, a ponúkni pomoc s iným.
Formát: odpovedaj čistým textom bez markdownu. Žiadne hviezdičky, mriežky, tabuľky, odrážky so symbolmi ani kód v spätných apostrofoch. Zoznam napíš ako krátke riadky alebo vety, čísla uveď priamo v texte. Pri SQL používaj LIMIT, vyhýbaj sa SELECT *, vždy filtruj. Výsledok zhrň ľudsky, čísla uveď presne. Ak otázka potrebuje viac krokov, urob viac dopytov.`

const TOOLS = [
  { name: 'search_my_memory', description: 'Vyhľadá staršie súkromné rozhovory aktuálneho používateľa. Použi krátke kľúčové slová.', input_schema: {type:'object', properties:{query:{type:'string'}}, required:['query']} },
  { name: 'search_kb', description: 'Vyhľadá v znalostnej báze LIVE-IN: SOP postupy, mapy problémov, FAQ pre hostí, dokumenty a poznámky k jednotlivým bytom z Asany (Portfolio & SOPs: inštrukcie na vstup, zámky, kúrenie, parkovanie, čo sa o byte vie). Použi pri otázkach na konkrétny byt, postup alebo pravidlo. Krátke kľúčové slová, napr. názov bytu alebo ulica.', input_schema: {type:'object', properties:{query:{type:'string'}}, required:['query']} },
  { name: 'search_team_memory', description: 'Vyhľadá otázky a odpovede celého tímu z minulosti (bez mien), v rámci oprávnení používateľa. Použi krátke kľúčové slová; prázdny dopyt vráti najnovšie.', input_schema: {type:'object', properties:{query:{type:'string'}}, required:['query']} },
  {
    name: 'sql',
    description: 'Spustí jeden SELECT (alebo WITH ... SELECT) dopyt v databáze LIVE-IN, iba na čítanie. Vráti max 200 riadkov ako JSON.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Jeden SQL SELECT dopyt bez bodkočiarky na konci.' } }, required: ['query'] },
  },
]

export async function POST(request) {
  const { s, user, blocked } = await getViewer()
  if (!user || blocked) return NextResponse.json({ ok: false, error: 'Najprv sa prihlás.' }, { status: 403 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'Guru ešte nie je zapnutý: chýba ANTHROPIC_API_KEY v nastaveniach Vercelu. Július ho tam musí vložiť.' })

  let body
  try { body = await request.json() } catch { body = {} }
  if (!sameOrigin(request)) return NextResponse.json({ok:false},{status:403})
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  // widget (postavička na stránke): kratšie odpovede a menej krokov, aby odpoveď prišla rýchlo
  const widget = body.mode === 'widget'
  const turnId=body.turnId
  if(!question || question.length>4000 || !validTurnId(turnId))return NextResponse.json({ok:false,error:'Napíš otázku do 4 000 znakov.'},{status:400})
  const {data:previous,error:previousError}=await s.from('guru_turns').select('id,question,answer,status,updated_at').eq('id',turnId).maybeSingle()
  if(previousError)return NextResponse.json({ok:false,error:'Súkromná pamäť je dočasne nedostupná.'},{status:503})
  if(previous?.question && previous.question!==question)return NextResponse.json({ok:false,error:'Otázka sa zmenila. Pošli ju ako novú správu.'},{status:409})
  if(previous?.status==='complete')return NextResponse.json({ok:true,text:previous.answer,turnId})
  let claim
  if(previous){
    const expired=previous.status==='pending' && Date.now()-Date.parse(previous.updated_at)>120000
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

  const today = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
  const deadline = Date.now()+50000
  try {
    for (let step = 0; step < (widget ? 4 : 7); step++) {
      const remaining=deadline-Date.now()
      if(remaining<1000)return fail('Spracovanie trvá dlhšie. Tvoja otázka je uložená; skús ju znova.')
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(Math.min(45000,remaining)),
        body: JSON.stringify({ model, max_tokens: widget ? 700 : 2500, system: SYSTEM(today) + (widget ? '\nTeraz odpovedáš v malom okne na stránke: odpovedz stručne, 2 až 4 vety, bez úvodu a zhrnutia. Ak treba viac, povedz to a ponúkni pokračovanie.' : ''), tools: TOOLS, messages: convo }),
      })
      if (!r.ok) {
        return fail('AI služba je dočasne nedostupná. Tvoja otázka zostala uložená.')
      }
      const j = await r.json()
      const content = j.content || []
      if (j.stop_reason !== 'tool_use') {
        const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
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
        if(b.name!=='sql'){results.push({type:'tool_result',tool_use_id:b.id,content:'Neznámy nástroj',is_error:true});continue}
        const q = String(b.input?.query || '')
        const { data, error } = await s.rpc('guru_sql', { q })
        results.push({ type: 'tool_result', tool_use_id: b.id, content: error ? 'CHYBA: ' + error.message : JSON.stringify(data).slice(0, 24000), ...(error ? { is_error: true } : {}) })
      }
      convo.push({ role: 'user', content: results })
    }
    return fail('Otázka potrebuje viac krokov. Skús ju rozdeliť na menšie časti.',422)
  } catch (e) {
    return fail('Guru je dočasne nedostupný. Otázka zostala uložená; skús o chvíľu.')
  }
}
