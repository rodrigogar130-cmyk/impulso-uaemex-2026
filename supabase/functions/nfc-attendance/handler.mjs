const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createHandler({env,fetchImpl=fetch,log=console.warn}) {
 return async request => {
  const requestId=crypto.randomUUID();
  const origin=request.headers.get('origin');
  const origins=(env('NFC_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(code,status=200,extra={})=>new Response(JSON.stringify({code,request_id:requestId,...extra}),{status,headers});
  if(!origin||!origins.includes(origin))return reply('ORIGIN_REJECTED',403);
  headers['Access-Control-Allow-Origin']=origin;
  headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';
  headers['Access-Control-Allow-Methods']='POST,OPTIONS';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply('METHOD_NOT_ALLOWED',405);
  const base=env('SUPABASE_URL'),publicKey=env('NFC_PUBLISHABLE_KEY');
  const secret=env('SUPABASE_SERVICE_ROLE_KEY'),turnstileSecret=env('TURNSTILE_SECRET_KEY');
  if(!base||!publicKey||!secret||!turnstileSecret)return reply('NOT_CONFIGURED',503);
  const bearer=request.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/.test(bearer))return reply('AUTH_REQUIRED',401);
  const call=async(url,options)=>fetchImpl(url,{...options,signal:AbortSignal.timeout(12000)});
  try {
   if(!request.headers.get('content-type')?.startsWith('application/json'))return reply('INVALID_REQUEST',400);
   const reader=request.body?.getReader(); if(!reader)return reply('INVALID_REQUEST',400);
   let size=0,chunks=[];
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>4096){await reader.cancel();return reply('INVALID_REQUEST',413);}chunks.push(value);}
   let body;
   try{body=JSON.parse(await new Blob(chunks).text());}catch{return reply('INVALID_REQUEST',400);}
   if(!body||!uuid.test(body.activity_id||'')||typeof body.token!=='string'||!body.token.length||body.token.length>2048)return reply('INVALID_REQUEST',400);
   if(typeof body.point_token!=='string'||!/^[a-f0-9]{64}$/.test(body.point_token))return reply('POINT_TOKEN_INVALID',400);
   const auth=await call(base+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:bearer}});
   if(!auth.ok)return reply(auth.status>=500?'SERVICE_UNAVAILABLE':'AUTH_REQUIRED',auth.status>=500?503:401);
   const user=await auth.json();
   if(!uuid.test(user?.id||'')||!user.email_confirmed_at||user.is_anonymous)return reply('AUTH_REQUIRED',401);
   const rpc=async(name,args)=>{
    const result=await call(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(!result.ok)throw new Error('RPC_FAILURE');return result.json();
   };
   if(await rpc('consume_nfc_attempt',{p_user_id:user.id})!==true)return reply('RATE_LIMITED',429);
   let check,verified;
   try{
   check=await call('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({secret:turnstileSecret,response:body.token,idempotency_key:requestId})});
   if(!check.ok)return reply('SECURITY_UNAVAILABLE',503);
   verified=await check.json();
   }catch{return reply('SECURITY_UNAVAILABLE',503);}
   if(!verified||verified.success!==true||verified.action!=='nfc-attendance'||verified.hostname!==new URL(origin).hostname||verified.cdata!==body.activity_id){
    log(JSON.stringify({event:'nfc_rejected',request_id:requestId,code:'TURNSTILE_INVALID'}));
    return reply('TURNSTILE_INVALID',403);
   }
   const result=await rpc('confirm_nfc_attendance',{p_user_id:user.id,p_activity_id:body.activity_id,p_request_id:requestId,p_point_token:body.point_token});
   const allowed=['RECORDED','ALREADY_COMPLETED','AUTH_REQUIRED','EVENT_REGISTRATION_REQUIRED','PRIVACY_REQUIRED','ACTIVITY_NOT_FOUND','ACTIVITY_UNAVAILABLE','ATTENDANCE_CLOSED','POINT_TOKEN_INVALID'];
   if(!allowed.includes(result?.code))throw new Error('UNEXPECTED_RESULT');
   log(JSON.stringify({event:'nfc_result',request_id:requestId,code:result.code}));
   return reply(result.code,200,{attended_at:result.attended_at||null});
  } catch {
   log(JSON.stringify({event:'nfc_error',request_id:requestId,code:'SERVICE_UNAVAILABLE'}));
   return reply('SERVICE_UNAVAILABLE',503);
  }
 };
}
