import { getLocalSession,getVerifiedSession,onAuthStateChange } from './auth.js?v=20260921-4';
import { getMyRoute, setSelection, routeError } from './activities.js?v=20260921-4';
import { calendarReady, downloadRoute, googleCalendarUrl } from './calendar.js?v=20260921-4';
import { element, calendarActions, formatActivityTime, scenarioName } from './route-ui.js?v=20260921-4';
import { getMyAttendances,getPassportStatus } from './attendance.js?v=20260921-4';

export async function loadMyRoute(){
  const root=document.querySelector('#my-route');if(!root)return;
  const list=root.querySelector('[data-route-list]');
  const message=root.querySelector('[data-route-message]');
  const count=root.querySelector('[data-route-count]');
  const exportButton=root.querySelector('[data-export-route]');
  const exportPanel=root.querySelector('[data-export-options]');
  let route=[],busy=false,revision=0;
  let refreshPromise=null, refreshAgain=false, lastRefresh=0;
  function refresh(){
    if(refreshPromise){refreshAgain=true;revision++;return refreshPromise;}
    refreshPromise=(async()=>{
      do{refreshAgain=false;await load();}while(refreshAgain);
    })().finally(()=>{lastRefresh=Date.now();refreshPromise=null;});
    return refreshPromise;
  }
  function refreshOnReturn(){
    if(!document.hidden&&!busy&&!refreshPromise&&Date.now()-lastRefresh>=3000)void refresh();
  }
  async function load(){
    const current=++revision;
    try{
      const session=await getLocalSession();
      if(current!==revision)return;
      if(!session){route=[];list.replaceChildren();exportButton.hidden=true;exportPanel.hidden=true;return;}
      let rows=[];let routeFailed=false;
      try{rows=await getMyRoute();}catch{routeFailed=true;}
      if(current!==revision)return;
      let attendances=null;
      try{attendances=await getMyAttendances();}catch{}
      if(current!==revision)return;
      const completed=new Set((attendances||[]).map(a=>a.activity_id));
      const metric=document.querySelector('[data-attendance-count]');
      if(metric)metric.textContent=attendances===null?'—':String(completed.size);
      const progress=document.querySelector('[data-attendance-progress]');
      if(progress)progress.textContent=attendances===null?'No pudimos consultar tus asistencias.':`${completed.size} de 12 actividades distintas con asistencia confirmada para tu insignia.`;
      const badge=document.querySelector('[data-attendance-badge]');
      if(badge){badge.textContent='Consultando…';try{const passport=await getPassportStatus();if(current!==revision)return;badge.textContent=passport?.badge_unlocked===true?'★ INSIGNIA DESBLOQUEADA':'BLOQUEADA';}catch{if(current!==revision)return;badge.textContent='No disponible';}}
      const history=document.querySelector('[data-attendance-list]');
      if(history){history.replaceChildren();
       if(attendances===null)history.append(element('p','No pudimos consultar tus asistencias. Inténtalo nuevamente.'));
       else if(!attendances.length)history.append(element('p','Aún no tienes asistencias confirmadas.'));
       else for(const a of attendances){const entry=element('article',undefined,'route-card');entry.append(element('h3',a.title),element('p','✓ Asistencia confirmada · '+new Date(a.attended_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})+' · Ciudad de México'));history.append(entry);}
      }
      route=rows;message.textContent=routeFailed?'No pudimos cargar tu ruta en este momento.':'';
      count.textContent=`${route.length} ACTIVIDADES SELECCIONADAS`;
      exportButton.hidden=route.length===0;
      exportPanel.hidden=true;list.replaceChildren();
      if(!route.length)list.append(element('p','Tu ruta está vacía. Explora la agenda y elige las actividades que te interesan.'));
      for(const row of route){
        const a=row.activity;const card=element('article',undefined,'route-card');
        card.append(element('h3',a?.title||'Actividad no disponible'));
        if(a){card.append(element('p',formatActivityTime(a)),element('p',`${scenarioName(a.scenario)} · ${a.location||'Ubicación por confirmar'}`),element('p',a.speaker||'Ponente por confirmar'));}
        card.append(element('p',completed.has(row.activity_id)?'✓ COMPLETADA · ASISTENCIA CONFIRMADA':'AGREGADA A TU RUTA','route-selected'));
        if(a)card.append(calendarActions(a));
        else card.append(element('p','Esta actividad ya no está abierta. Puedes retirarla de tu ruta.'));
        const remove=element('button','QUITAR DE MI RUTA','btn btn-outline');remove.type='button';
        remove.addEventListener('click',async()=>{
          if(busy)return;busy=true;remove.disabled=true;message.textContent='Actualizando tu ruta…';
          try{
            const verified=await getVerifiedSession();
            if(!verified||verified.user.id!==session.user.id){location.replace('login.html');return;}
            await setSelection(row.activity_id,'cancelled');await refresh();message.textContent='Actividad retirada de tu ruta. Si la guardaste en tu calendario personal, elimínala también allí.';
          }
          catch(error){message.textContent=routeError(error);}
          finally{busy=false;remove.disabled=false;}
        });card.append(remove);list.append(card);
      }
    }catch(error){if(current===revision){message.textContent='No pudimos cargar tu ruta en este momento.';exportButton.hidden=true;}}
  }
  exportButton.onclick=()=>{
    exportPanel.replaceChildren();exportPanel.hidden=false;
    const exportable=route.map(r=>r.activity).filter(calendarReady);
    if(!exportable.length){exportPanel.append(element('p','No hay actividades abiertas con horario completo para exportar.'));return;}
    if(exportable.length!==route.length)exportPanel.append(element('p','Se exportarán únicamente las actividades abiertas con horario completo.'));
    const apple=element('button','APPLE / iPHONE · DESCARGAR MI RUTA','btn btn-outline');apple.type='button';
    apple.onclick=()=>downloadRoute(exportable);exportPanel.append(apple,element('h3','AGREGA TU RUTA A GOOGLE CALENDAR'));
    exportPanel.append(element('p','Abre y guarda cada actividad en tu calendario de Google.'));
    for(const a of exportable){const link=element('a',a.title,'btn btn-outline');link.href=googleCalendarUrl(a);link.target='_blank';link.rel='noopener noreferrer';exportPanel.append(link);}
  };
  onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){revision++;route=[];list.replaceChildren();exportButton.hidden=true;exportPanel.hidden=true;}});
  window.addEventListener('focus',refreshOnReturn);
  document.addEventListener('visibilitychange',refreshOnReturn);
  window.addEventListener('storage',event=>{if(event.key==='impulso-activities-changed'&&!busy)refresh();});
  window.addEventListener('storage',event=>{if(event.key==='impulso-attendance-changed')void refresh();});
  document.addEventListener('impulso-attendance-changed',()=>void refresh());
  document.addEventListener('impulso-activities-changed',()=>refresh());
  window.addEventListener('impulso-activities-changed',event=>{if(event.target!==document)refresh();});
  await refresh();
}
export async function loadRouteCount(){
  const label=document.querySelector('[data-account-route-count]');if(!label)return;
  try{const rows=await getMyRoute();label.textContent=`Actividades seleccionadas: ${rows.length}. Seleccionarlas no confirma tu asistencia.`;}
  catch{label.textContent='Tu selección de actividades estará disponible en Mi pasaporte.';}
}
