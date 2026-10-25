'use client'
import { useEffect, useRef, useState } from 'react'
import '@/app/guru/guru.css'
const SUGG=['Čo dnes potrebuje moju pozornosť?','Koľko máme dnes príchodov a odchodov podľa miest?','Napíš hosťovi odpoveď na sťažnosť na hluk','Ako riešime neskorý check-in?']
export default function GuruChat({initial=''}){
 const [turns,setTurns]=useState([]),[text,setText]=useState(initial),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[more,setMore]=useState(false),[reading,setReading]=useState(false)
 const end=useRef(null),lock=useRef(false),historyLock=useRef(false)
 async function load(older=false){
  if(historyLock.current||lock.current)return;historyLock.current=true;setReading(true)
  try{
  const before=older&&turns.length? '?before='+encodeURIComponent(turns[0].created_at)+'&id='+encodeURIComponent(turns[0].id):''
  const r=await fetch('/api/guru/history'+before,{cache:'no-store'}),j=await r.json()
  if(!r.ok||!j.ok)throw new Error(j.error||'Históriu sa nepodarilo načítať.')
  setTurns(old=>older?[...j.turns,...old]:j.turns);setMore(j.hasMore)
  }finally{historyLock.current=false;setReading(false)}
 }
 useEffect(()=>{setLoading(false)},[])
 async function send(question,id){
  const q=question.trim();if(!q||lock.current||loading||historyLock.current)return
  lock.current=true;setBusy(true);setError('')
  const turnId=id||crypto.randomUUID()
  if(!id)setTurns(old=>[...old,{id:turnId,question:q,status:'pending',created_at:new Date().toISOString()}])
  else setTurns(old=>old.map(t=>t.id===id?{...t,status:'pending'}:t))
  setText('')
  try{
   const r=await fetch('/api/guru',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:q,turnId})}),j=await r.json()
   if(!r.ok||!j.ok)throw new Error(j.error||'Odpoveď sa nepodarilo načítať.')
   setTurns(old=>old.map(t=>t.id===turnId?{...t,status:'complete',answer:j.text}:t))
  }catch(e){setError(e.message||'Spojenie zlyhalo. Otázku môžeš zopakovať.');setTurns(old=>old.map(t=>t.id===turnId?{...t,status:'error'}:t))}
  finally{lock.current=false;setBusy(false);end.current?.scrollIntoView({block:'nearest'})}
 }
 async function clear(){
  if(busy||!window.confirm('Vymazať celú tvoju históriu rozhovorov s Guruom? Túto akciu nemožno vrátiť.'))return
  setBusy(true);lock.current=true;setError('')
  try{const r=await fetch('/api/guru/history',{method:'DELETE'}),j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Vymazanie zlyhalo.');setTurns([]);setMore(false)}catch(e){setError(e.message)}finally{setBusy(false);lock.current=false}
 }
 return <div className="gchat">
  <div className="g-memory"><div><small>Guru si tvoje rozhovory pamätá na pozadí a učí sa z otázok celého tímu; história sa tu nezobrazuje, aby bol chat prehľadný.</small></div><button disabled={busy||loading||reading} onClick={()=>load().then(()=>setError('')).catch(e=>setError(e.message))}>Zobraziť históriu</button><button disabled={busy||loading||reading} onClick={clear}>Vymazať moju pamäť</button></div>
  <div className="gmsgs" aria-label="História rozhovoru">
   {more&&<button className="g-older" disabled={busy||reading} onClick={()=>load(true).catch(e=>setError(e.message))}>Načítať staršie rozhovory</button>}
   {!loading&&!turns.length&&<div className="gsug">{SUGG.map(q=><button key={q} disabled={busy} onClick={()=>send(q)}>{q}</button>)}</div>}
   {turns.map(t=><div key={t.id}><div className="gm u">{t.question}</div>{t.answer&&<div className="gm a">{t.answer}</div>}{t.status==='pending'&&<div className="gm a" role="status">{busy?'Premýšľam…':'Odpoveď ešte nie je uložená.'}</div>}{t.status!=='complete'&&!busy&&<button className="g-retry" onClick={()=>send(t.question,t.id)}>Skúsiť znova</button>}</div>)}
   <div ref={end}/>
  </div>
  {error&&<p className="g-error" role="alert">{error}</p>}
  <form className="gform" onSubmit={e=>{e.preventDefault();send(text)}}><textarea aria-label="Správa Guruovi" maxLength={4000} rows={2} value={text} disabled={loading} onChange={e=>setText(e.target.value)} placeholder="Napíš otázku alebo nadviaž na náš rozhovor…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send(text)}}}/><button disabled={busy||loading||reading||!text.trim()}>Poslať</button></form>
 </div>
}
