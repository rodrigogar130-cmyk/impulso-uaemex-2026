import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20260921-4';
import { element } from './route-ui.js?v=20260921-4';

const target=document.querySelector('#speakersDynamic');
const placeholderSvg=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#1a1a1a"/><circle cx="60" cy="43" r="22" fill="#777"/><path d="M20 112c5-25 21-38 40-38s35 13 40 38" fill="#777"/></svg>')}`;
const scenarioNames={cultura:'Cultura',deporte:'Deporte',tecnologia:'Tecnología',diseno:'Diseño',investigacion:'Investigación aplicada',gobernanza:'Gobernanza',bienestar:'Bienestar Integral'};

function photoUrl(path){return path?`${SUPABASE_URL}/storage/v1/object/public/speaker-photos/${path.split('/').map(encodeURIComponent).join('/')}`:placeholderSvg;}
function agendaLink(participation){
  const link=element('a','VER ACTIVIDAD ','text-link');link.href='#agenda';link.append(element('span','↗'));
  link.dataset.agendaStage=participation.scenario;link.dataset.agendaQuery=participation.title;
  link.addEventListener('click',event=>{
    event.preventDefault();
    const disclosure=document.querySelector('#agendaDisclosure');if(disclosure)disclosure.open=true;
    const stage=document.querySelector(`button[data-stage="${participation.scenario}"]`);if(stage)stage.click();
    const search=document.querySelector('#agendaSearch');if(search){search.value=participation.title;search.dispatchEvent(new Event('input',{bubbles:true}));}
    const agenda=document.querySelector('#agenda');agenda?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    history.replaceState(null,'','#agenda');
  });
  return link;
}
function speakerCard(speaker,scenario){
  const card=element('article',undefined,'speaker speaker-dynamic');
  const image=element('img',undefined,'speaker-photo');image.src=photoUrl(speaker.photo_path);image.alt=speaker.photo_path?speaker.name:`Fotografía no disponible de ${speaker.name}`;image.width=96;image.height=96;image.loading='lazy';image.decoding='async';image.onerror=()=>{if(image.src!==placeholderSvg)image.src=placeholderSvg;};
  const first=speaker.participations[0];
  card.append(image,element('span',first?.participation_type||'Participación','micro-label'),element('h4',speaker.name));
  if(speaker.bio)card.append(element('p',speaker.bio,'speaker-profile'));
  if(speaker.organization)card.append(element('p',speaker.organization,'content-note'));
  const participations=element('div',undefined,'speaker-participations');
  for(const participation of speaker.participations){participation.scenario=scenario;const item=element('div',undefined,'speaker-participation');item.append(element('p',participation.title),agendaLink(participation));participations.append(item);}
  card.append(participations);return card;
}
function render(groups){
  target.replaceChildren();
  for(const group of groups||[]){
    const details=element('details',undefined,'speaker-group'),summary=element('summary');
    summary.append(element('span',String(group.position).padStart(2,'0'),'group-index'),element('h3',group.label||scenarioNames[group.scenario]),element('span','+','group-action'));details.append(summary);
    details.addEventListener('toggle',()=>{
      if(!details.open)return;
      target.querySelectorAll('.speaker-group[open]').forEach(openGroup=>{if(openGroup!==details)openGroup.open=false;});
    });
    if(!group.speakers?.length){details.append(element('p','Ponentes por confirmar.','content-note'));}
    else {const grid=element('div',undefined,'speakers-grid');group.speakers.forEach(speaker=>grid.append(speakerCard(speaker,group.scenario)));details.append(grid);}
    target.append(details);
  }
}
async function load(){
  if(!target)return;
  target.setAttribute('aria-busy','true');
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_list_speakers`,{method:'POST',credentials:'omit',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:'{}'});
    if(!response.ok)throw new Error('PUBLIC_SPEAKERS_UNAVAILABLE');
    render(await response.json());
  }catch{target.replaceChildren(element('p','Ponentes por confirmar.','content-note'));}
  finally{target.removeAttribute('aria-busy');}
}
void load();
