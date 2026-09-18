import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseHTML } from '../.test-runtime/node_modules/linkedom/esm/index.js';
const root = process.cwd();
let passed = 0;
const ok = name => { passed++; console.log('PASS:', name); };
const user = { id: 'user-a', email: 'a@example.invalid', email_confirmed_at: '2026-09-17', user_metadata: { nombre:'Ana',apellidos:'Prueba',tipo_usuario:'Público general' } };
const event = { id: 'event-2026', slug:'impulso-uaemex-2026',status:'open' };
function backend(session = null) {
  const listeners = [];
  const state = {session, profiles:[], registrations:[], calls:[], listeners, activities:[], route:[]};
  const emit = (type, value) => listeners.forEach(fn => fn(type, value));
  state.client = {
    async rpc(name,args) {
      state.calls.push(['rpc',name,args]);
      if(name==='list_impulso_activities')return {data:state.activities};
      if(name==='get_my_impulso_route')return {data:state.route.filter(r=>r.status==='registered').map(r=>({...r,activity:state.activities.find(a=>a.id===r.activity_id)||null}))};
      if(name==='set_my_activity_registration'){
        let row=state.route.find(r=>r.activity_id===args.p_activity_id);
        if(!row){row={id:'selection-'+args.p_activity_id,activity_id:args.p_activity_id,status:'cancelled'};state.route.push(row);}
        const activity=state.activities.find(a=>a.id===args.p_activity_id);
        row.status=args.p_status;return {data:row};
      }
      throw new Error('Unexpected RPC '+name);
    },
    auth: {
      async getSession(){return {data:{session:state.session}};},
      async getUser(){return {data:{user:state.session?.user}};},
      onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
      async signUp(payload){state.calls.push(['signUp',payload]);return {data:{user,session:null}};},
      async signInWithPassword(payload){state.calls.push(['signIn',payload]);state.session={user};emit('SIGNED_IN',state.session);return {data:state.session};},
      async signOut(){state.calls.push(['signOut']);state.session=null;emit('SIGNED_OUT',null);return {};},
      async resetPasswordForEmail(...args){state.calls.push(['reset',...args]);return {};},
      async updateUser(payload){state.calls.push(['updatePassword',payload]);return {};},
      async resend(payload){state.calls.push(['resend',payload]);return {};}
    },
    from(table) {
      let op='select', payload, filters=[];
      const query = {
        select(){return query;},eq(k,v){filters.push([k,v]);return query;},
        insert(v){op='insert';payload=v;return query;},update(v){op='update';payload=v;return query;},
        single(){return run();},maybeSingle(){return run();}
      };
      async function run(){
        state.calls.push([table,op,payload]);
        if(table==='events') return {data:event};
        const list=table==='profiles'?state.profiles:state.registrations;
        if(op==='insert') {
          if(table==='event_registrations' && list.length) return {error:{code:'23505'}};
          const row=table==='profiles'?{id:user.id,...payload}:{id:'reg-a',user_id:user.id,...payload,folio:'IMP-2026-000001',status:'confirmed',created_at:'2026-09-17T12:00:00Z'};
          list.push(row);return {data:row};
        }
        const row=list.find(row=>filters.every(([k,v])=>row[k]===v));
        if(op==='update' && row)Object.assign(row,payload);
        return {data:row||null};
      }
      return query;
    }
  };
  return state;
}
async function load(page, script, state, search='') {
  const {document,Event} = parseHTML(fs.readFileSync(page,'utf8'));
  for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option[selected]')?.textContent ?? '';},set(v){for(const opt of this.querySelectorAll('option'))opt.toggleAttribute('selected',(opt.getAttribute('value')??opt.textContent)===v);}});
  const nativeCreate=document.createElement.bind(document);
  document.createElement=(name)=>{const el=nativeCreate(name);if(name==='select')Object.defineProperty(el,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? '';},set(v){for(const opt of this.querySelectorAll('option'))opt.toggleAttribute('selected',opt.getAttribute('value')===v);}});return el;};
  for(const form of document.querySelectorAll('form')){
    form.elements = Object.fromEntries([...form.querySelectorAll('[name]')].map(el=>[el.name,el]));
    form.reportValidity = () => true;
  }
  const location={href:`http://127.0.0.1:5500/${page}${search}`,search,hash:'',replace(value){this.destination=value;},reload(){this.reloaded=true;}};
  const context = vm.createContext({setTimeout,TextEncoder,CustomEvent:document.defaultView.CustomEvent,document,location,window:{location,scrollY:0,addEventListener(){},matchMedia(){return {matches:false,addEventListener(){}};}},URL,URLSearchParams,console,Error,Date,FormData:class {
    constructor(form){this.values=new Map([...form.querySelectorAll('[name]')].filter(el=>!el.disabled).map(el=>[el.name,el.value]));}
    get(key){return this.values.get(key)??null;}
  }});
  const cache=new Map();
  async function moduleFor(file) {
    if(cache.has(file))return cache.get(file);
    let mod;
    if(file.endsWith('supabase-client.js')){
      mod = new vm.SyntheticModule(['client','supabase'],function(){this.setExport('client',()=>state.client);this.setExport('supabase',state.client);},{context,identifier:file});
    } else mod = new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});
    cache.set(file,mod);
    await mod.link((specifier,parent)=>moduleFor(path.resolve(path.dirname(parent.identifier),specifier)));
    return mod;
  }
  const mod=await moduleFor(path.resolve('js',script));await mod.evaluate();
  return {document,location,async submit(selector,values={}){
    const form=document.querySelector(selector);for(const [k,v]of Object.entries(values))form.elements[k].value=v;
    form.dispatchEvent(new Event('submit',{cancelable:true}));
    for(let i=0;i<12;i++)await new Promise(setImmediate);
  },moduleFor};
}

let state=backend();let page=await load('registro.html','registro.js',state);
await page.submit('form',{nombre:'Ana',apellidos:'Prueba',tipo_usuario:'Público general',email:user.email,password:'password123',confirm_password:'different'});
assert.equal(state.calls.length,0);assert.match(page.document.querySelector('[data-message]').textContent,/no coinciden/);ok('contraseñas diferentes no envían solicitudes');
await page.submit('form',{confirm_password:'password123'});
assert.equal(state.calls[0][0],'signUp');assert.equal(state.registrations.length,0);assert.equal(page.document.querySelector('#signup-result').hidden,false);assert.match(page.document.querySelector('#signup-result').textContent,/Revisa tu correo/);ok('crear cuenta solicita confirmación y no registra al evento');

state=backend();page=await load('login.html','login.js',state);
await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'mi-cuenta.html');assert.equal(state.profiles.length,1);assert.equal(state.registrations.length,1);ok('login prepara perfil y folio antes de redirigir');
state=backend({user});page=await load('login.html','login.js',state,'?confirmed=1');assert.equal(state.session,null);assert.equal(page.location.destination,undefined);assert.equal(state.registrations.length,0);ok('confirmación no inscribe hasta iniciar sesión');

state=backend();page=await load('mi-cuenta.html','account.js',state);assert.equal(page.location.destination,'login.html');assert.equal(page.document.querySelector('[data-private]').hidden,true);ok('Mi cuenta sin sesión redirige sin mostrar contenido privado');
state=backend();page=await load('pasaporte.html','passport.js',state);assert.equal(page.location.destination,'login.html');ok('pasaporte sin sesión redirige a login');

state=backend({user});page=await load('mi-cuenta.html','account.js',state);
assert.equal(state.profiles.length,1);assert.equal(state.registrations.length,1);assert.equal(page.document.querySelector('#event-form'),null);assert.equal(page.document.querySelector('#folio').textContent,'IMP-2026-000001');ok('acceso confirmado crea perfil e inscripción automática');
const insertCount=state.calls.filter(c=>c[0]==='event_registrations' && c[1]==='insert').length;
page=await load('mi-cuenta.html','account.js',state);
assert.equal(state.registrations.length,1);assert.equal(state.calls.filter(c=>c[0]==='event_registrations' && c[1]==='insert').length,insertCount);assert.equal(page.document.querySelector('#folio').textContent,'IMP-2026-000001');ok('recarga conserva folio sin intentar otra inserción');
await page.submit('#profile-form',{nombre:'Ana editada'});assert.equal(state.profiles[0].nombre,'Ana editada');ok('perfil editable');
state.listeners.forEach(fn=>fn('SIGNED_IN',{user:{id:'user-b'}}));assert.equal(page.location.reloaded,true);assert.equal(page.document.querySelector('[data-private]').hidden,true);ok('cambio de usuario oculta datos anteriores');

page=await load('pasaporte.html','passport.js',state);assert.equal(page.document.querySelector('#passport-content').hidden,false);assert.match(page.document.querySelector('#passport-content').textContent,/0 \/ 12/);ok('pasaporte confirmado muestra 0 / 12');
state=backend({user});page=await load('pasaporte.html','passport.js',state);assert.equal(page.document.querySelector('#passport-content').hidden,false);assert.equal(state.registrations.length,1);ok('acceso directo al pasaporte garantiza inscripción automática');

state=backend();page=await load('recuperar-password.html','recovery.js',state);
await page.submit('#request-form',{email:user.email});assert.equal(state.calls[0][0],'reset');assert.match(state.calls[0][2].redirectTo,/recuperar-password.html\?mode=reset$/);ok('recuperación envía enlace con destino correcto');
state=backend({user});page=await load('recuperar-password.html','recovery.js',state,'?mode=reset');assert.equal(page.document.querySelector('#reset-form').hidden,false);
await page.submit('#reset-form',{password:'newpassword123',confirm_password:'newpassword123'});assert.equal(state.calls[0][0],'updatePassword');assert.equal(state.session,null);ok('recuperación guarda contraseña y cierra sesión');

state=backend();page=await load('index-impulso-uaemex-365.html','navbar-auth.js',state);
assert.equal(page.document.querySelector('[data-auth-user]').hidden,true);
state.session={user};state.listeners.forEach(fn=>fn('SIGNED_IN',{user}));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(page.document.querySelector('[data-auth-guest]').hidden,true);assert.equal(page.document.querySelector('[data-auth-passport]').textContent,'Mi pasaporte');ok('navbar cambia según sesión');

const before=parseHTML(fs.readFileSync('backups/landing-antes-auth.html','utf8')).document;
const after=parseHTML(fs.readFileSync('index-impulso-uaemex-365.html','utf8')).document;
for(const id of ['pasaporte','escenarios','ponentes','mapa'])assert.equal(after.getElementById(id).outerHTML,before.getElementById(id).outerHTML);
const preservedCatalog=JSON.parse(fs.readFileSync('data/activities-catalog.json','utf8'));
assert.equal(preservedCatalog.length,67);
assert.deepEqual(preservedCatalog.map(a=>a.title),[...before.querySelectorAll('.agenda-title strong')].map(x=>x.textContent));
assert.equal(after.querySelectorAll('.agenda-item').length,0);
ok('contenido público y las 67 actividades originales conservados');
for(const file of ['index-impulso-uaemex-365.html','registro.html','login.html','mi-cuenta.html','pasaporte.html','recuperar-password.html']){
 const doc=parseHTML(fs.readFileSync(file,'utf8')).document;
 for(const el of doc.querySelectorAll('[src],[href]')){
  const value=el.getAttribute('src')||el.getAttribute('href');
  if(!value||/^(https?:|#|data:)/.test(value))continue;
  assert.ok(fs.existsSync(path.resolve(root,value.split(/[?#]/)[0])),`${file}: ${value}`);
 }
}
ok('enlaces y recursos locales existen');
state=backend();page=await load('registro.html','registro.js',state);
const ui=await page.moduleFor(path.resolve('js/ui.js'));
const form=page.document.createElement('form');
form.innerHTML='<button type="submit">Guardar</button>';form.reportValidity=()=>true;
page.document.body.append(form);
let resolveAction, submits=0;
const pending=new Promise(resolve=>resolveAction=resolve);
ui.namespace.bindForm(form,async()=>{submits++;await pending;});
const Event=page.document.defaultView.Event;
form.dispatchEvent(new Event('submit',{cancelable:true}));
form.dispatchEvent(new Event('submit',{cancelable:true}));
assert.equal(submits,1);assert.equal(form.getAttribute('aria-busy'),'true');assert.equal(form.querySelector('button').disabled,true);
resolveAction();for(let i=0;i<3;i++)await new Promise(setImmediate);
assert.equal(form.querySelector('button').disabled,false);ok('doble clic bloqueado y estado de carga restaurado');
const student=page.document.querySelector('select');student.value='Estudiante';student.dispatchEvent(new Event('change'));
assert.equal(page.document.querySelector('[data-student]').hidden,false);
assert.equal(page.document.querySelector('[name="numero_cuenta"]').required,true);ok('campos de estudiante visibles y obligatorios');
state=backend();page=await load('recuperar-password.html','recovery.js',state,'?mode=reset');
assert.equal(page.document.querySelector('#reset-form').hidden,true);assert.match(page.document.querySelector('[data-message]').textContent,/caducado/);ok('enlace de recuperación sin sesión muestra error');
console.log(`${passed} comprobaciones aprobadas (DOM y Supabase simulado; no navegador real).`);

state=backend({user:{...user,email_confirmed_at:null}});page=await load('mi-cuenta.html','account.js',state);assert.equal(state.registrations.length,0);assert.equal(state.profiles.length,0);assert.equal(page.location.destination,'login.html');ok('correo no confirmado nunca crea perfil ni folio');
state=backend({user});page=await load('login.html','login.js',state,'?confirmed=1');state.session={user};
const prep=await page.moduleFor(path.resolve('js/prepare-account.js'));
const results=await Promise.all([prep.namespace.prepareAccount(),prep.namespace.prepareAccount()]);assert.equal(state.registrations.length,1);assert.equal(results[0].registration.folio,results[1].registration.folio);ok('solicitudes simultáneas recuperan el mismo folio tras duplicado');
state.registrations[0].status='cancelled';page=await load('mi-cuenta.html','account.js',state);assert.equal(state.registrations.length,1);assert.equal(state.registrations[0].status,'cancelled');ok('registro cancelado no se duplica ni reactiva');
console.log('Total final: '+passed+' comprobaciones aprobadas.');

const signupValues={nombre:'Ana',apellidos:'Prueba',tipo_usuario:'Público general',email:user.email,password:'password123',confirm_password:'password123'};
state=backend();page=await load('registro.html','registro.js',state);await page.submit('form',signupValues);
const neutral=page.document.querySelector('#signup-result').textContent;
assert.equal(state.profiles.length,0);assert.equal(state.registrations.length,0);
assert.equal(page.document.querySelector('#signup-result a').getAttribute('href'),'login.html');
assert.ok(page.document.querySelector('#signup-result a[href="recuperar-password.html"]'));ok('respuesta neutral con acceso y recuperación, sin crear perfil ni folio');
for(const code of ['user_already_exists','email_exists']){
 state=backend();state.client.auth.signUp=async()=>({error:{code}});
 page=await load('registro.html','registro.js',state);await page.submit('form',signupValues);
 assert.equal(page.document.querySelector('#signup-result').hidden,false);
 assert.equal(page.document.querySelector('#signup-result').textContent,neutral);
 assert.equal(state.calls.length,0);ok('respuesta idéntica ante '+code+' sin consultar usuarios');
}
state=backend();state.client.auth.signUp=async()=>({error:{code:'over_email_send_rate_limit'}});
page=await load('registro.html','registro.js',state);await page.submit('form',signupValues);
assert.equal(page.document.querySelector('#signup-result').hidden,true);assert.equal(page.document.querySelector('form').hidden,false);ok('error temporal permite reintentar sin fingir envío');
console.log('Total actualizado: '+passed+' pruebas aprobadas.');

for(const file of ['index-impulso-uaemex-365.html','mi-cuenta.html','pasaporte.html','login.html','registro.html','recuperar-password.html']){
 state=backend({user});page=await load(file,'navbar-auth.js',state);
 assert.equal(page.document.querySelectorAll('#siteHeader').length,1);
 assert.equal(page.document.querySelectorAll('#mobileMenu').length,1);
 for(const id of ['evento','escenarios','ponentes','agenda','ubicacion']){
  const href='index-impulso-uaemex-365.html#'+id;
  assert.ok(page.document.querySelector('.nav-links a[href="'+href+'"]'));
  assert.ok(after.getElementById(id));
 }
 assert.equal(page.document.querySelector('.nav-actions [data-auth-user]').hidden,false);
 const toggle=page.document.querySelector('#menuToggle');const menu=page.document.querySelector('#mobileMenu');
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(menu.hasAttribute('inert'),false);
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(menu.hasAttribute('inert'),true);
 ok(file+': header compartido, destinos y menú móvil');
}
state=backend({user});page=await load('index-impulso-uaemex-365.html','navbar-auth.js',state);
assert.equal(page.document.querySelector('.hero [data-auth-guest]').hidden,true);
assert.equal(page.document.querySelector('.hero [data-auth-user]').hidden,false);
assert.match(page.document.querySelector('.hero [data-auth-user]').textContent,/MI CUENTA/);ok('HERO con sesión muestra Mi cuenta');
assert.ok(!/text-decoration\s*:\s*underline/.test(fs.readFileSync('css/site.css','utf8')+fs.readFileSync('css/account.css','utf8')+fs.readFileSync('index-impulso-uaemex-365.html','utf8')));ok('sin reglas de subrayado');
console.log('Total navegación: '+passed+' comprobaciones aprobadas.');

state=backend({user});state.client.auth.getUser=async()=>({data:{user:null},error:{code:'user_not_found',status:403}});
page=await load('index-impulso-uaemex-365.html','navbar-auth.js',state);
assert.equal(state.session,null);assert.equal(page.document.querySelector('.nav-actions [data-auth-guest]').hidden,false);assert.equal(page.document.querySelector('.nav-actions [data-auth-user]').hidden,true);ok('usuario eliminado limpia sesión y recupera registro e inicio de sesión');
state=backend({user});state.client.auth.getUser=async()=>({data:{user:null},error:{status:503}});
page=await load('index-impulso-uaemex-365.html','navbar-auth.js',state);
assert.ok(state.session);assert.equal(state.calls.filter(c=>c[0]==='signOut').length,0);ok('fallo temporal no elimina sesión almacenada');

const initialActivity=JSON.parse(fs.readFileSync('data/activities-catalog.json','utf8'))[0];
const openActivity={...initialActivity,id:'activity-1',status:'open',timezone:'America/Mexico_City'};
state=backend();state.activities=[{...openActivity}];page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);
let card=page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]');
assert.doesNotMatch(card.textContent,/cupo|lugares disponibles|sin límite/i);assert.equal(card.querySelector('.route-controls button').textContent,'ASISTIR');
assert.doesNotMatch(card.textContent,/Consultando disponibilidad|Consultando cupo/);

assert.equal(state.calls.filter(c=>c[0]==='rpc'&&c[1]==='get_my_impulso_route').length,0);
card.querySelector('.route-controls > button').click();
assert.equal(page.location.href,'login.html?activity='+openActivity.slug);
assert.equal(state.route.length,0);
ok('cupo NULL seleccionable y acceso conserva actividad');
state=backend({user});state.activities=[{...openActivity}];page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);
card=page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]');card.querySelector('.route-controls > button').click();
for(let i=0;i<30;i++)await new Promise(setImmediate);
assert.equal(state.route[0].status,'registered');assert.match(card.textContent,/AGREGADA A TU RUTA/);assert.equal(card.querySelector('a[href^="https://calendar.google.com"]'),null);assert.match(card.textContent,/GOOGLE CALENDAR/);assert.match(card.textContent,/APPLE/);ok('selección sin hora final guarda ruta sin habilitar calendario');
card.querySelector('.route-controls > button').click();for(let i=0;i<30;i++)await new Promise(setImmediate);
assert.equal(state.route[0].status,'cancelled');ok('quitar selección actualiza disponibilidad');
state=backend();state.activities=[{...openActivity,}];page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);card=page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]');assert.doesNotMatch(card.textContent,/cupo|lugares disponibles|sin límite/i);assert.equal(card.querySelector('.route-controls button').textContent,'ASISTIR');ok('ningún contador ni capacidad antigua bloquea selección');
state=backend();state.activities=[{...openActivity,}];page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);assert.doesNotMatch(page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]').textContent,/cupo|lugares disponibles|sin límite|27 de 80/i);ok('no muestra disponibilidad numérica');
state=backend();page=await load('login.html','login.js',state,'?activity='+openActivity.slug);await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'index-impulso-uaemex-365.html?activity='+openActivity.slug+'#arma-tu-ruta');ok('login regresa a actividad sin seleccionarla automáticamente');
state=backend();page=await load('registro.html','registro.js',state,'?activity='+openActivity.slug);await page.submit('form',signupValues);assert.match(state.calls[0][1].options.emailRedirectTo,/confirmed=1&activity=/);ok('confirmación conserva destino de actividad');
state=backend();page=await load('login.html','login.js',state,'?activity=https%3A%2F%2Fevil.example');await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'mi-cuenta.html');ok('destinos externos rechazados');
state=backend({user});state.activities=[{...openActivity,end_time:'10:00:00'}];state.route=[{id:'r1',activity_id:'activity-1',status:'registered'}];page=await load('pasaporte.html','passport.js',state);assert.match(page.document.querySelector('[data-route-count]').textContent,/1 ACTIVIDADES/);assert.match(page.document.querySelector('.metrics').textContent,/0 \/ 12/);assert.ok(page.document.querySelector('[data-route-list] a[href^="https://calendar.google.com"]'));ok('Mi ruta cuenta selecciones sin sumar asistencias y ofrece calendarios');
console.log('Total fase 2 frontend: '+passed+' comprobaciones aprobadas.');

page.document.querySelector('[data-export-route]').click();assert.equal(page.document.querySelector('[data-export-options]').hidden,false);assert.ok(page.document.querySelector('[data-export-options] a[href^="https://calendar.google.com"]'));assert.match(page.document.querySelector('[data-export-options] button').textContent,/APPLE/);ok('exportación completa muestra ICS y enlaces Google por actividad');
console.log('Total final: '+passed+' comprobaciones DOM.');

state=backend();const originalRpc=state.client.rpc;
state.client.rpc=async(name,args)=>{if(name==='list_impulso_activities')throw new Error('offline');return originalRpc(name,args);};
page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);
assert.equal(page.document.querySelector('#route-status').textContent,'');
assert.equal(page.document.querySelector('.route-controls button'),null);
assert.match(page.document.querySelector('#agendaList').textContent,/No pudimos cargar la agenda/);
assert.equal(state.calls.filter(c=>c[1]==='get_my_impulso_route').length,0);
ok('fallo inicial público no consulta datos privados ni inventa actividades');
state=backend({user});state.activities=[{...openActivity}];const signedRpc=state.client.rpc;
state.client.rpc=async(name,args)=>{if(name==='get_my_impulso_route')throw new Error('private failure');return signedRpc(name,args);};
page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);
assert.match(page.document.querySelector('#route-status').textContent,/No pudimos cargar tu ruta en este momento/);
assert.equal(page.document.querySelectorAll('#route-status button').length,1);
assert.equal(page.document.querySelector('.route-controls button').textContent,'ASISTIR');
ok('fallo privado conserva tarjetas y muestra un solo aviso general');

state=backend();page=await load('admin.html','admin.js',state);assert.equal(page.location.destination,'login.html?next=admin');assert.equal(page.document.querySelector('#admin-content').hidden,true);ok('admin sin sesión redirige sin consultar datos');
state=backend({user});state.client.rpc=async()=>({error:{message:'ADMIN_REQUIRED'}});
page=await load('admin.html','admin.js',state);assert.equal(page.document.querySelector('#admin-content').hidden,true);assert.match(page.document.querySelector('#admin-message').textContent,/No tienes permisos/);ok('admin normal denegado sin revelar contenido');
state=backend({user});state.activities=[{...openActivity,updated_at:null,updated_by:null,selected_count:0}];
state.client.rpc=async(name,args)=>{
 state.calls.push([name,args]);
 if(name==='admin_get_access')return {data:'super_admin'};
 if(name==='admin_list_scenarios')return {data:['cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar'].map(scenario=>({scenario,label:scenario==='cultura'?'Cultura e Innovación Creativa':scenario,total_activities:1,open_count:1,draft_count:0,closed_count:0,cancelled_count:0}))};
 if(name==='admin_get_dashboard_stats')return {data:{users:1,routes:0,selections:0,activities:1,attendance:0}};
 if(name==='admin_list_activities')return {data:state.activities};
 if(name==='admin_get_activity')return {data:state.activities[0]};
 if(name==='admin_get_activity_participants'||name==='admin_list_users')return {data:{rows:[],total:0}};
 if(name==='admin_update_activity')return {data:{...state.activities[0],updated_at:'2026-09-17T12:00:00Z',updated_by:user.id}};
 throw Error(name);
};
page=await load('admin.html','admin.js',state);assert.equal(page.document.querySelector('#admin-content').hidden,false);assert.match(page.document.querySelector('#admin-view').textContent,/ASISTENCIAS CONFIRMADAS/);ok('super_admin conserva dashboard');
page.document.querySelector('[data-section="activities"]').click();for(let i=0;i<20;i++)await new Promise(setImmediate);
assert.equal(page.document.querySelectorAll('.admin-scenario').length,7);ok('super_admin ve siete tarjetas');
page.document.querySelector('.admin-scenario button').click();for(let i=0;i<20;i++)await new Promise(setImmediate);
assert.equal(state.calls.find(c=>c[0]==='admin_list_activities')[1].p_scenario,'cultura');ok('listado envía escenario seleccionado');
[...page.document.querySelectorAll('#admin-view button')].find(b=>b.textContent==='VER / EDITAR').click();for(let i=0;i<20;i++)await new Promise(setImmediate);
assert.ok(page.document.querySelector('#admin-view').textContent.includes('PONENTE(S)'));
assert.equal(page.document.querySelector('[name="slug"]').readOnly,true);
assert.ok(!page.document.querySelector('[name="title"]').readOnly);
assert.equal(page.document.querySelector('[name="title"]').required,true);
const scenarioSelect=page.document.querySelector('select[name="scenario"]');
assert.deepEqual([...scenarioSelect.querySelectorAll('option')].map(o=>o.value),['cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar']);
assert.equal(scenarioSelect.querySelector('option').textContent,'Cultura e Innovación Creativa');
page.document.querySelector('[name="title"]').value='   ';
page.document.querySelector('.admin-edit').dispatchEvent(new page.document.defaultView.Event('submit',{cancelable:true}));
assert.equal(state.calls.filter(c=>c[0]==='admin_update_activity').length,0);
assert.match(page.document.querySelector('#admin-message').textContent,/título es obligatorio/);
page.document.querySelector('[name="title"]').value='  Título corregido  ';
scenarioSelect.value='tecnologia';
page.document.querySelector('[name="speaker"]').value='';
page.document.querySelector('[name="start_time"]').value='';
page.document.querySelector('[name="end_time"]').value='';
page.document.querySelector('.admin-edit').dispatchEvent(new page.document.defaultView.Event('submit',{cancelable:true}));
for(let i=0;i<20;i++)await new Promise(setImmediate);
const update=state.calls.find(c=>c[0]==='admin_update_activity')[1];
assert.equal(update.p_title,'Título corregido');assert.equal(update.p_scenario,'tecnologia');assert.equal('p_slug' in update,false);
ok('editor permite título y escenario técnico, valida vacío y conserva slug readonly');
assert.equal(update.p_expected_updated_at,null);assert.equal(update.p_speaker,null);assert.equal(update.p_start_time,null);assert.equal(update.p_end_time,null);
assert.equal('updated_by' in update,false);assert.equal('p_updated_by' in update,false);
ok('edición envía horarios opcionales y versión NULL, sin identidad de auditoría');
state=backend();page=await load('login.html','login.js',state,'?next=admin');await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'admin.html');ok('login permite únicamente destino administrativo interno');
state=backend();state.activities=[{...openActivity,speaker:'Ponente actualizado',description:'Descripción actualizada',start_time:null,end_time:null}];
page=await load('index-impulso-uaemex-365.html','agenda-route.js',state);
assert.match(page.document.querySelector('#agendaList').textContent,/Ponente actualizado/);assert.match(page.document.querySelector('#agendaList').textContent,/Descripción actualizada/);assert.match(page.document.querySelector('#agendaList').textContent,/HORARIO POR CONFIRMAR/);ok('agenda dinámica refleja edición y permite open sin horas');
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(setImmediate);};
state=backend({user});
state.activities=[{...openActivity,id:'sport-draft',scenario:'deporte',status:'draft',title:'Borrador deporte',selected_count:0,updated_at:null}];
let scenarioDenied=false,assigned=true;
state.client.rpc=async(name,args)=>{
 state.calls.push([name,args]);
 if(name==='admin_get_access')return {data:'staff'};
 if(name==='admin_list_scenarios')return {data:assigned?[{scenario:'deporte',label:'Deporte',total_activities:1,open_count:0,draft_count:1,closed_count:0,cancelled_count:0}]:[]};
 if(name==='admin_list_activities')return scenarioDenied?{error:{message:'SCENARIO_ADMIN_REQUIRED'}}:{data:state.activities};
 if(name==='admin_get_activity')return {data:state.activities[0]};
 throw Error('RPC inesperada para staff: '+name);
};
page=await load('admin.html','admin.js',state);
assert.equal(page.document.querySelectorAll('.admin-scenario').length,1);
assert.match(page.document.querySelector('.admin-scenario').textContent,/Deporte/);
assert.equal(page.document.querySelector('[data-section="users"]').hidden,true);
assert.equal(state.calls.some(c=>c[0]==='admin_get_dashboard_stats'),false);ok('staff solo ve escenario asignado y no consulta datos globales');
page.document.querySelector('.admin-scenario button').click();await settle();
assert.match(page.document.querySelector('table').textContent,/Borrador deporte/);
assert.match(page.document.querySelector('.status-draft').textContent,/DRAFT/);ok('draft aparece en tabla con estado visible');
const statusFilter=page.document.querySelector('#admin-view select');statusFilter.value='open';statusFilter.dispatchEvent(new page.document.defaultView.Event('change'));assert.equal(page.document.querySelectorAll('tbody tr').length,0);
statusFilter.value='draft';statusFilter.dispatchEvent(new page.document.defaultView.Event('change'));assert.equal(page.document.querySelectorAll('tbody tr').length,1);ok('filtro de estados conserva borradores');
[...page.document.querySelectorAll('button')].find(b=>b.textContent==='VER / EDITAR').click();await settle();
assert.deepEqual([...page.document.querySelectorAll('[name="scenario"] option')].map(o=>o.value),['deporte']);
assert.equal(state.calls.some(c=>c[0]==='admin_get_activity_participants'),false);ok('editor staff ofrece solo destinos asignados y no consulta participantes');
[...page.document.querySelectorAll('button')].find(b=>b.textContent==='CANCELAR').click();await settle();
assert.equal(state.calls.filter(c=>c[0]==='admin_list_activities').at(-1)[1].p_scenario,'deporte');ok('cancelar vuelve al escenario de la actividad');
page.document.querySelector('[data-section="activities"]').click();await settle();scenarioDenied=true;
page.document.querySelector('.admin-scenario button').click();await settle();
assert.match(page.document.querySelector('#admin-message').textContent,/administrar este escenario/);assert.equal(page.document.querySelector('#admin-content').hidden,false);assert.equal(page.location.destination,undefined);ok('denegación de escenario muestra error sin cerrar sesión');
assigned=false;page.document.querySelector('[data-section="activities"]').click();await settle();assert.match(page.document.querySelector('#admin-view').textContent,/No tienes escenarios asignados/);ok('staff sin asignaciones tiene estado vacío');
console.log('TOTAL: '+passed+' comprobaciones de interfaz.');
