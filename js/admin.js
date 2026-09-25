import { getVerifiedSession,onAuthStateChange } from './auth.js?v=20260921-4';
import { adminCall,adminError } from './admin-api.js?v=20260921-4';
import { element,formatActivityTime,scenarioName } from './route-ui.js?v=20260921-4';
import { attendancePanel } from './admin-attendance.js?v=20260921-4';
import { ensureProfile } from './profile.js?v=20260921-4';
import { requirePrivacyAcknowledgement } from './privacy.js?v=20260921-4';
import { client } from './supabase-client.js?v=20260921-4';
import { SUPABASE_URL } from './config.js?v=20260921-4';
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
  for(const cells of rows){const row=element('tr');cells.forEach((value,index)=>{const td=element('td');td.dataset.label=headers[index]||'';if(value?.nodeType)td.append(value);else td.textContent=value??'—';row.append(td);});body.append(row);}
  t.append(head,body);wrap.append(t);return wrap;
}
async function run(load){const current=++revision;say('CARGANDO...');try{const success=await load(()=>current===revision);if(current===revision&&success!==false)say('');}catch(error){if(current===revision)fail(error);}}
function pager(root,total,offset,load){const bar=element('div',undefined,'actions');bar.append(element('span',`${total} resultados · ${total?offset+1:0}–${Math.min(offset+pageSize,total)}`));const prev=button('ANTERIOR',()=>load(Math.max(0,offset-pageSize))),next=button('SIGUIENTE',()=>load(offset+pageSize));prev.disabled=offset===0;next.disabled=offset+pageSize>=total;bar.append(prev,next);root.append(bar);}
async function dashboard(){await run(async current=>{
  const data=await adminCall('admin_get_dashboard_stats');if(!current())return;
  const grid=element('div',undefined,'admin-metrics');
  for(const [key,label] of [['users','USUARIOS REGISTRADOS'],['routes','RUTAS CREADAS'],['selections','ACTIVIDADES SELECCIONADAS'],['activities','ACTIVIDADES DISPONIBLES'],['attendance','ASISTENCIAS CONFIRMADAS'],['badges','INSIGNIAS OBTENIDAS']]){
    const card=element('article');card.append(element('strong',String(data[key])),element('span',label));grid.append(card);
  }
  view.replaceChildren(element('h2','Resumen general'),grid,element('p','Las asistencias confirmadas se registran mediante NFC. Las selecciones no confirman asistencia.'));
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
  search.addEventListener('input',draw);view.replaceChildren(breadcrumb(),element('h2','Actividades'),...(scenarios.length?[button('+ NUEVA ACTIVIDAD',()=>detail(null))]:[]),search,grid);draw();
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
  search.addEventListener('input',draw);state.addEventListener('change',draw);view.replaceChildren(breadcrumb(editorScenarios[scenario]),button('← VOLVER A ESCENARIOS',activities),element('h2',editorScenarios[scenario]),button('+ AGREGAR ACTIVIDAD',()=>detail(null,scenario)),element('p',`${rows.length} actividades`),search,state,results);draw();
});}
function badgeState(unlocked){return element('span',unlocked?'✓ INSIGNIA OBTENIDA':'INSIGNIA BLOQUEADA',`admin-badge-state ${unlocked?'is-unlocked':'is-locked'}`);}
function passportStamps(completed){const stamps=element('div',undefined,'admin-passport-stamps');stamps.setAttribute('aria-label',`${completed} de 12 actividades completadas`);for(let index=0;index<12;index++){const stamp=element('span');stamp.classList.toggle('is-complete',index<completed);stamps.append(stamp);}return stamps;}
function attendanceDate(value){return value?new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City'}):'—';}
function attendanceMethod(value){return value==='NFC_QR'?'NFC / QR':value||'—';}
async function users(onlyRoutes=false,query='',offset=0){await run(async current=>{
  const data=await adminCall('admin_list_users',{p_search:query,p_offset:offset,p_limit:pageSize,p_only_routes:onlyRoutes});if(!current())return;
  const search=element('form',undefined,'admin-search'),label=element('label','Nombre, correo o folio'),input=element('input');input.type='search';input.value=query;label.append(input);const submit=element('button','BUSCAR','btn secondary');submit.type='submit';search.append(label,submit);search.addEventListener('submit',event=>{event.preventDefault();users(onlyRoutes,input.value,0);});
  const rows=data.rows.map(u=>[`${u.nombre} ${u.apellidos}`,u.email,u.folio,u.tipo_usuario,u.espacio_academico,`${u.attendance_count} / 12`,badgeState(u.badge_unlocked),button(onlyRoutes?'VER RUTA':'VER USUARIO',()=>onlyRoutes?userRoute(u):userPassport(u))]);
  view.replaceChildren(element('h2',onlyRoutes?'Usuarios con ruta creada':'Usuarios'),search,table(['NOMBRE','CORREO','FOLIO','TIPO','ESPACIO ACADÉMICO','PROGRESO','INSIGNIA','ACCIÓN'],rows));
  pager(view,data.total,offset,next=>users(onlyRoutes,query,next));
});}
async function badges(query='',filter='all',offset=0){await run(async current=>{
  const data=await adminCall('admin_list_badges',{p_search:query,p_offset:offset,p_limit:pageSize,p_filter:filter});if(!current())return;
  const search=element('form',undefined,'admin-search'),label=element('label','Nombre, correo o folio'),input=element('input');input.type='search';input.value=query;label.append(input);
  const filterLabel=element('label','Estado'),select=element('select');for(const [value,text] of [['all','Todas'],['obtained','Insignia obtenida'],['pending','Insignia pendiente']]){const option=element('option',text);option.value=value;option.selected=value===filter;select.append(option);}filterLabel.append(select);
  const submit=element('button','BUSCAR','btn secondary');submit.type='submit';search.append(label,filterLabel,submit);search.addEventListener('submit',event=>{event.preventDefault();badges(input.value,select.value,0);});select.addEventListener('change',()=>badges(input.value,select.value,0));
  const grid=element('div',undefined,'admin-badge-grid');
  for(const user of data.rows){const card=element('article',undefined,'admin-badge-card');card.append(element('h3',`${user.nombre} ${user.apellidos}`),element('p',user.folio||'—'),element('p',user.email||'—'),element('p',`${user.attendance_count} / 12 actividades`,'admin-badge-progress'),badgeState(user.badge_unlocked),element('p',user.completed_at?`Fecha: ${attendanceDate(user.completed_at)}`:'Fecha: —'),button('VER DETALLE',()=>userPassport(user)));grid.append(card);}
  if(!data.rows.length)grid.append(element('p','No hay usuarios que coincidan con el filtro.'));
  view.replaceChildren(element('h2','Insignias'),element('p','La insignia se obtiene automáticamente al confirmar 12 actividades distintas.'),search,grid);
  pager(view,data.total,offset,next=>badges(query,filter,next));
});}
async function userPassport(user){await run(async current=>{
  const data=await adminCall('admin_get_user_passport',{p_user_id:user.user_id});if(!current())return;
  const completed=Math.min(Number(data.attendance_count)||0,12),back=()=>section==='badges'?badges():users(section==='routes');
  const identity=element('div',undefined,'admin-summary');identity.append(element('p',data.folio||'—'),element('p',data.email||'—'));
  const status=badgeState(data.badge_unlocked),summary=element('section',undefined,'panel');summary.append(element('h2','Pasaporte del usuario'),element('h3',`${data.nombre} ${data.apellidos}`),identity,element('p',`${completed} / 12 actividades completadas`,'admin-badge-progress'),passportStamps(completed),status);
  if(data.badge_unlocked)summary.append(element('p','Insignia IMPULSO UAEMéx 2026 obtenida.'));
  summary.append(element('p',data.completed_at?`Fecha de obtención: ${attendanceDate(data.completed_at)}`:'Fecha de obtención: —'));
  const evidence=element('section',undefined,'admin-attendance-evidence');evidence.append(element('h3','Asistencias confirmadas'));
  const rows=(data.attendances||[]).map(a=>[a.title,scenarioName(a.scenario),attendanceDate(a.attended_at),attendanceMethod(a.method)]);
  evidence.append(rows.length?table(['ACTIVIDAD','ESCENARIO','CONFIRMADA','MÉTODO'],rows):element('p','No hay asistencias confirmadas.'));
  view.replaceChildren(button('VOLVER',back),summary,evidence,button('VER RUTA',()=>userRoute(data)));
});}
async function userRoute(user){await run(async current=>{
  const rows=await adminCall('admin_get_user_route',{p_user_id:user.user_id});if(!current())return;
  view.replaceChildren(button('VOLVER',()=>users(section==='routes')),element('h2',`${user.nombre} ${user.apellidos}`),element('p',user.folio),element('p',`${rows.length} actividades seleccionadas`),table(['ACTIVIDAD','FECHA / HORA','ESCENARIO','UBICACIÓN'],rows.map(a=>[a.title,formatActivityTime(a),scenarioName(a.scenario),a.location])));
});}
async function detail(id,initialScenario=null){await run(async current=>{
  const creating=!id;
  const activity=creating?{status:'draft',scenario:initialScenario}:await adminCall('admin_get_activity',{p_activity_id:id});if(!current())return;
  const scenarios=await adminCall('admin_list_scenarios');if(!current())return;allowedScenarios=scenarios;
  if(creating){
    if(!scenarios.length){say('No tienes escenarios asignados.');return false;}
    activity.scenario=initialScenario||scenarios[0].scenario;
  }
  const back=()=>(initialScenario||!creating)?scenarioActivities(activity.scenario):activities();
  const form=element('form',undefined,'admin-edit'),grid=element('div',undefined,'form-grid'),fields={};
  for(const [key,label,type] of [['title','Título','text'],['scenario','Escenario','select'],['slug','Slug','text'],['activity_date','Fecha','date'],['start_time','Hora de inicio','time'],['end_time','Hora de término','time'],['location','Ubicación','text'],['description','Descripción','textarea'],['status','Estado','select']]){
    if(creating&&key==='slug')continue;
    const wrap=element('label',label,key==='description'?'full':''),input=element(type==='textarea'?'textarea':type==='select'?'select':'input');input.name=key;
    if(type==='select'){for(const value of key==='scenario'?allowedScenarios.map(s=>s.scenario):['draft','open','closed','cancelled']){const opt=element('option',key==='scenario'?editorScenarios[value]:({draft:'BORRADOR',open:'OPEN',closed:'CERRADA',cancelled:'CANCELADA'}[value]));opt.value=value;input.append(opt);}}
    else if(type!=='textarea')input.type=type;
    input.value=activity[key]||'';
    if(key==='slug')input.readOnly=true;
    if(key==='title'||key==='scenario')input.required=true;
    fields[key]=input;wrap.append(input);
    if(type==='time'){const clear=button('QUITAR HORA',()=>{input.value='';});clear.className='clear-time';wrap.append(clear);}
    grid.append(wrap);
  }
  const controls=element('div',undefined,'actions'),save=element('button',creating?'CREAR ACTIVIDAD':'GUARDAR CAMBIOS','btn');save.type='submit';
  controls.append(button('CANCELAR',back));
  if(!creating)controls.append(button('RECARGAR DATOS',()=>detail(id)));
  controls.append(save);
  form.append(grid,controls);
  const audit=element('p',activity.updated_at?`Última modificación: ${new Date(activity.updated_at).toLocaleString('es-MX')} · Administrador: ${activity.updated_by||'Usuario eliminado'}`:'Sin modificaciones administrativas.','admin-audit');
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(save.disabled||!current())return;
    const value=key=>fields[key].value.trim()||null;
    if(!value('title')){say('El título es obligatorio.');return;}
    if(!Object.hasOwn(editorScenarios,value('scenario'))){say('Selecciona un escenario válido.');return;}
    if(value('status')==='open'&&!value('activity_date')){say('Una actividad OPEN necesita fecha.');return;}
    if(value('start_time')&&value('end_time')&&value('end_time')<=value('start_time')){say('La hora de término debe ser posterior al inicio.');return;}
    const expected=revision;save.disabled=true;say('Guardando cambios…');
    try{
      const saved=await adminCall(creating?'admin_create_activity':'admin_update_activity',{...(creating?{}:{p_activity_id:id,p_expected_updated_at:activity.updated_at}),p_title:value('title'),p_scenario:value('scenario'),p_speaker:activity.speaker||null,p_activity_date:value('activity_date'),p_start_time:value('start_time'),p_end_time:value('end_time'),p_location:value('location'),p_description:value('description'),p_status:value('status')});
      try{localStorage.setItem('impulso-activities-changed',String(Date.now()));}catch{}
      if(expected!==revision)return;
      await detail(creating?saved.id:id);say(creating?'Actividad creada.':'Cambios guardados.');
    }catch(error){if(expected===revision)fail(error);}finally{save.disabled=false;}
  });
  const participants=element('div',undefined,'panel');
  const linkedSpeakers=element('section',undefined,'panel');
  view.replaceChildren(breadcrumb(editorScenarios[activity.scenario]),button('VOLVER A ACTIVIDADES',back),element('h2',creating?'Nueva actividad':'Editar actividad'),element('h3','Información de la actividad'),...(creating?[]:[element('p',`Personas que la seleccionaron: ${activity.selected_count} · Asistencias confirmadas: ${activity.attendance_count??0}`)]),form,...(creating?[]:[audit,linkedSpeakers,attendancePanel(activity,current),participants]));
  if(creating)return;
  if(adminRole==='super_admin'){
    const confirmation=element('section',undefined,'panel');confirmation.hidden=true;
    confirmation.setAttribute('role','group');confirmation.setAttribute('aria-label','Confirmar eliminación de actividad');
    const cancelDelete=button('CANCELAR',()=>{confirmation.hidden=true;deleteButton.focus();});
    const confirmDelete=button('ELIMINAR DEFINITIVAMENTE',async()=>{
      if(save.disabled||confirmDelete.disabled||!current())return;
      const expected=revision;save.disabled=true;confirmDelete.disabled=true;cancelDelete.disabled=true;deleteButton.disabled=true;
      say('Eliminando actividad…');
      try{
        await adminCall('admin_delete_activity',{p_activity_id:id});
        try{localStorage.setItem('impulso-activities-changed',String(Date.now()));}catch{}
        if(expected!==revision)return;
        await scenarioActivities(activity.scenario);say('Actividad eliminada.');
      }catch(error){if(expected===revision){confirmation.hidden=true;fail(error);deleteButton.focus();}}
      finally{save.disabled=false;confirmDelete.disabled=false;cancelDelete.disabled=false;deleteButton.disabled=false;}
    });
    confirmation.append(element('h3','¿Eliminar definitivamente esta actividad?'),element('p','Esta acción solo está disponible si nadie la ha seleccionado.'),cancelDelete,confirmDelete);
    const deleteButton=button('ELIMINAR ACTIVIDAD',()=>{if(save.disabled||!current())return;confirmation.hidden=false;cancelDelete.focus();});
    view.append(deleteButton,confirmation);
  }
  async function loadParticipants(offset=0){
    try{const data=await adminCall('admin_get_activity_participants',{p_activity_id:id,p_offset:offset,p_limit:pageSize});if(!current())return;
      participants.replaceChildren(element('h3','Participantes'),table(['NOMBRE','CORREO','FOLIO','TIPO','ESPACIO ACADÉMICO','SELECCIÓN'],data.rows.map(u=>[`${u.nombre} ${u.apellidos}`,u.email,u.folio,u.tipo_usuario,u.espacio_academico,u.status==='registered'?'SELECCIONADA':'CANCELADA'])));
      pager(participants,data.total,offset,loadParticipants);
    }catch(error){if(current())fail(error);return false;}
  }
  if(adminRole==='super_admin'){
    await activitySpeakerPanel(id,linkedSpeakers,current);
    return await loadParticipants();
  }
});}
async function activitySpeakerPanel(activityId,root,current){
  const heading=element('h3','Ponentes vinculados');
  const description=element('p','Los cambios se vinculan por actividad y se reflejan automáticamente en la sección pública.');
  root.replaceChildren(heading,description,element('p','Cargando ponentes vinculados…'));
  try{
    let availableRows=[];
    try{const available=await adminCall('admin_list_speakers',{p_limit:100});availableRows=Array.isArray(available.rows)?available.rows:[];}catch{}
    if(!current())return;
    const search=element('input');search.type='search';search.placeholder='Buscar por nombre u organización';search.setAttribute('aria-label','Buscar ponente existente');
    const select=element('select');select.setAttribute('aria-label','Seleccionar ponente existente');
    const participation=element('select');participation.setAttribute('aria-label','Tipo de participación');
    for(const [value,label] of [['','Tipo de participación'],['Ponente','Ponente'],['Moderador/a','Moderador/a'],['Tallerista','Tallerista'],['Panelista','Panelista'],['Conferencista','Conferencista'],['Artista invitado/a','Artista invitado/a']]){const option=element('option',label);option.value=value;participation.append(option);}
    const order=element('input');order.type='number';order.min='0';order.value='0';order.setAttribute('aria-label','Orden de participación');
    const fillSelect=()=>{const query=search.value.trim().toLocaleLowerCase();const previous=select.value;select.replaceChildren(element('option','Selecciona un ponente'));select.firstChild.value='';for(const speaker of availableRows.filter(item=>[item.name,item.organization].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))){const option=element('option',`${speaker.name}${speaker.organization?` · ${speaker.organization}`:''}`);option.value=speaker.id;option.selected=speaker.id===previous;select.append(option);}};
    search.addEventListener('input',fillSelect);fillSelect();
    const redraw=async()=>{const response=await adminCall('admin_list_activity_speakers',{p_activity_id:activityId}),data=Array.isArray(response)?response:[];if(!current())return;
      const add=element('div',undefined,'admin-speaker-add');add.append(search,select,participation,order,button('+ AGREGAR PONENTE',async()=>{if(!select.value){say('Selecciona un ponente.');return;}try{await adminCall('admin_link_activity_speaker',{p_activity_id:activityId,p_speaker_id:select.value,p_participation_type:participation.value||null,p_sort_order:Number(order.value)||0});select.value='';participation.value='';order.value='0';await redraw();say('Ponente vinculado.');}catch(error){fail(error);}}),button('CREAR NUEVO PONENTE',()=>speakerDetail(null,activityId,{participationType:participation.value,sortOrder:Number(order.value)||0})));
      const cards=element('div',undefined,'admin-speaker-cards');for(const item of data){const card=element('article',undefined,'admin-speaker-card'),copy=element('div',undefined,'admin-speaker-copy'),actions=element('div',undefined,'actions');copy.append(element('h4',item.name),element('p',item.participation_type||'Tipo de participación por definir'),...(item.organization?[element('p',item.organization,'admin-muted')]:[]),...(item.bio?[element('p',item.bio,'admin-muted')]:[]),statusBadge(item.status||'draft'));actions.append(button('EDITAR PONENTE',()=>speakerDetail(item.speaker_id,activityId,{participationType:item.participation_type,sortOrder:item.sort_order})),button('DESVINCULAR',async()=>{try{await adminCall('admin_unlink_activity_speaker',{p_activity_id:activityId,p_speaker_id:item.speaker_id});await redraw();say('Ponente desvinculado.');}catch(error){fail(error);}}));card.append(photoPreview(item.photo_path,item.name),copy,actions);cards.append(card);}
      root.replaceChildren(heading,description,add,data.length?cards:element('p','Sin ponentes vinculados. Agrega uno existente o crea uno nuevo.'));
    };
    await redraw();
  }catch(error){
    if(!current())return;
    root.replaceChildren(heading,description,element('p','No fue posible cargar los ponentes vinculados. Intenta recargar los datos de la actividad.'));
    fail(error);
  }
}
async function speakers(query='',scenario='',status='',photo='',offset=0){await run(async current=>{
  const data=await adminCall('admin_list_speakers',{p_search:query,p_scenario:scenario||null,p_status:status||null,p_photo:photo||null,p_offset:offset,p_limit:pageSize});if(!current())return;
  const form=element('form',undefined,'admin-search'),search=element('input');search.type='search';search.value=query;search.placeholder='Nombre, organización o actividad';search.setAttribute('aria-label','Buscar ponente');
  const scenarioSelect=element('select');scenarioSelect.append(element('option','Todos los escenarios'));scenarioSelect.firstChild.value='';for(const [key,label] of Object.entries(editorScenarios)){const option=element('option',label);option.value=key;option.selected=key===scenario;scenarioSelect.append(option);}
  const statusSelect=element('select');for(const [value,label] of [['','Todos los estados'],['active','Activo'],['draft','Borrador'],['hidden','Oculto']]){const option=element('option',label);option.value=value;option.selected=value===status;statusSelect.append(option);}
  const photoSelect=element('select');for(const [value,label] of [['','Con y sin fotografía'],['with','Con fotografía'],['without','Sin fotografía']]){const option=element('option',label);option.value=value;option.selected=value===photo;photoSelect.append(option);}
  const submit=element('button','BUSCAR','btn secondary');submit.type='submit';form.append(search,scenarioSelect,statusSelect,photoSelect,submit);form.addEventListener('submit',event=>{event.preventDefault();speakers(search.value,scenarioSelect.value,statusSelect.value,photoSelect.value);});
  const rows=data.rows.map(s=>[s.name,s.organization||'—',`${s.activity_count} actividades`,(s.scenarios||[]).map(x=>scenarioName(x)).join(' · ')||'—',statusBadge(s.status),button('EDITAR',()=>speakerDetail(s.id))]);
  view.replaceChildren(element('h2','Ponentes'),button('+ NUEVO PONENTE',()=>speakerDetail(null)),form,table(['PONENTE','ORGANIZACIÓN','ACTIVIDADES','ESCENARIOS','ESTADO','ACCIÓN'],rows));pager(view,data.total,offset,next=>speakers(query,scenario,status,photo,next));
});}
const speakerPlaceholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#1a1a1a"/><circle cx="60" cy="43" r="22" fill="#777"/><path d="M20 112c5-25 21-38 40-38s35 13 40 38" fill="#777"/></svg>');
function photoPreview(path,name){const image=element('img',undefined,'admin-speaker-photo');image.width=88;image.height=88;image.alt=path?name:`Fotografía no disponible de ${name||'ponente'}`;image.src=path?`${SUPABASE_URL}/storage/v1/object/public/speaker-photos/${path}`:speakerPlaceholder;image.onerror=()=>{image.onerror=null;image.src=speakerPlaceholder;};return image;}
async function speakerDetail(id,linkToActivity=null,linkDefaults={}){await run(async current=>{
  const creating=!id;const speaker=creating?{name:'',bio:'',organization:'',photo_path:null,status:linkToActivity?'active':'draft',activities:[]}:await adminCall('admin_get_speaker',{p_speaker_id:id});if(!current())return;
  const form=element('form',undefined,'admin-edit'),grid=element('div',undefined,'form-grid'),fields={};
  for(const [key,label,type] of [['name','Nombre completo','text'],['bio','Semblanza','textarea'],['organization','Organización / cargo','text'],['status','Estado','select']]){const wrap=element('label',label,key==='bio'?'full':''),input=element(type==='textarea'?'textarea':type==='select'?'select':'input');input.name=key;if(type==='select'){for(const [value,text] of [['active','Activo'],['draft','Borrador'],['hidden','Oculto']]){const option=element('option',text);option.value=value;option.selected=value===speaker.status;input.append(option);}}else input.value=speaker[key]||'';if(key==='name')input.required=true;fields[key]=input;wrap.append(input);grid.append(wrap);}
  const photo=element('input');photo.type='file';photo.accept='image/jpeg,image/png,image/webp';const photoWrap=element('label','Fotografía', 'full'),preview=photoPreview(speaker.photo_path,speaker.name);photo.addEventListener('change',()=>{const file=photo.files[0];if(!file)return;if(file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type)){photo.value='';say('La fotografía debe ser JPEG, PNG o WEBP y pesar máximo 5 MB.');return;}const reader=new FileReader();reader.addEventListener('load',()=>{preview.src=reader.result;preview.alt=`Vista previa de ${fields.name.value.trim()||'ponente'}`;},{once:true});reader.readAsDataURL(file);});photoWrap.append(photo,preview);grid.append(photoWrap);
  const removePhoto=element('input');removePhoto.type='checkbox';removePhoto.disabled=!speaker.photo_path;const removeWrap=element('label','Quitar fotografía actual', 'full');removeWrap.append(removePhoto);grid.append(removeWrap);
  const controls=element('div',undefined,'actions'),save=element('button',creating?'CREAR PONENTE':'GUARDAR','btn');save.type='submit';controls.append(button('CANCELAR',()=>linkToActivity?detail(linkToActivity):activities()),save);form.append(grid,controls);
  const linked=element('section',undefined,'panel');linked.append(element('h3','Actividades vinculadas'));const drawLinks=async()=>{const fresh=creating?[]:(await adminCall('admin_get_speaker',{p_speaker_id:id})).activities||[];linked.replaceChildren(element('h3','Actividades vinculadas'),...(fresh.length?fresh.map(a=>{const row=element('div',undefined,'admin-speaker-link');row.append(element('span',`${a.title} · ${a.participation_type||'Sin tipo'}`),button('DESVINCULAR',async()=>{await adminCall('admin_unlink_activity_speaker',{p_activity_id:a.activity_id,p_speaker_id:id});await drawLinks();}));return row;}):[element('p','Sin actividades vinculadas.')]));};if(!creating)await drawLinks();
  form.addEventListener('submit',async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;try{let saved=creating?await adminCall('admin_create_speaker',{p_name:fields.name.value.trim(),p_bio:fields.bio.value.trim()||null,p_organization:fields.organization.value.trim()||null,p_status:fields.status.value}):speaker;let path=removePhoto.checked?null:saved.photo_path;if(photo.files[0]){const file=photo.files[0];if(file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('INVALID_SPEAKER_PHOTO');const ext=file.type.split('/')[1]==='jpeg'?'jpg':file.type.split('/')[1];path=`speakers/${saved.id}/${crypto.randomUUID()}.${ext}`;const {error}=await client().storage.from('speaker-photos').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;}saved=await adminCall('admin_update_speaker',{p_speaker_id:saved.id,p_name:fields.name.value.trim(),p_bio:fields.bio.value.trim()||null,p_organization:fields.organization.value.trim()||null,p_photo_path:path,p_status:fields.status.value});if(speaker.photo_path&&speaker.photo_path!==path){await client().storage.from('speaker-photos').remove([speaker.photo_path]);}if(linkToActivity)await adminCall('admin_link_activity_speaker',{p_activity_id:linkToActivity,p_speaker_id:saved.id,p_participation_type:linkDefaults.participationType||null,p_sort_order:Number(linkDefaults.sortOrder)||0});await (linkToActivity?detail(linkToActivity):activities());say(creating?'Ponente creado.':'Cambios guardados.');}catch(error){fail(error);}finally{save.disabled=false;}});
  view.replaceChildren(button('VOLVER A LA ACTIVIDAD',()=>linkToActivity?detail(linkToActivity):activities()),element('h2',creating?'Nuevo ponente':'Editar ponente'),form,...(creating||linkToActivity?[]:[linked]));
});}
function navigate(next){section=next;document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-current',b.dataset.section===next?'page':'false'));view.replaceChildren();return next==='dashboard'?dashboard():next==='activities'?activities():next==='badges'?badges():users(next==='routes');}
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
    const profile=await ensureProfile(session.user);if(current!==accessRevision)return;
    if(!await requirePrivacyAcknowledgement(session.user,profile,'admin.html')){revision++;identity=null;content.hidden=true;view.replaceChildren();return;}
    if(current!==accessRevision)return;
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
