export const HISTORY_LIMIT = 30
export function validTurnId(id) { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) }
export async function recentMemory(s) {
 const {data,error}=await s.from('guru_turns').select('question,answer,created_at').eq('status','complete').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(12)
 if(error)throw new Error('memory_unavailable')
 return (data||[]).reverse().flatMap(t=>[{role:'user',content:t.question},{role:'assistant',content:t.answer||''}])
}
export async function searchMemory(s,query) {
 const q=String(query||'').trim().slice(0,200)
 if(!q)return []
 const {data,error}=await s.from('guru_turns').select('question,answer,created_at').eq('status','complete').textSearch('search_document',q,{type:'websearch',config:'simple'}).order('created_at',{ascending:false}).limit(6)
 if(error)throw new Error('memory_search_unavailable')
 return data||[]
}
export function sameOrigin(request) { const origin=request.headers.get('origin'); return !origin || origin===new URL(request.url).origin }
