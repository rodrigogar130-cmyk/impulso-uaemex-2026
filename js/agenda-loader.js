import { requestedActivity } from './return-to.js?v=20260921-4';

// The public catalog and private route module are imported only when Agenda is needed.
const agenda=document.getElementById('agenda');
let loading=null,loaded=false,observer=null;
function wantsAgenda(){return ['#agenda','#arma-tu-ruta'].includes(location.hash)||Boolean(requestedActivity());}
export function requestAgenda(){
 if(loaded||loading)return loading||Promise.resolve();
 const list=document.getElementById('agendaList');
 list.dataset.catalogState='loading';list.setAttribute('aria-busy','true');list.textContent='Cargando actividades…';
 document.getElementById('agendaResults').textContent='Cargando actividades…';
 loading=import('./agenda-route.js?v=20260921-4').then(()=>{
  loaded=true;observer?.disconnect();window.removeEventListener('scroll',nearAgenda);window.removeEventListener('resize',nearAgenda);
 }).catch(()=>{
  list.dataset.catalogState='error';list.setAttribute('aria-busy','false');list.textContent='No pudimos cargar la agenda en este momento. ';
  document.getElementById('agendaResults').textContent='No pudimos cargar la agenda en este momento.';
  const retry=document.createElement('button');retry.type='button';retry.className='btn btn-outline';retry.textContent='VOLVER A INTENTAR';
  retry.onclick=()=>void requestAgenda();list.append(retry);
 }).finally(()=>{loading=null;});
 return loading;
}
function nearAgenda(){
 if(loaded||loading||!agenda)return;
 const bounds=agenda.getBoundingClientRect();
 if(bounds.top<=window.innerHeight+1000&&bounds.bottom>=-1000)void requestAgenda();
}
document.addEventListener('click',event=>{
 if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a[href]');if(!link)return;
 const url=new URL(link.getAttribute('href'),location.href);
 if(url.origin===new URL(location.href).origin&&['#agenda','#arma-tu-ruta'].includes(url.hash))void requestAgenda();
},true);
window.addEventListener('hashchange',()=>{if(wantsAgenda())void requestAgenda();});
// Filtering controls also recover gracefully when IntersectionObserver is unavailable.
agenda?.addEventListener('focusin',()=>void requestAgenda());
agenda?.addEventListener('input',()=>void requestAgenda());
if(wantsAgenda())await requestAgenda();
else if(agenda&&'IntersectionObserver' in window){
 observer=new window.IntersectionObserver(entries=>{
  if(entries.some(entry=>entry.isIntersecting))void requestAgenda();
 },{rootMargin:'1000px 0px',threshold:0});
 observer.observe(agenda);
}else if(agenda){
 window.addEventListener('scroll',nearAgenda,{passive:true});
 window.addEventListener('resize',nearAgenda,{passive:true});
 nearAgenda();
}
