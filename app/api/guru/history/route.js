import { NextResponse } from 'next/server'
import { getViewer } from '@/lib/auth'
import { HISTORY_LIMIT, sameOrigin, validTurnId } from '@/lib/guru-memory'
export const dynamic='force-dynamic'
export async function GET(request){
 const {s,user,blocked}=await getViewer()
 if(!user||blocked)return NextResponse.json({ok:false},{status:403})
 const params=new URL(request.url).searchParams
 const before=params.get('before'), beforeId=params.get('id')
 let q=s.from('guru_turns').select('id,question,answer,status,created_at').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(HISTORY_LIMIT+1)
 if(before && beforeId){
  if(!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(before)||Number.isNaN(Date.parse(before))||!validTurnId(beforeId))return NextResponse.json({ok:false},{status:400})
  const stamp=before
  q=q.or(`created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${beforeId})`)
 }
 const {data,error}=await q
 if(error)return NextResponse.json({ok:false,error:'Pamäť sa teraz nedá načítať. Skús obnoviť stránku.'},{status:503})
 const rows=(data||[]).slice(0,HISTORY_LIMIT)
 return NextResponse.json({ok:true,turns:rows.reverse(),hasMore:(data||[]).length>HISTORY_LIMIT},{headers:{'Cache-Control':'private, no-store'}})
}
export async function DELETE(request){
 if(!sameOrigin(request))return NextResponse.json({ok:false},{status:403})
 const {s,user,blocked}=await getViewer()
 if(!user||blocked)return NextResponse.json({ok:false},{status:403})
 const {error}=await s.rpc('erase_own_guru_memory')
 if(error)return NextResponse.json({ok:false,error:'Históriu sa nepodarilo vymazať.'},{status:503})
 return NextResponse.json({ok:true})
}
