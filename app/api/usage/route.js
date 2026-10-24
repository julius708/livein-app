import { getViewer } from '@/lib/auth'
const allowed=new Set(['home','guru','feedback','password','users','settings','feedback_admin','activity','apartments','knowledge','team','audit','apartment_detail','history','packing_history','status','entrances'])
export async function POST(request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({ok:false},{status:403})
 const {s,user,blocked}=await getViewer(); if(!user||blocked)return Response.json({ok:false},{status:403})
 const body=await request.json().catch(()=>null);if(!body||!allowed.has(body.page))return Response.json({ok:false},{status:400})
 const {error}=await s.rpc('record_app_usage',{app_key:'app',page_key:body.page})
 return Response.json({ok:!error},{status:error?503:200})
}
