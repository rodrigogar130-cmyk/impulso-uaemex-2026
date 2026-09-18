import { getSession,onAuthStateChange } from './auth.js';
import { getMyRoute, setSelection, routeError } from './activities.js';
import { calendarReady, downloadRoute, googleCalendarUrl } from './calendar.js';
import { element, calendarActions, formatActivityTime, scenarioName } from './route-ui.js';

export async function loadMyRoute(){
  const root=document.querySelector('#my-route');if(!root)return;
  const list=root.querySelector('[data-route-list]');
  const message=root.querySelector('[data-route-message]');
  const count=root.querySelector('[data-route-count]');
  const exportButton=root.querySelector('[data-export-route]');
  const exportPanel=root.querySelector('[data-export-options]');
  let route=[],busy=false,revision=0;
  async function refresh(){
    const current=++revision;
    try{
      const session=await getSession();
      if(!session){route=[];list.replaceChildren();exportButton.hidden=true;exportPanel.hidden=true;return;}
      const rows=await getMyRoute();if(current!==revision)return;
      route=rows;message.textContent='';
      count.textContent=`${route.length} ACTIVIDADES SELECCIONADAS`;
      exportButton.hidden=route.length===0;
      exportPanel.hidden=true;list.replaceChildren();
      if(!route.length)list.append(element('p','Tu ruta está vacía. Explora la agenda y elige las actividades que te interesan.'));
      for(const row of route){
        const a=row.activity;const card=element('article',undefined,'route-card');
        card.append(element('h3',a?.title||'Actividad no disponible'));
        if(a){card.append(element('p',formatActivityTime(a)),element('p',`${scenarioName(a.scenario)} · ${a.location||'Ubicación por confirmar'}`),element('p',a.speaker||'Ponente por confirmar'));}
        card.append(element('p','AGREGADA A TU RUTA','route-selected'));
        if(a)card.append(calendarActions(a));
        else card.append(element('p','Esta actividad ya no está abierta. Puedes retirarla de tu ruta.'));
        const remove=element('button','QUITAR DE MI RUTA','btn btn-outline');remove.type='button';
        remove.addEventListener('click',async()=>{
          if(busy)return;busy=true;remove.disabled=true;message.textContent='Actualizando tu ruta…';
          try{await setSelection(row.activity_id,'cancelled');await refresh();message.textContent='Actividad retirada de tu ruta. Si la guardaste en tu calendario personal, elimínala también allí.';}
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
  window.addEventListener('focus',()=>{if(!busy)refresh();});
  window.addEventListener('storage',event=>{if(event.key==='impulso-activities-changed'&&!busy)refresh();});
  const timer=globalThis.setInterval?.(()=>{if(!document.hidden&&!busy)refresh();},30000);
  window.addEventListener('pagehide',()=>globalThis.clearInterval?.(timer));
  await refresh();
}
export async function loadRouteCount(){
  const label=document.querySelector('[data-account-route-count]');if(!label)return;
  try{const rows=await getMyRoute();label.textContent=`Actividades seleccionadas: ${rows.length}. Seleccionarlas no confirma tu asistencia.`;}
  catch{label.textContent='Tu selección de actividades estará disponible en Mi pasaporte.';}
}
