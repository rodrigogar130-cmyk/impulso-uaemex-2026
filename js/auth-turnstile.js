import { TURNSTILE_SITE_KEY } from './nfc-config.js?v=20260921-4';
let scriptPromise=null,pending=false;
function failure(){return Object.assign(new Error('No pudimos completar la verificación de seguridad. Inténtalo nuevamente.'),{code:'captcha_failed'});}
function loadScript(){
 if(window.turnstile?.render)return Promise.resolve();
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){script.remove();reject(failure());}else resolve();};
  const timer=setTimeout(()=>finish(true),15000);
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>finish(!window.turnstile?.render);script.onerror=()=>finish(true);
  document.head.append(script);
 }).catch(error=>{scriptPromise=null;throw error;});
 return scriptPromise;
}
// Cada operación consume un token nuevo. No se guarda en localStorage ni se reutiliza.
export async function getAuthCaptchaToken(action){
 if(pending||!TURNSTILE_SITE_KEY)throw failure();
 pending=true;
 let container,widget=null;
 try{
  await loadScript();
  container=document.createElement('div');container.setAttribute('aria-label','Verificación de seguridad');
  const host=document.querySelector('form[aria-busy="true"]')||document.querySelector('main');
  if(!host)throw failure();host.append(container);
  return await new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,token)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(failure()):resolve(token);};
   const timer=setTimeout(()=>finish(true),120000);
   try{widget=window.turnstile.render(container,{
    sitekey:TURNSTILE_SITE_KEY,action,appearance:'interaction-only',theme:'dark',size:'flexible',retry:'never',
    callback:token=>finish(typeof token!=='string'||!token||token.length>2048,token),
    'error-callback':()=>finish(true),'expired-callback':()=>finish(true),'timeout-callback':()=>finish(true)
   });}catch{finish(true);}
  });
 }finally{
  if(widget!==null){try{window.turnstile.remove(widget);}catch{}}
  container?.remove();pending=false;
 }
}
