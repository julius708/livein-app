'use client'
import {useRouter} from 'next/navigation'
import {useEffect,useTransition} from 'react'
export default function ActivityRefresh(){
 const router=useRouter(),[pending,start]=useTransition()
 useEffect(()=>{const id=setInterval(()=>{if(document.visibilityState==='visible')router.refresh()},60000);return()=>clearInterval(id)},[router])
 return <button className="btn" disabled={pending} onClick={()=>start(()=>router.refresh())}>{pending?'Obnovujem…':'Obnoviť prehľad'}</button>
}
