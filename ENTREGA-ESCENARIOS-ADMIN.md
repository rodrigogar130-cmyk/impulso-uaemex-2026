# Administración por escenarios — entrega local

Nueva migración: supabase/migrations/005_admin_scenario_access.sql.
La carpeta ya contenía 001, 002, 003 y 004. No se modificaron esos archivos.
005 presupone que 004 esté aplicada antes. Solo se confirmó su existencia local; no se consultó el estado remoto.

## Frontend modificado

- js/admin.js: tarjetas por escenario con contadores, búsqueda, tabla filtrada por RPC, navegación de regreso y breadcrumb; estados visibles; editor con destinos autorizados; manejo separado de errores de escenario; staff entra a Actividades y no consulta las RPC globales.
- js/admin-api.js: mensajes de SCENARIO_ADMIN_REQUIRED y SUPER_ADMIN_REQUIRED.
- css/admin.css: tarjetas sobrias de tres, dos y una columna; estados y breadcrumb; conserva DM Sans y estilos base.

La lectura de participantes, usuarios, rutas globales y resumen queda reservada a super_admin tanto en PostgreSQL como en la interfaz. No se añadieron interfaces de asignación, invitaciones ni eliminación de administradores. Las asignaciones solo están preparadas para gestión manual futura.

## RPC y helper

- Nuevo helper interno: require_impulso_scenario_access(text), sin permiso EXECUTE para clientes.
- Nueva RPC: admin_list_scenarios().
- Modificadas: admin_list_activities(text default null), admin_get_activity(uuid), admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz).
- Endurecidas para super_admin: admin_get_dashboard_stats(), admin_get_activity_participants(uuid,integer,integer), admin_list_users(text,integer,integer,boolean), admin_get_user_route(uuid).
- require_impulso_admin() y admin_get_access() se conservan.

## Pruebas realizadas

- node --experimental-vm-modules tests/frontend.mjs: 65 comprobaciones aprobadas, DOM con backend simulado. Incluye flujos existentes, siete tarjetas, staff de Deporte, borradores, filtros, destinos autorizados, navegación y errores.
- node tests/calendar.mjs: aprobado.
- node --check en js/admin.js, js/admin-api.js, tests/admin-scenarios.mjs y tests/database.mjs: aprobado.
- No se realizó validación visual en navegador real.
- tests/admin-scenarios.mjs: preparada, NO ejecutada. Comprueba permisos PostgreSQL, manipulación de ID, edición de origen/destino, slug estable, borradores, tabla privada, revocación y acceso super_admin a los siete escenarios.
- tests/database.mjs: actualizado para incluir 005 y las nuevas pruebas cuando se autorice ejecutar migraciones en un motor de pruebas. NO ejecutado, porque carga migraciones incluso usando PGlite local. La seguridad SQL queda pendiente de verificación dinámica.

No ejecuté ninguna migración en Supabase real.
Tampoco ejecuté migraciones locales, CLI Supabase ni consultas a Supabase real.

Referencia consultada: [Funciones de PostgreSQL en Supabase](https://supabase.com/docs/guides/database/functions), para search_path y permisos de ejecución de funciones SECURITY DEFINER.

## Contenido COMPLETO de 005_admin_scenario_access.sql

```sql
-- Preparada localmente. Requiere 004; no ejecutar automáticamente.
begin;
create table public.admin_scenario_access (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.admin_users(user_id) on delete cascade,
 scenario text not null check (scenario in ('cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar')),
 created_at timestamptz not null default now(),
 unique(user_id,scenario)
);
alter table public.admin_scenario_access enable row level security;
revoke all on public.admin_scenario_access from public,anon,authenticated;
-- Sin policies ni grants para clientes. Asignaciones manuales por operador autorizado.
create function public.require_impulso_scenario_access(p_scenario text) returns void
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 select role into v_role from public.admin_users where user_id=auth.uid() for share;
 if v_role='super_admin' then return; end if;
 if v_role='staff' then
  perform 1 from public.admin_scenario_access
  where user_id=auth.uid() and scenario=p_scenario for share;
  if found then return; end if;
 end if;
 raise exception 'SCENARIO_ADMIN_REQUIRED';
end $$;
revoke all on function public.require_impulso_scenario_access(text) from public,anon,authenticated;

create function public.admin_list_scenarios() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 v_role:=public.require_impulso_admin();
 return (with scenarios(scenario,label,position) as (values
 ('cultura','Cultura e Innovación Creativa',1),('deporte','Deporte',2),
 ('tecnologia','Tecnología',3),('diseno','Diseño',4),
 ('investigacion','Investigación Aplicada',5),('gobernanza','Gobernanza',6),
 ('bienestar','Bienestar Integral',7)), counts as (
 select s.scenario,s.label,s.position,count(a.id) as total_activities,
 count(a.id) filter(where a.status='open') as open_count,
 count(a.id) filter(where a.status='draft') as draft_count,
 count(a.id) filter(where a.status='closed') as closed_count,
 count(a.id) filter(where a.status='cancelled') as cancelled_count
 from scenarios s left join public.activities a on a.scenario=s.scenario
 and a.event_id=(select id from public.events where slug='impulso-uaemex-2026')
 where v_role='super_admin' or exists(select 1 from public.admin_scenario_access x
 where x.user_id=auth.uid() and x.scenario=s.scenario)
 group by s.scenario,s.label,s.position)
 select coalesce(jsonb_agg(to_jsonb(counts)-'position' order by position),'[]'::jsonb) from counts);
end $$;

-- Retirar la firma anterior: una sola RPC, con filtro opcional.
drop function public.admin_list_activities();
create function public.admin_list_activities(p_scenario text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 v_role:=public.require_impulso_admin();
 if p_scenario is not null then perform public.require_impulso_scenario_access(p_scenario); end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select a.*,(select count(*) from public.activity_registrations r
 where r.activity_id=a.id and r.status='registered') as selected_count
 from public.activities a join public.events e on e.id=a.event_id
 where e.slug='impulso-uaemex-2026' and (p_scenario is null or a.scenario=p_scenario)
 and (v_role='super_admin' or exists(select 1 from public.admin_scenario_access x
 where x.user_id=auth.uid() and x.scenario=a.scenario))
 order by a.activity_date nulls last,a.start_time nulls last,a.id
 ) x),'[]'::jsonb);
end $$;

create or replace function public.admin_get_activity(p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.require_impulso_admin();
 select to_jsonb(a)||jsonb_build_object('selected_count',
 (select count(*) from public.activity_registrations r where r.activity_id=a.id and r.status='registered'))
 into v_result from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026';
 if v_result is null then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(v_result->>'scenario');
 return v_result;
end $$;

create or replace function public.admin_update_activity(p_activity_id uuid,p_title text,p_scenario text,p_speaker text,p_activity_date date,
 p_start_time time,p_end_time time,p_location text,p_description text,p_status text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_activity public.activities%rowtype;
begin
 perform public.require_impulso_admin();
 select a.* into v_activity from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026' for update of a;
 if not found then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 perform public.require_impulso_scenario_access(v_activity.scenario);
 if not (v_activity.updated_at is not distinct from p_expected_updated_at) then raise exception 'EDIT_CONFLICT'; end if;
 if p_title is null or trim(p_title)='' then raise exception 'ACTIVITY_TITLE_REQUIRED'; end if;
 if p_scenario is null or p_scenario not in ('cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar') then raise exception 'INVALID_ACTIVITY_SCENARIO'; end if;
 perform public.require_impulso_scenario_access(p_scenario);
 if p_status is null or p_status not in ('draft','open','closed','cancelled') then raise exception 'INVALID_ACTIVITY_STATUS'; end if;
 if p_status='open' and p_activity_date is null then raise exception 'ACTIVITY_DATE_REQUIRED'; end if;
 if p_start_time is not null and p_end_time is not null and p_end_time<=p_start_time then raise exception 'INVALID_ACTIVITY_TIME'; end if;
 update public.activities set title=trim(p_title),scenario=p_scenario,speaker=nullif(trim(p_speaker),''),activity_date=p_activity_date,
 start_time=p_start_time,end_time=p_end_time,location=nullif(trim(p_location),''),description=nullif(trim(p_description),''),
 status=p_status,updated_at=now(),updated_by=auth.uid() where id=p_activity_id;
 return public.admin_get_activity(p_activity_id);
end $$;

-- Datos globales y personales: exclusivos de super_admin.
create or replace function public.admin_get_dashboard_stats() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event uuid;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 select id into v_event from public.events where slug='impulso-uaemex-2026';
 return jsonb_build_object(
 'users',(select count(*) from public.event_registrations where event_id=v_event and status='confirmed'),
 'routes',(select count(distinct r.user_id) from public.activity_registrations r join public.activities a on a.id=r.activity_id where a.event_id=v_event and r.status='registered'),
 'selections',(select count(*) from public.activity_registrations r join public.activities a on a.id=r.activity_id where a.event_id=v_event and r.status='registered'),
 'activities',(select count(*) from public.activities where event_id=v_event and status='open'),
 'attendance',0);
end $$;

create or replace function public.admin_get_activity_participants(p_activity_id uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_rows jsonb; v_total bigint;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 select a.event_id into v_event from public.activities a join public.events e on e.id=a.event_id
 where a.id=p_activity_id and e.slug='impulso-uaemex-2026';
 if v_event is null then raise exception 'ACTIVITY_UNAVAILABLE'; end if;
 select count(*) into v_total from public.activity_registrations where activity_id=p_activity_id and status='registered';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_rows from (
 select p.id as user_id,p.nombre,p.apellidos,p.email,p.tipo_usuario,p.espacio_academico,er.folio,r.status
 from public.activity_registrations r join public.profiles p on p.id=r.user_id
 left join public.event_registrations er on er.user_id=p.id and er.event_id=v_event
 where r.activity_id=p_activity_id and r.status='registered' order by p.apellidos,p.nombre,p.id
 limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)
 ) x;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.admin_list_users(p_search text default '',p_offset integer default 0,p_limit integer default 50,p_only_routes boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 with matched as (
 select p.id as user_id,p.nombre,p.apellidos,p.email,p.tipo_usuario,p.espacio_academico,er.folio,er.status,
 (select count(*) from public.activity_registrations r join public.activities a on a.id=r.activity_id
  where r.user_id=p.id and a.event_id=e.id and r.status='registered') as selected_count
 from public.profiles p join public.event_registrations er on er.user_id=p.id
 join public.events e on e.id=er.event_id where e.slug='impulso-uaemex-2026'
 and (coalesce(p_search,'')='' or strpos(lower(p.nombre||' '||p.apellidos||' '||p.email||' '||er.folio),lower(p_search))>0)
 ), filtered as (select * from matched where not coalesce(p_only_routes,false) or selected_count>0),
 paged as (select * from filtered order by apellidos,nombre,user_id
 limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
 'total',(select count(*) from filtered)) into v_result;
 return v_result;
end $$;

create or replace function public.admin_get_user_route(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.require_impulso_admin()<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.id,r.status,r.created_at,a.id as activity_id,a.title,a.scenario,a.activity_date,a.start_time,a.end_time,a.location
 from public.activity_registrations r join public.activities a on a.id=r.activity_id
 join public.events e on e.id=a.event_id
 where r.user_id=p_user_id and e.slug='impulso-uaemex-2026' and r.status='registered'
 order by a.activity_date nulls last,a.start_time nulls last,a.id) x),'[]'::jsonb);
end $$;

revoke all on function public.admin_list_scenarios(),public.admin_list_activities(text),
 public.admin_get_activity(uuid),public.admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz),
 public.admin_get_dashboard_stats(),public.admin_get_activity_participants(uuid,integer,integer),
 public.admin_list_users(text,integer,integer,boolean),public.admin_get_user_route(uuid) from public,anon,authenticated;
grant execute on function public.admin_list_scenarios(),public.admin_list_activities(text),
 public.admin_get_activity(uuid),public.admin_update_activity(uuid,text,text,text,date,time,time,text,text,text,timestamptz),
 public.admin_get_dashboard_stats(),public.admin_get_activity_participants(uuid,integer,integer),
 public.admin_list_users(text,integer,integer,boolean),public.admin_get_user_route(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
```

## Cambios exactos de js/admin.js

Diff respecto al archivo local recibido al inicio de esta tarea:

```diff
diff --git a/.test-runtime/admin-before-scenarios.js b/js/admin.js
index c33f68d..ab994ea 100644
--- a/.test-runtime/admin-before-scenarios.js
+++ b/js/admin.js
@@ -3,11 +3,12 @@ import { adminCall,adminError } from './admin-api.js';
 import { element,formatActivityTime,scenarioName } from './route-ui.js';
 const content=document.querySelector('#admin-content'),view=document.querySelector('#admin-view'),message=document.querySelector('#admin-message');
 let accessRevision=0,revision=0,identity=null,section='dashboard';
+let adminRole=null,allowedScenarios=[];
 const pageSize=50;
 const editorScenarios={cultura:'Cultura e Innovación Creativa',deporte:'Deporte',tecnologia:'Tecnología',diseno:'Diseño',investigacion:'Investigación Aplicada',gobernanza:'Gobernanza',bienestar:'Bienestar Integral'};
 function say(text){message.textContent=text;}
 function deny(){revision++;identity=null;content.hidden=true;view.replaceChildren();say('No tienes permisos para acceder a esta sección.');setTimeout(()=>location.replace('index-impulso-uaemex-365.html'),2200);}
-function fail(error){if((error?.message||'').includes('ADMIN_REQUIRED'))deny();else say(adminError(error));}
+function fail(error){const code=error?.message||'';if(code.includes('SCENARIO_ADMIN_REQUIRED')||code.includes('SUPER_ADMIN_REQUIRED'))say(adminError(error));else if(code.includes('ADMIN_REQUIRED'))deny();else say(adminError(error));}
 function button(text,action){const b=element('button',text,'btn secondary');b.type='button';b.addEventListener('click',action);return b;}
 function table(headers,rows){
   const wrap=element('div',undefined,'admin-table-wrap'),t=element('table'),head=element('thead'),tr=element('tr'),body=element('tbody');
@@ -25,15 +26,32 @@ async function dashboard(){await run(async current=>{
   }
   view.replaceChildren(element('h2','Resumen general'),grid,element('p','Asistencias: próximamente. Las selecciones no confirman asistencia.'));
 });}
+function statusBadge(status){return element('span',status.toUpperCase(),`admin-status status-${status}`);}
+function breadcrumb(label){const nav=element('nav',`ADMINISTRACIÓN / ACTIVIDADES${label?' / '+label.toUpperCase():''}`,'admin-breadcrumb');nav.setAttribute('aria-label','Ubicación');return nav;}
 async function activities(){await run(async current=>{
-  const rows=await adminCall('admin_list_activities');if(!current())return;
+  const scenarios=await adminCall('admin_list_scenarios');if(!current())return;allowedScenarios=scenarios;
+  const search=element('input');search.type='search';search.placeholder='Buscar escenario';search.setAttribute('aria-label','Buscar escenario');
+  const grid=element('div',undefined,'admin-scenarios');
+  function draw(){const query=search.value.trim().toLocaleLowerCase();grid.replaceChildren();
+    for(const s of scenarios.filter(s=>s.label.toLocaleLowerCase().includes(query))){
+      const card=element('article',undefined,'admin-scenario'),counts=element('div',undefined,'admin-status-counts');
+      for(const status of ['open','draft','closed','cancelled'])counts.append(element('span',`${s[status+'_count']} ${status.toUpperCase()}`,`admin-status status-${status}`));
+      card.append(element('h3',s.label),element('p',`${s.total_activities} actividades`),counts,button('VER ACTIVIDADES →',()=>scenarioActivities(s.scenario)));grid.append(card);
+    }
+    if(!grid.children.length)grid.append(element('p',scenarios.length?'No hay escenarios que coincidan.':'No tienes escenarios asignados.'));
+  }
+  search.addEventListener('input',draw);view.replaceChildren(breadcrumb(),element('h2','Actividades'),search,grid);draw();
+});}
+async function scenarioActivities(scenario){await run(async current=>{
+  const rows=await adminCall('admin_list_activities',{p_scenario:scenario});if(!current())return;
   const search=element('input');search.type='search';search.placeholder='Buscar actividad';search.setAttribute('aria-label','Buscar actividad');
   const state=element('select');state.setAttribute('aria-label','Estado');for(const value of ['','open','draft','closed','cancelled']){const option=element('option',value||'Todos los estados');option.value=value;state.append(option);}
   const results=element('div');
   function draw(){const query=search.value.toLocaleLowerCase();const filtered=rows.filter(a=>(!state.value||a.status===state.value)&&[a.title,a.speaker,a.location,scenarioName(a.scenario)].join(' ').toLocaleLowerCase().includes(query));
-    results.replaceChildren(table(['ACTIVIDAD','FECHA / HORA','ESCENARIO','UBICACIÓN','ESTADO','SELECCIONARON',''],filtered.map(a=>[a.title,formatActivityTime(a),scenarioName(a.scenario),a.location,a.status,a.selected_count,button('VER / EDITAR',()=>detail(a.id))])));
+    results.replaceChildren(table(['ACTIVIDAD','FECHA / HORA','UBICACIÓN','ESTADO','SELECCIONARON','VER / EDITAR'],filtered.map(a=>[a.title,formatActivityTime(a),a.location,statusBadge(a.status),a.selected_count,button('VER / EDITAR',()=>detail(a.id))])));
+    if(!filtered.length)results.append(element('p','No hay actividades que coincidan.'));
   }
-  search.addEventListener('input',draw);state.addEventListener('change',draw);view.replaceChildren(element('h2','Actividades'),search,state,results);draw();
+  search.addEventListener('input',draw);state.addEventListener('change',draw);view.replaceChildren(breadcrumb(editorScenarios[scenario]),button('← VOLVER A ESCENARIOS',activities),element('h2',editorScenarios[scenario]),element('p',`${rows.length} actividades`),search,state,results);draw();
 });}
 async function users(onlyRoutes=false,query='',offset=0){await run(async current=>{
   const data=await adminCall('admin_list_users',{p_search:query,p_offset:offset,p_limit:pageSize,p_only_routes:onlyRoutes});if(!current())return;
@@ -47,10 +65,12 @@ async function userRoute(user){await run(async current=>{
 });}
 async function detail(id){await run(async current=>{
   const activity=await adminCall('admin_get_activity',{p_activity_id:id});if(!current())return;
+  const scenarios=await adminCall('admin_list_scenarios');if(!current())return;allowedScenarios=scenarios;
+  const back=()=>scenarioActivities(activity.scenario);
   const form=element('form',undefined,'admin-edit'),grid=element('div',undefined,'form-grid'),fields={};
   for(const [key,label,type] of [['title','Título','text'],['scenario','Escenario','select'],['slug','Slug','text'],['speaker','PONENTE(S)','text'],['activity_date','Fecha','date'],['start_time','Hora de inicio','time'],['end_time','Hora de término','time'],['location','Ubicación','text'],['description','Descripción','textarea'],['status','Estado','select']]){
     const wrap=element('label',label,key==='description'?'full':''),input=element(type==='textarea'?'textarea':type==='select'?'select':'input');input.name=key;
-    if(type==='select'){for(const value of key==='scenario'?Object.keys(editorScenarios):['draft','open','closed','cancelled']){const opt=element('option',key==='scenario'?editorScenarios[value]:value.toUpperCase());opt.value=value;input.append(opt);}}
+    if(type==='select'){for(const value of key==='scenario'?allowedScenarios.map(s=>s.scenario):['draft','open','closed','cancelled']){const opt=element('option',key==='scenario'?editorScenarios[value]:value.toUpperCase());opt.value=value;input.append(opt);}}
     else if(type!=='textarea')input.type=type;
     input.value=activity[key]||'';
     if(key==='slug')input.readOnly=true;
@@ -60,7 +80,7 @@ async function detail(id){await run(async current=>{
     grid.append(wrap);
   }
   const controls=element('div',undefined,'actions'),save=element('button','GUARDAR CAMBIOS','btn');save.type='submit';
-  controls.append(button('CANCELAR',activities),button('RECARGAR DATOS',()=>detail(id)),save);
+  controls.append(button('CANCELAR',back),button('RECARGAR DATOS',()=>detail(id)),save);
   form.append(grid,controls);
   const audit=element('p',activity.updated_at?`Última modificación: ${new Date(activity.updated_at).toLocaleString('es-MX')} · Administrador: ${activity.updated_by||'Usuario eliminado'}`:'Sin modificaciones administrativas.','admin-audit');
   form.addEventListener('submit',async event=>{
@@ -79,14 +99,14 @@ async function detail(id){await run(async current=>{
     }catch(error){if(expected===revision)fail(error);}finally{save.disabled=false;}
   });
   const participants=element('div',undefined,'panel');
-  view.replaceChildren(button('VOLVER A ACTIVIDADES',activities),element('h2','Editar actividad'),element('p',`Personas que la seleccionaron: ${activity.selected_count} · Asistencias confirmadas: 0`),form,audit,element('h3','ASISTENCIA'),element('p','Próximamente'),participants);
+  view.replaceChildren(breadcrumb(editorScenarios[activity.scenario]),button('VOLVER A ACTIVIDADES',back),element('h2','Editar actividad'),element('p',`Personas que la seleccionaron: ${activity.selected_count} · Asistencias confirmadas: 0`),form,audit,element('h3','ASISTENCIA'),element('p','Próximamente'),participants);
   async function loadParticipants(offset=0){
     try{const data=await adminCall('admin_get_activity_participants',{p_activity_id:id,p_offset:offset,p_limit:pageSize});if(!current())return;
       participants.replaceChildren(element('h3','Participantes'),table(['NOMBRE','CORREO','FOLIO','TIPO','ESPACIO ACADÉMICO','SELECCIÓN'],data.rows.map(u=>[`${u.nombre} ${u.apellidos}`,u.email,u.folio,u.tipo_usuario,u.espacio_academico,u.status==='registered'?'SELECCIONADA':'CANCELADA'])));
       pager(participants,data.total,offset,loadParticipants);
     }catch(error){if(current())fail(error);return false;}
   }
-  return await loadParticipants();
+  if(adminRole==='super_admin')return await loadParticipants();
 });}
 function navigate(next){section=next;document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-current',b.dataset.section===next?'page':'false'));view.replaceChildren();return next==='dashboard'?dashboard():next==='activities'?activities():users(next==='routes');}
 document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.section)));
@@ -95,8 +115,10 @@ async function checkAccess(){
   try{const session=await getSession();if(current!==accessRevision)return;
     if(!session){revision++;identity=null;content.hidden=true;view.replaceChildren();location.replace('login.html?next=admin');return;}
     if(identity!==session.user.id){revision++;content.hidden=true;view.replaceChildren();}
-    await adminCall('admin_get_access');if(current!==accessRevision)return;
-    if(identity!==session.user.id){identity=session.user.id;content.hidden=false;await navigate('dashboard');}
+    const role=await adminCall('admin_get_access');if(current!==accessRevision)return;
+    const roleChanged=adminRole!==role;adminRole=role;
+    document.querySelectorAll('[data-section]').forEach(b=>{b.hidden=role!=='super_admin'&&b.dataset.section!=='activities';});
+    if(identity!==session.user.id||roleChanged){identity=session.user.id;content.hidden=false;await navigate(role==='super_admin'?'dashboard':'activities');}
   }catch(error){if(current===accessRevision){identity=null;revision++;content.hidden=true;view.replaceChildren();fail(error);}}
 }
 onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){accessRevision++;revision++;identity=null;content.hidden=true;view.replaceChildren();location.replace('login.html?next=admin');}else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(checkAccess,0);});
```
