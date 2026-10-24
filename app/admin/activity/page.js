import {redirect} from 'next/navigation'
import {getViewer} from '@/lib/auth'
import ActivityRefresh from './refresh'
const apps={app:'LIVE-IN domov',pracovna:'Práčovňa',cs:'Zákaznícky servis',ring:'Vstupy hostí',ekonomika:'Ekonomika'}
const pages={home:'Prehľad',guru:'Guru',feedback:'Feedback',password:'Heslo',users:'Ľudia a práva',settings:'Nastavenia',feedback_admin:'Správa feedbacku',activity:'Aktivita',apartments:'Byty',knowledge:'Znalosti',team:'Tím',audit:'Audit',apartment_detail:'Detail bytu',history:'História',packing_history:'História balenia',status:'Stav',entrances:'Vstupy',overview:'Prehľad',bank:'Banka',forecast:'Výhľad',compare:'Porovnanie',map:'Mapa',insights:'Zistenia'}
const dt=value=>new Intl.DateTimeFormat('sk-SK',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Bratislava'}).format(new Date(value))
export const dynamic='force-dynamic'
export default async function Activity(){
 const {s,isAdmin}=await getViewer();if(!isAdmin)redirect('/')
 const events=await s.rpc('livein_activity_events'), data=events.data||{}
 const rows=data.recent_usage||[], total=data.usage_total||0
 const summary=Object.entries(apps).map(([id,name])=>({id,name,views:0,people:0,...(data.usage_apps||[]).find(a=>a.app===id)}))
 const err=events.error
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Bratislava'})
 const trend=Array.from({length:14},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-13+i);const key=d.toISOString().slice(0,10);return {day:key,views:(data.usage_days||[]).find(a=>a.day===key)?.views||0}})
 const peak=Math.max(1,...trend.map(d=>d.views))
 return <>
  <section className="admin-hero"><div><span className="eyebrow">PRIESTOR PRE VEDENIE</span><h1>Ako tím používa LIVE-IN</h1><p>Otvorené sekcie, aktívne účty a zaznamenané pracovné udalosti. Súkromné rozhovory zostávajú súkromné.</p></div><ActivityRefresh /></section>
  {err&&<p className="li-error" role="alert">Časť prehľadu sa nepodarilo načítať. Chýbajúce údaje nie sú nulová aktivita. Skús obnoviť prehľad.</p>}
  <div className="li-metrics"><article><small>Otvorenia sekcií · 30 dní</small><strong>{events.error?'—':total}</strong></article><article><small>Aktívne prihlásené účty</small><strong>{events.error?'—':data.active_users||0}</strong></article><article><small>Udalosti v práčovni · 30 dní</small><strong>{events.error?'—':events.data?.packing_count??0}</strong></article><article><small>Udalosti CS a vstupov · 30 dní</small><strong>{events.error?'—':(events.data?.cs_count||0)+(events.data?.ring_count||0)}</strong></article></div>
  <section className="card li-section"><h2>Používanie za posledné dva týždne</h2><p className="li-privacy">Počet otvorení sekcií za deň. Staršie dni pred spustením merania nemajú zaznamenanú aktivitu.</p>{err?<p>Údaje teraz nie sú dostupné.</p>:<div className="li-trend">{trend.map(d=><div key={d.day} className="li-trend-day" title={d.day+': '+d.views+' otvorení'}><b>{d.views}</b><span style={{height:Math.max(2,96*d.views/peak)}}/><small>{Number(d.day.slice(8))}.{Number(d.day.slice(5,7))}.</small></div>)}</div>}</section>
  <section className="card li-section"><h2>Prehľad aplikácií</h2><p className="li-privacy">Meranie otvorení sa začína nasadením tejto verzie. Otvorená stránka nepotvrdzuje odvedenú prácu. Ring používa zdieľanú reláciu; osobu z nej neurčujeme.</p><div className="li-table"><table><thead><tr><th>Aplikácia</th><th>Otvorenia</th><th>Účty</th><th>Naposledy použitá</th></tr></thead><tbody>{summary.map(a=><tr key={a.id}><td>{a.name}</td><td>{events.error?'—':a.views}</td><td>{a.id==='ring'?'Zdieľané':a.people}</td><td>{a.last?dt(a.last):'Zatiaľ bez záznamu'}</td></tr>)}</tbody></table></div></section>
  <section className="card li-section"><h2>Posledné otvorené sekcie</h2>{!rows.length?<p className="li-empty">{events.error?'Údaje nie sú dostupné.':'Záznamy sa objavia po použití aplikácií.'}</p>:<div className="li-table"><table><thead><tr><th>Čas</th><th>Účet</th><th>Aplikácia</th><th>Sekcia</th></tr></thead><tbody>{rows.slice(0,30).map((r,i)=><tr key={i}><td>{dt(r.last_seen)}</td><td>{r.actor}</td><td>{apps[r.app]}</td><td>{pages[r.page]||r.page}</td></tr>)}</tbody></table></div>}</section>
  <section className="card li-section"><h2>Zaznamenané pracovné udalosti</h2><p className="li-privacy">Posledných 20 udalostí z existujúceho auditu. Môžu zahŕňať automatizáciu a neúspešné pokusy; nejde o hodnotenie výkonu človeka.</p>{events.error?<p className="li-empty">Audit teraz nie je dostupný.</p>:!events.data?.recent?.length?<p className="li-empty">Za posledných 30 dní nie sú udalosti.</p>:<div className="li-table"><table><thead><tr><th>Čas</th><th>Aplikácia</th><th>Autor</th><th>Udalosť</th></tr></thead><tbody>{events.data.recent.map((e,i)=><tr key={i}><td>{dt(e.at)}</td><td>{apps[e.app]}</td><td>{e.actor}</td><td>{e.action}</td></tr>)}</tbody></table></div>}</section>
  <p className="li-privacy">Otvorenia sú zhrnuté po účte, sekcii a dni; opakované otvorenia do 30 sekúnd zlučujeme. Zobrazené dáta k {dt(new Date())}.</p>
 </>
}
