import { getVerifiedSession,onAuthStateChange } from './auth.js';
import { adminCall,adminError } from './admin-api.js';
import { element,formatActivityTime,scenarioName } from './route-ui.js';
const content=document.querySelector('#admin-content'),view=document.querySelector('#admin-view'),message=document.querySelector('#admin-message');
let accessRevision=0,revision=0,identity=null,section='dashboard';
let adminRole=null,allowedScenarios=[];
const pageSize=50;
const editorScenarios={cultura:'Cultura e Innovación Creativa',deporte:'Deporte',tecnologia:'Tecnología',diseno:'Diseño',investigacion:'Investigación Aplicada',gobernanza:'Gobernanza',bienestar:'Bienestar Integral'};
function say(text){message.textContent=text;}
function deny(){revision++;identity=null;content.hidden=true;view.replaceChildren();say('No tienes permisos para acceder a esta sección.');setTimeout(()=>location.replace('index.html'),2200);}
function fail(error){const code=error?.message||'';if(code.includes('SCENARIO_ADMIN_REQUIRED')||code.includes('SUPER_ADMIN_REQUIRED'))say(adminError(error));else if(code.includes('ADMIN_REQUIRED'))deny();else say(adminError(error));}
function button(text,action){const b=element('button',text,'btn secondary');b.type='button';b.addEventListener('click',action);return b;}
function table(headers,rows){
  const wrap=element('div',undefined,'admin-table-wrap'),t=element('table'),head=element('thead'),tr=element('tr'),body=element('tbody');
  for(const title of headers){const th=element('th',title);th.scope='col';tr.append(th);}head.append(tr);
  for(const cells of rows){const row=element('tr');for(const value of cells){const td=element('td');if(value?.nodeType)td.append(value);else td.textContent=value??'—';row.append(td);}body.append(row);}
  t.append(head,body);wrap.append(t);return wrap;
}
async function run(load){const current=++revision;say('CARGANDO...');try{const success=await load(()=>current===revision);if(current===revision&&success!==false)say('');}catch(error){if(current===revision)fail(error);}}
function pager(root,total,offset,load){const bar=element('div',undefined,'actions');bar.append(element('span',`${total} resultados · ${total?offset+1:0}–${Math.min(offset+pageSize,total)}`));const prev=button('ANTERIOR',()=>load(Math.max(0,offset-pageSize))),next=button('SIGUIENTE',()=>load(offset+pageSize));prev.disabled=offset===0;next.disabled=offset+pageSize>=total;bar.append(prev,next);root.append(bar);}
async function dashboard(){await run(async current=>{
  const data=await adminCall('admin_get_dashboard_stats');if(!current())return;
  const grid=element('div',undefined,'admin-metrics');
  for(const [key,label] of [['users','USUARIOS REGISTRADOS'],['routes','RUTAS CREADAS'],['selections','ACTIVIDADES SELECCIONADAS'],['activities','ACTIVIDADES DISPONIBLES'],['attendance','ASISTENCIAS CONFIRMADAS']]){
    const card=element('article');card.append(element('strong',String(data[key])),element('span',label));grid.append(card);
  }
  view.replaceChildren(element('h2','Resumen general'),grid,element('p','Asistencias: próximamente. Las selecciones no confirman asistencia.'));
});}
function statusBadge(status){return element('span',status.toUpperCase(),`admin-status status-${status}`);}
function breadcrumb(label){const nav=element('nav',`ADMINISTRACIÓN / ACTIVIDADES${label?' / '+label.toUpperCase():''}`,'admin-breadcrumb');nav.setAttribute('aria-label','Ubicación');return nav;}
async function activities(){await run(async current=>{
  const scenarios=await adminCall('admin_list_scenarios');if(!current())return;allowedScenarios=scenarios;
  const search=element('input');search.type='search';search.placeholder='Buscar escenario';search.setAttribute('aria-label','Buscar escenario');
  const grid=element('div',undefined,'admin-scenarios');
  function draw(){const query=search.value.trim().toLocaleLowerCase();grid.replaceChildren();
    for(const s of scenarios.filter(s=>s.label.toLocaleLowerCase().includes(query))){
      const card=element('article',undefined,'admin-scenario'),counts=element('div',undefined,'admin-status-counts');
      for(const status of ['open','draft','closed','cancelled'])counts.append(element('span',`${s[status+'_count']} ${status.toUpperCase()}`,`admin-status status-${status}`));
      card.append(element('h3',s.label),element('p',`${s.total_activities} actividades`),counts,button('VER ACTIVIDADES →',()=>scenarioActivities(s.scenario)));grid.append(card);
    }
    if(!grid.children.length)grid.append(element('p',scenarios.length?'No hay escenarios que coincidan.':'No tienes escenarios asignados.'));
  }
  search.addEventListener('input',draw);view.replaceChildren(breadcrumb(),element('h2','Actividades'),search,grid);draw();
});}
async function scenarioActivities(scenario){await run(async current=>{
  const rows=await adminCall('admin_list_activities',{p_scenario:scenario});if(!current())return;
  const search=element('input');search.type='search';search.placeholder='Buscar actividad';search.setAttribute('aria-label','Buscar actividad');
  const state=element('select');state.setAttribute('aria-label','Estado');for(const value of ['','open','draft','closed','cancelled']){const option=element('option',value||'Todos los estados');option.value=value;state.append(option);}
  const results=element('div');
  function draw(){const query=search.value.toLocaleLowerCase();const filtered=rows.filter(a=>(!state.value||a.status===state.value)&&[a.title,a.speaker,a.location,scenarioName(a.scenario)].join(' ').toLocaleLowerCase().includes(query));
    results.replaceChildren(table(['ACTIVIDAD','FECHA / HORA','UBICACIÓN','ESTADO','SELECCIONARON','VER / EDITAR'],filtered.map(a=>[a.title,formatActivityTime(a),a.location,statusBadge(a.status),a.selected_count,button('VER / EDITAR',()=>detail(a.id))])));
    if(!filtered.length)results.append(element('p','No hay actividades que coincidan.'));
  }
  search.addEventListener('input',draw);state.addEventListener('change',draw);view.replaceChildren(breadcrumb(editorScenarios[scenario]),button('← VOLVER A ESCENARIOS',activities),element('h2',editorScenarios[scenario]),element('p',`${rows.length} actividades`),search,state,results);draw();
});}
async function users(onlyRoutes=false,query='',offset=0){await run(async current=>{
  const data=await adminCall('admin_list_users',{p_search:query,p_offset:offset,p_limit:pageSize,p_only_routes:onlyRoutes});if(!current())return;
  const search=element('form',undefined,'admin-search'),label=element('label','Nombre, correo o folio'),input=element('input');input.type='search';input.value=query;label.append(input);const submit=element('button','BUSCAR','btn secondary');submit.type='submit';search.append(label,submit);search.addEventListener('submit',event=>{event.preventDefault();users(onlyRoutes,input.value,0);});
  view.replaceChildren(element('h2',onlyRoutes?'Usuarios con ruta creada':'Usuarios'),search,table(['NOMBRE','CORREO','FOLIO','TIPO','ESPACIO ACADÉMICO','SELECCIONES',''],data.rows.map(u=>[`${u.nombre} ${u.apellidos}`,u.email,u.folio,u.tipo_usuario,u.espacio_academico,u.selected_count,button('VER RUTA',()=>userRoute(u))])));
  pager(view,data.total,offset,next=>users(onlyRoutes,query,next));
});}
async function userRoute(user){await run(async current=>{
  const rows=await adminCall('admin_get_user_route',{p_user_id:user.user_id});if(!current())return;
  view.replaceChildren(button('VOLVER',()=>users(section==='routes')),element('h2',`${user.nombre} ${user.apellidos}`),element('p',user.folio),element('p',`${rows.length} actividades seleccionadas`),table(['ACTIVIDAD','FECHA / HORA','ESCENARIO','UBICACIÓN'],rows.map(a=>[a.title,formatActivityTime(a),scenarioName(a.scenario),a.location])));
});}
async function detail(id){await run(async current=>{
  const activity=await adminCall('admin_get_activity',{p_activity_id:id});if(!current())return;
  const scenarios=await adminCall('admin_list_scenarios');if(!current())return;allowedScenarios=scenarios;
  const back=()=>scenarioActivities(activity.scenario);
  const form=element('form',undefined,'admin-edit'),grid=element('div',undefined,'form-grid'),fields={};
  for(const [key,label,type] of [['title','Título','text'],['scenario','Escenario','select'],['slug','Slug','text'],['speaker','PONENTE(S)','text'],['activity_date','Fecha','date'],['start_time','Hora de inicio','time'],['end_time','Hora de término','time'],['location','Ubicación','text'],['description','Descripción','textarea'],['status','Estado','select']]){
    const wrap=element('label',label,key==='description'?'full':''),input=element(type==='textarea'?'textarea':type==='select'?'select':'input');input.name=key;
    if(type==='select'){for(const value of key==='scenario'?allowedScenarios.map(s=>s.scenario):['draft','open','closed','cancelled']){const opt=element('option',key==='scenario'?editorScenarios[value]:value.toUpperCase());opt.value=value;input.append(opt);}}
    else if(type!=='textarea')input.type=type;
    input.value=activity[key]||'';
    if(key==='slug')input.readOnly=true;
    if(key==='title'||key==='scenario')input.required=true;
    fields[key]=input;wrap.append(input);
    if(type==='time'){const clear=button('QUITAR HORA',()=>{input.value='';});clear.className='clear-time';wrap.append(clear);}
    grid.append(wrap);
  }
  const controls=element('div',undefined,'actions'),save=element('button','GUARDAR CAMBIOS','btn');save.type='submit';
  controls.append(button('CANCELAR',back),button('RECARGAR DATOS',()=>detail(id)),save);
  form.append(grid,controls);
  const audit=element('p',activity.updated_at?`Última modificación: ${new Date(activity.updated_at).toLocaleString('es-MX')} · Administrador: ${activity.updated_by||'Usuario eliminado'}`:'Sin modificaciones administrativas.','admin-audit');
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(save.disabled)return;
    const value=key=>fields[key].value.trim()||null;
    if(!value('title')){say('El título es obligatorio.');return;}
    if(!Object.hasOwn(editorScenarios,value('scenario'))){say('Selecciona un escenario válido.');return;}
    if(value('status')==='open'&&!value('activity_date')){say('Una actividad OPEN necesita fecha.');return;}
    if(value('start_time')&&value('end_time')&&value('end_time')<=value('start_time')){say('La hora de término debe ser posterior al inicio.');return;}
    const expected=revision;save.disabled=true;say('Guardando cambios…');
    try{
      await adminCall('admin_update_activity',{p_activity_id:id,p_title:value('title'),p_scenario:value('scenario'),p_speaker:value('speaker'),p_activity_date:value('activity_date'),p_start_time:value('start_time'),p_end_time:value('end_time'),p_location:value('location'),p_description:value('description'),p_status:value('status'),p_expected_updated_at:activity.updated_at});
      try{localStorage.setItem('impulso-activities-changed',String(Date.now()));}catch{}
      if(expected!==revision)return;
      await detail(id);say('Cambios guardados.');
    }catch(error){if(expected===revision)fail(error);}finally{save.disabled=false;}
  });
  const participants=element('div',undefined,'panel');
  view.replaceChildren(breadcrumb(editorScenarios[activity.scenario]),button('VOLVER A ACTIVIDADES',back),element('h2','Editar actividad'),element('p',`Personas que la seleccionaron: ${activity.selected_count} · Asistencias confirmadas: 0`),form,audit,element('h3','ASISTENCIA'),element('p','Próximamente'),participants);
  async function loadParticipants(offset=0){
    try{const data=await adminCall('admin_get_activity_participants',{p_activity_id:id,p_offset:offset,p_limit:pageSize});if(!current())return;
      participants.replaceChildren(element('h3','Participantes'),table(['NOMBRE','CORREO','FOLIO','TIPO','ESPACIO ACADÉMICO','SELECCIÓN'],data.rows.map(u=>[`${u.nombre} ${u.apellidos}`,u.email,u.folio,u.tipo_usuario,u.espacio_academico,u.status==='registered'?'SELECCIONADA':'CANCELADA'])));
      pager(participants,data.total,offset,loadParticipants);
    }catch(error){if(current())fail(error);return false;}
  }
  if(adminRole==='super_admin')return await loadParticipants();
});}
function navigate(next){section=next;document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-current',b.dataset.section===next?'page':'false'));view.replaceChildren();return next==='dashboard'?dashboard():next==='activities'?activities():users(next==='routes');}
document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.section)));
let accessPromise=null, checkAgain=false, lastAccessCheck=0;
function checkAccess(){
  if(accessPromise){checkAgain=true;return accessPromise;}
  accessPromise=(async()=>{
    do{checkAgain=false;await verifyAccess();}while(checkAgain);
  })().finally(()=>{lastAccessCheck=Date.now();accessPromise=null;});
  return accessPromise;
}
function checkOnReturn(){
  if(!document.hidden&&!accessPromise&&Date.now()-lastAccessCheck>=120000)void checkAccess();
}
async function verifyAccess(){
  const current=++accessRevision;
  try{const session=await getVerifiedSession();if(current!==accessRevision)return;
    if(!session){revision++;identity=null;content.hidden=true;view.replaceChildren();location.replace('login.html?next=admin');return;}
    if(identity!==session.user.id){revision++;content.hidden=true;view.replaceChildren();}
    const role=await adminCall('admin_get_access');if(current!==accessRevision)return;
    const roleChanged=adminRole!==role;adminRole=role;
    document.querySelectorAll('[data-section]').forEach(b=>{b.hidden=role!=='super_admin'&&b.dataset.section!=='activities';});
    if(identity!==session.user.id||roleChanged){identity=session.user.id;content.hidden=false;await navigate(role==='super_admin'?'dashboard':'activities');}
  }catch(error){if(current===accessRevision){identity=null;revision++;content.hidden=true;view.replaceChildren();fail(error);}}
}
onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){accessRevision++;revision++;identity=null;content.hidden=true;view.replaceChildren();location.replace('login.html?next=admin');}
  else if(session&&identity&&session.user.id!==identity){
    accessRevision++;revision++;identity=null;content.hidden=true;view.replaceChildren();setTimeout(checkAccess,0);
  }
});
window.addEventListener('focus',checkOnReturn);
document.addEventListener('visibilitychange',checkOnReturn);
await checkAccess();
