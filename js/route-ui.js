import { calendarReady, googleCalendarUrl, downloadRoute } from './calendar.js';
const scenarios={cultura:'Cultura',deporte:'Deporte',tecnologia:'Tecnología',diseno:'Diseño',investigacion:'Investigación aplicada',gobernanza:'Gobernanza',bienestar:'Bienestar Integral'};
export function scenarioName(value){return scenarios[value]||value;}
export function element(tag, text, className) {
  const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;
}
export function calendarActions(activity) {
  const actions=element('div',undefined,'route-actions');
  if(!calendarReady(activity)){
    for(const [label,target] of [['GOOGLE CALENDAR','google'],['APPLE / iPHONE','apple']]){
      const button=element('button',label,'btn btn-outline');button.type='button';
      button.addEventListener('click',()=>chooseCalendarTime(activity,target));actions.append(button);
    }
    return actions;
  }
  const google=element('a','GOOGLE CALENDAR','btn btn-outline');google.href=googleCalendarUrl(activity);google.target='_blank';google.rel='noopener noreferrer';
  const apple=element('button','APPLE / iPHONE','btn btn-outline');apple.type='button';
  apple.addEventListener('click',()=>downloadRoute([activity],`impulso-${activity.slug}.ics`));
  actions.append(google,apple);return actions;
}
export function formatActivityTime(a) {
  const date=a?.activity_date?new Date(a.activity_date+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'}):'Fecha por confirmar';
  const start=a?.start_time?.slice(0,5),end=a?.end_time?.slice(0,5);
  const time=start&&end?start+'–'+end:start?start+' · Sin hora de término':end?'Sin hora de inicio · '+end:'HORARIO POR CONFIRMAR';
  return date+' · '+time;
}

function chooseCalendarTime(activity,target){
  const dialog=element('dialog',undefined,'calendar-time-dialog');
  dialog.setAttribute('aria-label','Agregar a mi calendario');
  const form=element('form');
  form.append(element('h2','AGREGAR A MI CALENDARIO'),element('p','El horario oficial está pendiente. Completa los datos para tu calendario personal. Esto no modifica la agenda del festival.'));
  const fields={};
  for(const [key,label,type] of [['activity_date','Fecha','date'],['start_time','Inicio','time'],['end_time','Fin','time']]){
    const wrapper=element('label',label),input=element('input');
    input.type=type;input.required=true;input.value=activity[key]?.slice(0,type==='time'?5:10)||'';
    input.readOnly=Boolean(activity[key]);fields[key]=input;wrapper.append(input);form.append(wrapper);
  }
  const error=element('p');error.setAttribute('role','status');form.append(error);
  const actions=element('div',undefined,'route-actions');
  const save=element('button',target==='google'?'ABRIR GOOGLE CALENDAR':'DESCARGAR PARA APPLE','btn btn-outline');save.type='submit';
  const cancel=element('button','CANCELAR','btn btn-outline');cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
  actions.append(save,cancel);form.append(actions);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const personal={...activity,timezone:'America/Mexico_City'};
    for(const key of Object.keys(fields))personal[key]=fields[key].value;
    if(!calendarReady(personal)){error.textContent='La hora de fin debe ser posterior al inicio.';return;}
    if(target==='google'){
      const link=element('a');link.href=googleCalendarUrl(personal);link.target='_blank';link.rel='noopener noreferrer';dialog.append(link);link.click();
    }else downloadRoute([personal],`impulso-${activity.slug}.ics`);
    dialog.close();
  });
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.append(form);document.body.append(dialog);dialog.showModal();
}
