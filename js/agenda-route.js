import { getSession, onAuthStateChange } from './auth.js';
import { prepareAccount } from './prepare-account.js';
import { supabase } from './supabase-client.js';
import { listActivities, getMyRoute, setSelection, routeError } from './activities.js';
import { authLink, requestedActivity, rememberActivity } from './return-to.js';
import { element, calendarActions, formatActivityTime } from './route-ui.js';

let cards=[];
const agendaList=document.querySelector('#agendaList');
const status=document.querySelector('#route-status');
let activities=new Map(), selections=new Map(), session=null, version=0;
const pending=new Set();
const scenarioNames={cultura:'Cultura',deporte:'Deporte',tecnologia:'Tecnología',diseno:'Diseño',investigacion:'Investigación aplicada',gobernanza:'Gobernanza',bienestar:'Bienestar Integral'};
function say(text){status.textContent=text;}
function openAccess(slug){
  rememberActivity(slug);
  location.href=authLink('login.html',slug);
}
function routeNotice(){
  say('No pudimos cargar tu ruta en este momento. ');
  const retry=element('button','VOLVER A INTENTAR','btn btn-outline');retry.type='button';
  retry.addEventListener('click',()=>refresh());status.append(retry);
}
function rebuildCards(){
  const fragment=document.createDocumentFragment(),groups=new Map();
  for(const a of activities.values()){
    const day=a.activity_date||'pending';
    if(!groups.has(day)){
      const group=element('div',undefined,'agenda-day-group');
      group.append(element('h3',a.activity_date?new Date(a.activity_date+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}).toUpperCase():'FECHA POR CONFIRMAR','agenda-day-heading'));
      groups.set(day,group);fragment.append(group);
    }
    const card=element('article',undefined,'agenda-item');card.id='activity-'+a.slug;card.dataset.activitySlug=a.slug;
    const title=element('div',undefined,'agenda-title');title.append(element('strong'),element('span'),element('p',a.description||'','content-note'));
    const place=element('div',undefined,'agenda-place');place.append(element('strong'),element('span'));
    card.append(element('div',undefined,'agenda-time'),title,place,element('div',undefined,'agenda-type'),element('div',undefined,'route-controls'));
    groups.get(day).append(card);
  }
  agendaList.replaceChildren(fragment);cards=[...agendaList.querySelectorAll('[data-activity-slug]')];
}
function render(){
  for(const card of cards){
    const container=card.querySelector('.route-controls');
    const a=activities.get(card.dataset.activitySlug);
    container.replaceChildren();
    card.dataset.routeOpen=String(Boolean(a));
    card.hidden=!a;
    if(!a)continue;

    // Datos publicados en Supabase prevalecen sobre el catálogo inicial.
    card.querySelector('.agenda-title strong').textContent=a.title;
    card.querySelector('.agenda-title span').textContent=a.speaker || '';
    card.querySelector('.agenda-title .content-note').textContent=a.description || '';
    card.querySelector('.agenda-time').textContent=formatActivityTime(a);
    card.querySelector('.agenda-place strong').textContent=scenarioNames[a.scenario]||a.scenario;
    card.querySelector('.agenda-place span').textContent=a.location || 'Ubicación por confirmar';
    card.dataset.day=a.activity_date?.slice(-2)||'pending';card.dataset.stage=a.scenario;
    card.dataset.search=[a.title,a.speaker,a.location,a.scenario].filter(Boolean).join(' ');
    const selected=selections.has(a.id);
    const feedback=element('p','','route-feedback');feedback.setAttribute('role','status');
    if(selected){
      container.append(element('p','✓ AGREGADA A TU RUTA','route-selected'),calendarActions(a));
    }
    const button=element('button',pending.has(a.id)?'CARGANDO...':selected?'QUITAR':'ASISTIR','btn btn-outline');button.type='button';
    button.disabled=pending.has(a.id);
    button.addEventListener('click',async()=>{
      if(pending.has(a.id))return;
      if(!session){openAccess(a.slug,button);return;}
      const currentVersion=version;
      pending.add(a.id);button.disabled=true;button.textContent='CARGANDO...';button.setAttribute('aria-busy','true');
      try{
        const current=await getSession();
        if(!current){session=null;selections.clear();render();openAccess(a.slug,card.querySelector('button'));return;}
        if(current.user.id!==session.user.id){await refresh();return;}
        if(!selected){
          const ready=await prepareAccount();
          if(!ready.profile){location.href='mi-cuenta.html';return;}
          if(ready.registration?.status!=='confirmed')throw {message:'EVENT_REGISTRATION_REQUIRED'};
        }
        if(!a.id){
          const catalog=await listActivities();
          const real=catalog.find(item=>item.slug===a.slug);
          if(!real)throw {message:'ACTIVITY_UNAVAILABLE'};
          a.id=real.id;
        }
        const saved=await setSelection(a.id,selected?'cancelled':'registered');
        if(currentVersion!==version)return;
        say(selected?'Actividad retirada de tu ruta. Si la guardaste en tu calendario personal, elimínala también allí.':'Actividad agregada a tu ruta. Seleccionarla no confirma tu asistencia.');
        if(selected)selections.delete(a.id);else selections.set(a.id,saved);
        render();
      }catch(error){
        if(currentVersion===version){
          if(/ACTIVITY_UNAVAILABLE/.test(error?.message || ''))await refresh();
          say(routeError(error));feedback.textContent=routeError(error);
        }
      }finally{pending.delete(a.id);button.disabled=false;render();}
    });
    container.append(button,feedback);
  }
  document.dispatchEvent(new CustomEvent('impulso:agenda-updated'));
}
async function refresh(){
  const current=++version;
  let active=null;
  try{active=await getSession();}catch{ /* Mantener la agenda pública. */ }
  if(current!==version)return;
  if(session?.user.id!==active?.user.id)selections.clear();
  session=active;
  render();
  // El catálogo público y la ruta privada fallan de forma independiente.
  try{
    const catalog=await listActivities();
    if(current!==version)return;
    activities=new Map(catalog.filter(a=>a.status==='open').map(a=>[a.slug,a]));
    rebuildCards();
  }catch{ /* Conservar las tarjetas de la última consulta correcta, sin copias del catálogo. */
    if(!activities.size)agendaList.textContent='No pudimos cargar la agenda en este momento.';
  }
  if(current!==version)return;
  if(!active){selections.clear();say('');render();return;}
  try{
    const route=await getMyRoute();
    if(current!==version)return;
    selections=new Map(route.map(r=>[r.activity_id,r]));say('');
  }catch{if(current===version)routeNotice();}
  if(current===version)render();
}
render();
if(supabase){
  onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT'){version++;session=null;selections.clear();render();}
    else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(refresh,0);
  });
  window.addEventListener('focus',refresh);
  window.addEventListener('storage',event=>{if(event.key==='impulso-activities-changed')refresh();});
  const timer=globalThis.setInterval?.(()=>{if(!document.hidden&&!pending.size)refresh();},30000);
  window.addEventListener('pagehide',()=>globalThis.clearInterval?.(timer));
  await refresh();
}
const destination=requestedActivity();
if(destination){
  document.dispatchEvent(new CustomEvent('impulso:reveal-activity',{detail:destination}));
  try{sessionStorage.removeItem('impulso-route-intent');}catch{}
}
