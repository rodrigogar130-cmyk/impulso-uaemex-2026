import { client } from './supabase-client.js?v=20260921-4';
import { getVerifiedSession,onAuthStateChange } from './auth.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { authLink,requestedCheckin,requestedPointToken,preserveAuthLinks } from './return-to.js?v=20260921-4';
import { parseNfcRoute,nfcDestination } from './nfc-path.js?v=20260921-4';
import { getMyAttendances,attendanceMessage,notifyAttendance } from './attendance.js?v=20260921-4';
import { element,formatActivityTime,scenarioName } from './route-ui.js?v=20260921-4';
import { SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20260921-4';
import { TURNSTILE_SITE_KEY } from './nfc-config.js?v=20260921-4';
const status=document.querySelector('#attendance-status'),actions=document.querySelector('#attendance-actions');
let busy=false,done=false,widget=null,owner=null,activity=null;
const say=code=>{status.textContent=attendanceMessage(code);};
function login(){
 say('AUTH_REQUIRED');actions.replaceChildren();
 const link=element('a','INICIAR SESIÓN','btn btn-primary');link.href=authLink('login.html');actions.append(link);
}
function retry(){
 actions.replaceChildren();const button=element('button','VOLVER A INTENTAR','btn btn-outline');button.type='button';
 button.onclick=()=>{if(busy||done)return;actions.replaceChildren();status.textContent='Verificando asistencia…';
  if(widget!==null)window.turnstile.reset(widget);else location.reload();};actions.append(button);
}
async function submit(token){
 if(busy||done)return;busy=true;actions.replaceChildren();status.textContent='Verificando asistencia…';
 try{
  const session=await getVerifiedSession();
  if(!session||session.user.id!==owner){login();return;}
  const response=await fetch(SUPABASE_URL+'/functions/v1/nfc-attendance',{
   method:'POST',credentials:'omit',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
   body:JSON.stringify({activity_id:activity.id,token,point_token:requestedPointToken()}),signal:AbortSignal.timeout(25000)});
  const result=await response.json();
  if(!response.ok&&['RECORDED','ALREADY_COMPLETED'].includes(result?.code))throw new Error('Invalid response');
  say(result?.code);
  if(['RECORDED','ALREADY_COMPLETED'].includes(result.code)){done=true;notifyAttendance();}
  else if(result.code==='AUTH_REQUIRED')login();
  else if(['PRIVACY_REQUIRED','EVENT_REGISTRATION_REQUIRED'].includes(result.code)){
   const link=element('a','REVISAR MI CUENTA','btn btn-outline');link.href='mi-cuenta.html';actions.append(link);
  }else retry();
 }catch{say('SERVICE_UNAVAILABLE');retry();}
 finally{busy=false;}
}
try{
 preserveAuthLinks();
 const route=parseNfcRoute(requestedCheckin());
 if(!route){say('ACTIVITY_NOT_FOUND');}
 else{
  // Fuente de verdad: RPC existente. No se utiliza el catálogo JSON de respaldo para asistencia.
  const {data,error}=await client().rpc('get_attendance_activity',{p_scenario:route.scenario,p_slug:route.slug});
  if(error)throw error;
  activity=data?.find(a=>a.scenario===route.scenario&&a.slug===route.slug);
  if(!activity)say('ACTIVITY_NOT_FOUND');
  else{
   document.querySelector('#activity-title').textContent=activity.title;
   document.querySelector('#activity-scenario').textContent=scenarioName(activity.scenario);
   const detail=document.querySelector('#activity-detail');detail.hidden=false;
   for(const value of [activity.description,formatActivityTime(activity)+' · Hora de Ciudad de México',activity.location||'Ubicación por confirmar',activity.speaker||'Ponente por confirmar'])if(value)detail.append(element('p',value));
   const session=await getVerifiedSession();
   if(!session?.user.email_confirmed_at)login();
   else{
    owner=session.user.id;
    onAuthStateChange((event,next)=>{if(event==='SIGNED_OUT'||(next&&next.user.id!==owner)){done=true;location.reload();}});
    const account=await prepareAccount(session.user,nfcDestination(requestedCheckin(),requestedPointToken()));
    if(!account.privacyRequired){
     if(account.registration?.status!=='confirmed')say('EVENT_REGISTRATION_REQUIRED');
     else{
      const attendances=await getMyAttendances();
      if(attendances.some(a=>a.activity_id===activity.id)){done=true;say('ALREADY_COMPLETED');}
      else if(!requestedPointToken())say('POINT_TOKEN_INVALID');
      else if(!activity.attendance_enabled)say('ATTENDANCE_CLOSED');
      else if(!TURNSTILE_SITE_KEY)say('NOT_CONFIGURED');
      else{
       status.textContent='Verificando asistencia…';
       const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
       let scriptReady=false;
       const loadTimeout=setTimeout(()=>{if(!scriptReady&&!done){scriptReady=true;say('SECURITY_UNAVAILABLE');retry();}},15000);
       script.onload=()=>{if(scriptReady||done)return;scriptReady=true;clearTimeout(loadTimeout);
        try{widget=window.turnstile.render('#attendance-challenge',{
        sitekey:TURNSTILE_SITE_KEY,action:'nfc-attendance',cData:activity.id,appearance:'interaction-only',theme:'dark',size:'flexible',
        callback:submit,'error-callback':()=>{say('TURNSTILE_INVALID');retry();},
        'expired-callback':()=>{if(!busy&&!done){say('TURNSTILE_INVALID');retry();}},
        'timeout-callback':()=>{if(!busy&&!done){say('TURNSTILE_INVALID');retry();}}
       });}catch{say('SECURITY_UNAVAILABLE');retry();}};
       script.onerror=()=>{scriptReady=true;clearTimeout(loadTimeout);if(!done){say('SECURITY_UNAVAILABLE');retry();}};document.head.append(script);
      }
     }
    }
   }
  }
 }
}catch{say('SERVICE_UNAVAILABLE');retry();}
