import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/nfc-attendance/handler.mjs';
import {parseNfcRoute,nfcDestination} from '../js/nfc-path.js';
const user='88888888-8888-4888-8888-888888888888',id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const settings={NFC_ALLOWED_ORIGINS:'https://impulsouaemex2026.cineticocre.com.mx',SUPABASE_URL:'https://test.supabase.co',NFC_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only',TURNSTILE_SECRET_KEY:'secret'};
async function run({origin=settings.NFC_ALLOWED_ORIGINS,auth=true,rate=true,verify={},body={activity_id:id,token:'test'},method='POST',userResponse,fail,missingSecret=false,verifyFailure}={}){
 const calls=[];const handler=createHandler({env:k=>missingSecret&&k==='TURNSTILE_SECRET_KEY'?undefined:settings[k],log:()=>{},fetchImpl:async(url,options)=>{
  calls.push({url,options});if(fail)throw Error('SECRET_INTERNAL_ERROR');
  if(url.endsWith('/user'))return Response.json(userResponse||{id:user,email_confirmed_at:'2026-01-01'},{status:auth?200:401});
  if(url.endsWith('consume_nfc_attempt'))return Response.json(rate);
  if(url.includes('siteverify')){
   if(verifyFailure==='network')throw Error('secret');
   if(verifyFailure==='json')return new Response('invalid');
   if(verifyFailure==='http')return new Response('unavailable',{status:503});
   return Response.json({success:true,hostname:new URL(origin).hostname,action:'nfc-attendance',cdata:id,...verify});
  }
  if(url.endsWith('confirm_nfc_attendance'))return Response.json({code:'RECORDED'});
  throw Error('Unexpected URL');
 }});
 const response=await handler(new Request('https://test.supabase.co/functions/v1/nfc-attendance',{method,headers:{origin,authorization:'Bearer user-token','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({point_token:'a'.repeat(64),...body})}:{})}));
 return {response,calls,data:response.status===204?null:await response.json()};
}
const success=await run({body:{activity_id:id,token:'test',user_id:'attacker'}});
assert.equal(success.data.code,'RECORDED');
assert.equal(JSON.parse(success.calls.at(-1).options.body).p_user_id,user);
assert.equal(JSON.parse(success.calls.at(-1).options.body).p_point_token,'a'.repeat(64));
for(const point_token of [undefined,null,'','guess','a'.repeat(65)]){
 const r=await run({body:{activity_id:id,token:'test',point_token}});assert.equal(r.data.code,'POINT_TOKEN_INVALID');assert.equal(r.calls.length,0);
}
for(const opts of [{auth:false},{rate:false},{verify:{success:false}},{verify:{hostname:'evil.example'}},{verify:{action:'login'}},{verify:{cdata:user}},{origin:'https://evil.example'},{body:{activity_id:'invalid',token:'test'}},{userResponse:{id:user,email_confirmed_at:null}},{body:{activity_id:id,token:'x'.repeat(5000)}},{fail:true}]){
 const r=await run(opts);assert.notEqual(r.data.code,'RECORDED');assert(!r.calls.some(c=>c.url.endsWith('confirm_nfc_attendance')));assert(!JSON.stringify(r.data).includes('SECRET_INTERNAL_ERROR'));
}
assert.equal((await run({method:'OPTIONS'})).response.status,204);
assert.equal((await run({method:'GET'})).response.status,405);
for(const opts of [{missingSecret:true},{body:{activity_id:id}},{body:{activity_id:id,token:''}},{verifyFailure:'network'},{verifyFailure:'json'},{verifyFailure:'http'},{verify:{success:false,'error-codes':['timeout-or-duplicate']}}]){
 const result=await run(opts);assert.ok(result.response.status>=400);assert.ok(!result.calls.some(c=>c.url.endsWith('confirm_nfc_attendance')));assert.ok(!JSON.stringify(result.data).includes('secret'));
}
for(const value of ['https://evil.example','../admin','deporte/../../admin','deporte/<script>','unknown/activity','deporte/a?next=evil'])assert.equal(nfcDestination(value),null);
assert.deepEqual(parseNfcRoute('deporte/001-prueba'),{scenario:'deporte',slug:'001-prueba'});
console.log('PASS NFC backend: sesión, suplantación, CORS, Siteverify hostname/action/cData, límites, errores seguros y rutas internas.');
