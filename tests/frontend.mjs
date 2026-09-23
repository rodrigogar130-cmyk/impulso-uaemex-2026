import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseHTML } from '../.test-runtime/node_modules/linkedom/esm/index.js';
import { PRIVACY_NOTICE_VERSION,hasCurrentPrivacyAcknowledgement } from '../js/privacy-notice.js';
const currentPrivacy={privacy_acknowledged_at:'2026-09-21T12:00:00Z',privacy_notice_version:PRIVACY_NOTICE_VERSION};
const root = process.cwd();
let passed = 0;
const ok = name => { passed++; console.log('PASS:', name); };
const user = { id: 'user-a', email: 'a@example.invalid', email_confirmed_at: '2026-09-17', user_metadata: { nombre:'Ana',apellidos:'Prueba',tipo_usuario:'Público general' } };
const event = { id: 'event-2026', slug:'impulso-uaemex-2026',status:'open' };
function backend(session = null, privacyCurrent = true) {
  const listeners = [];
  const state = {session, privacyCurrent, profiles:[], registrations:[], calls:[], listeners, activities:[], route:[]};
  state.authCalls={session:0,user:0};
  state.clientLoads=0;
  const emit = (type, value) => listeners.forEach(fn => fn(type, value));
  state.emit=(type,value)=>{state.session=value;if(state.privacySeedOnAuth&&value?.user.email_confirmed_at&&!state.profiles.some(p=>p.id===value.user.id))state.profiles.push({id:value.user.id,...user.user_metadata,...currentPrivacy});emit(type,value);};
  state.client = {
    async rpc(name,args) {
      state.calls.push(['rpc',name,args]);
      if(name==='acknowledge_privacy_notice'){
        const profile=state.profiles.find(p=>p.id===state.session?.user.id);
        if(!profile)return {error:{message:'PROFILE_REQUIRED'}};
        if(args.p_version!==PRIVACY_NOTICE_VERSION)return {error:{message:'INVALID_PRIVACY_NOTICE_VERSION'}};
        if(!hasCurrentPrivacyAcknowledgement(profile))Object.assign(profile,currentPrivacy);
        return {data:{id:profile.id,privacy_acknowledged_at:profile.privacy_acknowledged_at,privacy_notice_version:profile.privacy_notice_version}};
      }
      if(name==='list_impulso_activities')return {data:state.activities};
      if(name==='get_my_impulso_attendances')return {data:state.attendances||[]};
      if(name==='get_attendance_activity')return {data:state.activities.filter(a=>a.scenario===args.p_scenario&&a.slug===args.p_slug)};
      if(name==='get_my_passport_status'){const n=new Set((state.attendances||[]).map(a=>a.activity_id)).size;return {data:{attendance_count:n,badge_unlocked:n>=12}};}
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
      async getSession(){state.authCalls.session++;return {data:{session:state.session}};},
      async getUser(){state.authCalls.user++;return {data:{user:state.session?.user}};},
      onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
      async signUp(payload){state.calls.push(['signUp',payload]);return {data:{user,session:null}};},
      async signInWithPassword(payload){state.calls.push(['signIn',payload]);state.session={user};emit('SIGNED_IN',state.session);return {data:state.session};},
      async signInWithOAuth(payload){state.calls.push(['oauth',payload]);return {data:{provider:'google',url:'https://accounts.google.com/'}};},
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
          const authenticatedId=state.session?.user.id || user.id;
          if(table==='profiles' && list.some(row=>row.id===authenticatedId))return {error:{code:'23505'}};
          const row=table==='profiles'?{id:authenticatedId,privacy_acknowledged_at:null,privacy_notice_version:null,...(state.privacyCurrent?currentPrivacy:{}),...payload}:{id:'reg-a',user_id:authenticatedId,...payload,folio:'IMP-2026-000001',status:'confirmed',created_at:'2026-09-17T12:00:00Z'};
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
async function load(page, script, state, search='', options={}) {
  // Legacy feature regressions use already-acknowledged participants; privacy tests opt out.
  state.privacySeedOnAuth=state.privacyCurrent&&['index.html','admin.html'].includes(page);
  if(state.privacyCurrent){
    for(const profile of state.profiles)Object.assign(profile,currentPrivacy);
    if(['index.html','admin.html'].includes(page)&&state.session?.user.email_confirmed_at&&!state.profiles.some(p=>p.id===state.session.user.id))state.profiles.push({id:state.session.user.id,...user.user_metadata,...currentPrivacy});
  }
  const {document,Event} = parseHTML(fs.readFileSync(page,'utf8'));
  for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option[selected]')?.textContent ?? '';},set(v){for(const opt of this.querySelectorAll('option'))opt.toggleAttribute('selected',(opt.getAttribute('value')??opt.textContent)===v);}});
  const nativeCreate=document.createElement.bind(document);
  document.createElement=(name)=>{const el=nativeCreate(name);if(name==='select')Object.defineProperty(el,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? '';},set(v){for(const opt of this.querySelectorAll('option'))opt.toggleAttribute('selected',opt.getAttribute('value')===v);}});return el;};
  for(const form of document.querySelectorAll('form')){
    form.elements = Object.fromEntries([...form.querySelectorAll('[name]')].map(el=>[el.name,el]));
    form.reportValidity = () => true;
  }
  const pageUrl=new URL(page+search,options.baseUrl||'http://127.0.0.1:5500/');
  const location={href:pageUrl.href,pathname:pageUrl.pathname,search,hash:options.hash||'',replace(value){this.destination=value;},reload(){this.reloaded=true;}};
  const windowEvents=document.createElement('window-events');
  const testDate=options.clock?class extends Date{constructor(...args){super(...(args.length?args:[options.clock.now]));}static now(){return options.clock.now;}}:Date;
  const publicFetch=options.fetch||async function(url,init){
    if(url==='data/activities-public.json')throw Error('Snapshot unavailable in this failure fixture');
    assert.match(url,/\/rest\/v1\/rpc\/list_impulso_activities$/);
    assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');
    assert.ok(init.headers.apikey.startsWith('sb_publishable_'));
    assert.equal(init.headers.Authorization,'Bearer '+init.headers.apikey);assert.equal(init.headers.Accept,'application/json');assert.equal(init.body,'{}');
    const result=await state.client.rpc('list_impulso_activities');
    return {ok:!result.error,json:async()=>result.data};
  };
  const context = vm.createContext({fetch:publicFetch,AbortController,AbortSignal,Event,clearTimeout,setTimeout:options.setTimeout||setTimeout,localStorage:options.storage,sessionStorage:options.storage,TextEncoder,CustomEvent:document.defaultView.CustomEvent,document,location,window:{location,scrollY:0,addEventListener:windowEvents.addEventListener.bind(windowEvents),dispatchEvent:windowEvents.dispatchEvent.bind(windowEvents),matchMedia:options.matchMedia||(()=>({matches:false,addEventListener(){}}))},URL,URLSearchParams,console:options.console||console,Error,Date:testDate,FormData:class {
    constructor(form){this.values=new Map([...form.querySelectorAll('[name]')].filter(el=>!el.disabled).map(el=>[el.name,el.value]));}
    get(key){return this.values.get(key)??null;}
  }});
  const cache=new Map();
  function sourceModule(file) {
    file=file.split('?')[0];
    if(cache.has(file))return cache.get(file);
    let mod;
    if(file.endsWith('auth-turnstile.js')){
      mod = new vm.SyntheticModule(['getAuthCaptchaToken'],function(){this.setExport('getAuthCaptchaToken',async action=>{if(options.captchaError)throw Object.assign(new Error('captcha'),{code:'captcha_failed'});return 'test-captcha-'+action;});},{context,identifier:file});
    } else if(file.endsWith('supabase-client.js')){
      state.clientLoads++;
      mod = new vm.SyntheticModule(['client','supabase'],function(){this.setExport('client',()=>{if(options.sdkUnavailable)throw Error('SDK unavailable');return state.client;});this.setExport('supabase',options.sdkUnavailable?null:state.client);},{context,identifier:file});
    } else mod = new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,importModuleDynamically:async(specifier,parent)=>{
      const imported=await moduleFor(path.resolve(path.dirname(parent.identifier),specifier));
      if(imported.status==='linked')await imported.evaluate();
      return imported;
    }});
    cache.set(file,mod);
    return mod;
  }
  async function moduleFor(file) {
    const mod=sourceModule(file);
    if(mod.status==='unlinked')await mod.link((specifier,parent)=>sourceModule(path.resolve(path.dirname(parent.identifier),specifier)));
    return mod;
  }
  const modules=[];
  for(const name of Array.isArray(script)?script:[script])modules.push(await moduleFor(path.resolve('js',name)));
  await Promise.all(modules.map(mod=>mod.evaluate()));
  for(let i=0;i<12;i++)await new Promise(setImmediate);
  return {document,location,context,async submit(selector,values={}){
    const form=document.querySelector(selector);for(const [k,v]of Object.entries(values)){if(form.elements[k].type==='checkbox')form.elements[k].checked=Boolean(v);else form.elements[k].value=v;}
    form.dispatchEvent(new Event('submit',{cancelable:true}));
    for(let i=0;i<12;i++)await new Promise(setImmediate);
  },moduleFor};
}

let state=backend();let page=await load('registro.html','registro.js',state);
await page.submit('form',{privacy_acknowledged:true,nombre:'Ana',apellidos:'Prueba',tipo_usuario:'Público general',email:user.email,password:'password123',confirm_password:'different'});
assert.equal(state.calls.length,0);assert.match(page.document.querySelector('[data-message]').textContent,/no coinciden/);ok('contraseñas diferentes no envían solicitudes');
await page.submit('form',{confirm_password:'password123'});
assert.equal(state.calls[0][0],'signUp');assert.equal(state.registrations.length,0);assert.equal(page.document.querySelector('#signup-result').hidden,false);assert.match(page.document.querySelector('#signup-result').textContent,/Revisa tu correo/);ok('crear cuenta solicita confirmación y no registra al evento');

state=backend();page=await load('login.html','login.js',state);
await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'mi-cuenta.html');assert.equal(state.profiles.length,1);assert.equal(state.registrations.length,1);ok('login prepara perfil y folio antes de redirigir');
state=backend({user});page=await load('login.html','login.js',state,'?confirmed=1');assert.equal(state.session,null);assert.equal(page.location.destination,undefined);assert.equal(state.registrations.length,0);ok('confirmación no inscribe hasta iniciar sesión');

state=backend();page=await load('mi-cuenta.html','account.js',state);assert.equal(page.location.destination,'login.html');assert.equal(page.document.querySelector('[data-private]').hidden,true);ok('Mi cuenta sin sesión redirige sin mostrar contenido privado');
state=backend();page=await load('pasaporte.html','passport.js',state);assert.equal(page.location.destination,'login.html?next=passport');ok('pasaporte sin sesión redirige a login conservando destino');

state=backend({user});page=await load('mi-cuenta.html','account.js',state);
assert.equal(state.profiles.length,1);assert.equal(state.registrations.length,1);assert.equal(page.document.querySelector('#event-form'),null);assert.equal(page.document.querySelector('#folio').textContent,'IMP-2026-000001');ok('acceso confirmado crea perfil e inscripción automática');
const insertCount=state.calls.filter(c=>c[0]==='event_registrations' && c[1]==='insert').length;
page=await load('mi-cuenta.html','account.js',state);
assert.equal(state.registrations.length,1);assert.equal(state.calls.filter(c=>c[0]==='event_registrations' && c[1]==='insert').length,insertCount);assert.equal(page.document.querySelector('#folio').textContent,'IMP-2026-000001');ok('recarga conserva folio sin intentar otra inserción');
await page.submit('#profile-form',{nombre:'Ana editada'});assert.equal(state.profiles[0].nombre,'Ana editada');ok('perfil editable');
state.listeners.forEach(fn=>fn('SIGNED_IN',{user:{id:'user-b'}}));assert.equal(page.location.reloaded,true);assert.equal(page.document.querySelector('[data-private]').hidden,true);ok('cambio de usuario oculta datos anteriores');

page=await load('pasaporte.html','passport.js',state);assert.equal(page.document.querySelector('#passport-content').hidden,false);assert.equal(page.document.querySelector('[data-attendance-count]').textContent,'0');ok('pasaporte confirmado muestra asistencias reales');
state=backend({user});page=await load('pasaporte.html','passport.js',state);assert.equal(page.document.querySelector('#passport-content').hidden,false);assert.equal(state.registrations.length,1);ok('acceso directo al pasaporte garantiza inscripción automática');

state=backend();page=await load('recuperar-password.html','recovery.js',state);
await page.submit('#request-form',{email:user.email});assert.equal(state.calls[0][0],'reset');assert.match(state.calls[0][2].redirectTo,/recuperar-password.html\?mode=reset$/);ok('recuperación envía enlace con destino correcto');
state=backend({user});page=await load('recuperar-password.html','recovery.js',state,'?mode=reset');assert.equal(page.document.querySelector('#reset-form').hidden,false);
await page.submit('#reset-form',{password:'newpassword123',confirm_password:'newpassword123'});assert.equal(state.calls[0][0],'updatePassword');assert.equal(state.session,null);ok('recuperación guarda contraseña y cierra sesión');

state=backend();page=await load('index.html','navbar-auth.js',state);
assert.equal(page.document.querySelector('[data-auth-user]').hidden,true);
state.session={user};state.listeners.forEach(fn=>fn('SIGNED_IN',{user}));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(page.document.querySelector('[data-auth-guest]').hidden,true);assert.equal(page.document.querySelector('[data-auth-passport]').textContent,'Mi pasaporte');ok('navbar cambia según sesión');

const before=parseHTML(fs.readFileSync('backups/landing-antes-auth.html','utf8')).document;
const after=parseHTML(fs.readFileSync('index.html','utf8')).document;
for(const id of ['pasaporte','ponentes','mapa'])assert.equal(after.getElementById(id).outerHTML,before.getElementById(id).outerHTML);
// El rediseño aprobado de escenarios conserva descripciones, sedes y filtros, no su HTML anterior.
assert.equal(after.querySelectorAll('#escenarios .stage').length,7);
for(const old of before.querySelectorAll('#escenarios .stage')){
 const card=after.getElementById(old.id);
 assert.equal(card.querySelector('.stage-content p').textContent,old.querySelector('.stage-content p').textContent);
 assert.equal(card.querySelector('.venue-label').textContent,old.querySelector('.venue-label').textContent);
 assert.equal(card.querySelector('.stage-link').outerHTML,old.querySelector('.stage-link').outerHTML);
}
const preservedCatalog=JSON.parse(fs.readFileSync('data/activities-catalog.json','utf8'));
assert.equal(preservedCatalog.length,67);
assert.deepEqual(preservedCatalog.map(a=>a.title),[...before.querySelectorAll('.agenda-title strong')].map(x=>x.textContent));
assert.equal(after.querySelectorAll('.agenda-item').length,0);
ok('contenido público y las 67 actividades originales conservados');
for(const file of ['index.html','registro.html','login.html','mi-cuenta.html','pasaporte.html','recuperar-password.html']){
 const doc=parseHTML(fs.readFileSync(file,'utf8')).document;
 for(const el of doc.querySelectorAll('[src],[href]')){
  const value=el.getAttribute('src')||el.getAttribute('href');
  if(!value||/^(https?:|#|data:)/.test(value))continue;
  assert.ok(fs.existsSync(path.resolve(root,decodeURIComponent(value.split(/[?#]/)[0]))),`${file}: ${value}`);
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
state=backend({user});page=await load('login.html','login.js',state,'?confirmed=1');state.session={user};state.listeners.forEach(fn=>fn('SIGNED_IN',state.session));
const prep=await page.moduleFor(path.resolve('js/prepare-account.js'));
const results=await Promise.all([prep.namespace.prepareAccount(),prep.namespace.prepareAccount()]);assert.equal(state.registrations.length,1);assert.equal(results[0].registration.folio,results[1].registration.folio);ok('solicitudes simultáneas recuperan el mismo folio tras duplicado');
state.registrations[0].status='cancelled';page=await load('mi-cuenta.html','account.js',state);assert.equal(state.registrations.length,1);assert.equal(state.registrations[0].status,'cancelled');ok('registro cancelado no se duplica ni reactiva');
console.log('Total final: '+passed+' comprobaciones aprobadas.');

const signupValues={privacy_acknowledged:true,nombre:'Ana',apellidos:'Prueba',tipo_usuario:'Público general',email:user.email,password:'password123',confirm_password:'password123'};
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

for(const file of ['index.html','mi-cuenta.html','pasaporte.html','login.html','registro.html','recuperar-password.html']){
 state=backend({user});page=await load(file,'navbar-auth.js',state);
 assert.equal(page.document.querySelectorAll('#siteHeader').length,1);
 assert.equal(page.document.querySelectorAll('#mobileMenu').length,1);
 for(const id of ['evento','escenarios','ponentes','agenda','ubicacion']){
  const href='index.html#'+id;
  assert.ok(page.document.querySelector('.nav-links a[href="'+href+'"]'));
  assert.ok(after.getElementById(id));
 }
 assert.equal(page.document.querySelector('.nav-actions [data-auth-user]').hidden,false);
 const toggle=page.document.querySelector('#menuToggle');const menu=page.document.querySelector('#mobileMenu');
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(menu.hasAttribute('inert'),false);
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(menu.hasAttribute('inert'),true);
 ok(file+': header compartido, destinos y menú móvil');
}
state=backend({user});page=await load('index.html','navbar-auth.js',state);
assert.equal(page.document.querySelector('.hero [data-auth-guest]').hidden,true);
assert.equal(page.document.querySelector('.hero [data-auth-user]').hidden,false);
assert.match(page.document.querySelector('.hero [data-auth-user]').textContent,/MI CUENTA/);ok('HERO con sesión muestra Mi cuenta');
assert.ok(!/text-decoration\s*:\s*underline/.test(fs.readFileSync('css/site.css','utf8')+fs.readFileSync('css/account.css','utf8')+fs.readFileSync('index.html','utf8')));ok('sin reglas de subrayado');
console.log('Total navegación: '+passed+' comprobaciones aprobadas.');

state=backend({user});state.client.auth.getUser=async()=>({data:{user:null},error:{code:'user_not_found',status:403}});
page=await load('mi-cuenta.html','account.js',state);
assert.equal(state.session,null);assert.equal(page.location.destination,'login.html');assert.equal(page.document.querySelector('[data-private]').hidden,true);ok('usuario eliminado limpia sesión y bloquea acceso privado');
state=backend({user});state.client.auth.getUser=async()=>({data:{user:null},error:{status:503}});
page=await load('mi-cuenta.html','account.js',state);
assert.ok(state.session);assert.equal(state.calls.filter(c=>c[0]==='signOut').length,0);ok('fallo temporal no elimina sesión almacenada');

const initialActivity=JSON.parse(fs.readFileSync('data/activities-catalog.json','utf8'))[0];
const openActivity={...initialActivity,id:'activity-1',status:'open',timezone:'America/Mexico_City'};
state=backend();state.activities=[{...openActivity}];page=await load('index.html','agenda-route.js',state);
let card=page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]');
assert.doesNotMatch(card.textContent,/cupo|lugares disponibles|sin límite/i);assert.equal(card.querySelector('.route-controls button').textContent,'ASISTIR');
assert.doesNotMatch(card.textContent,/Consultando disponibilidad|Consultando cupo/);

assert.equal(state.calls.filter(c=>c[0]==='rpc'&&c[1]==='get_my_impulso_route').length,0);
card.querySelector('.route-controls > button').click();
assert.equal(page.location.href,'login.html?activity='+openActivity.slug);
assert.equal(state.route.length,0);
ok('cupo NULL seleccionable y acceso conserva actividad');
state=backend({user});state.activities=[{...openActivity}];page=await load('index.html','agenda-route.js',state);
card=page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]');card.querySelector('.route-controls > button').click();
for(let i=0;i<30;i++)await new Promise(setImmediate);
assert.equal(state.route[0].status,'registered');assert.match(card.textContent,/AGREGADA A TU RUTA/);assert.equal(card.querySelector('a[href^="https://calendar.google.com"]'),null);assert.match(card.textContent,/GOOGLE CALENDAR/);assert.match(card.textContent,/APPLE/);ok('selección sin hora final guarda ruta sin habilitar calendario');
card.querySelector('.route-controls > button').click();for(let i=0;i<30;i++)await new Promise(setImmediate);
assert.equal(state.route[0].status,'cancelled');ok('quitar selección actualiza disponibilidad');
state=backend();state.activities=[{...openActivity,}];page=await load('index.html','agenda-route.js',state);card=page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]');assert.doesNotMatch(card.textContent,/cupo|lugares disponibles|sin límite/i);assert.equal(card.querySelector('.route-controls button').textContent,'ASISTIR');ok('ningún contador ni capacidad antigua bloquea selección');
state=backend();state.activities=[{...openActivity,}];page=await load('index.html','agenda-route.js',state);assert.doesNotMatch(page.document.querySelector('[data-activity-slug="'+openActivity.slug+'"]').textContent,/cupo|lugares disponibles|sin límite|27 de 80/i);ok('no muestra disponibilidad numérica');
state=backend();page=await load('login.html','login.js',state,'?activity='+openActivity.slug);await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'index.html?activity='+openActivity.slug+'#arma-tu-ruta');ok('login regresa a actividad sin seleccionarla automáticamente');
state=backend();page=await load('registro.html','registro.js',state,'?activity='+openActivity.slug);await page.submit('form',signupValues);assert.match(state.calls[0][1].options.emailRedirectTo,/confirmed=1&activity=/);ok('confirmación conserva destino de actividad');
state=backend();page=await load('login.html','login.js',state,'?activity=https%3A%2F%2Fevil.example');await page.submit('form',{email:user.email,password:'password123'});assert.equal(page.location.destination,'mi-cuenta.html');ok('destinos externos rechazados');
state=backend({user});state.activities=[{...openActivity,end_time:'10:00:00'}];state.route=[{id:'r1',activity_id:'activity-1',status:'registered'}];page=await load('pasaporte.html','passport.js',state);assert.match(page.document.querySelector('[data-route-count]').textContent,/1 ACTIVIDADES/);assert.equal(page.document.querySelector('[data-attendance-count]').textContent,'0');assert.ok(page.document.querySelector('[data-route-list] a[href^="https://calendar.google.com"]'));ok('Mi ruta cuenta selecciones sin sumar asistencias y ofrece calendarios');
console.log('Total fase 2 frontend: '+passed+' comprobaciones aprobadas.');

page.document.querySelector('[data-export-route]').click();assert.equal(page.document.querySelector('[data-export-options]').hidden,false);assert.ok(page.document.querySelector('[data-export-options] a[href^="https://calendar.google.com"]'));assert.match(page.document.querySelector('[data-export-options] button').textContent,/APPLE/);ok('exportación completa muestra ICS y enlaces Google por actividad');
console.log('Total final: '+passed+' comprobaciones DOM.');

state=backend();const originalRpc=state.client.rpc;
state.client.rpc=async(name,args)=>{if(name==='list_impulso_activities')throw new Error('offline');return originalRpc(name,args);};
page=await load('index.html','agenda-route.js',state);
assert.equal(page.document.querySelector('#route-status').textContent,'');
assert.equal(page.document.querySelector('.route-controls button'),null);
assert.match(page.document.querySelector('#agendaList').textContent,/No pudimos cargar la agenda/);
assert.equal(state.calls.filter(c=>c[1]==='get_my_impulso_route').length,0);
ok('fallo inicial público no consulta datos privados ni inventa actividades');
state=backend({user});state.activities=[{...openActivity}];const signedRpc=state.client.rpc;
state.client.rpc=async(name,args)=>{if(name==='get_my_impulso_route')throw new Error('private failure');return signedRpc(name,args);};
page=await load('index.html','agenda-route.js',state);
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
page=await load('index.html','agenda-route.js',state);
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
// Execute the production filter handlers against the rendered public agenda.
state=backend();
state.activities=preservedCatalog.map((activity,index)=>({...activity,id:'filter-'+index,status:'open'}));
page=await load('index.html','agenda-route.js',state);
const agendaDocument=page.document;
await (await page.moduleFor(path.resolve('js/site-header.js'))).evaluate();
const agendaSearch=agendaDocument.getElementById('agendaSearch');
const agendaCards=[...agendaDocument.querySelectorAll('.agenda-item')];
assert.ok(agendaCards.length>12);
let agendaFocused=false,agendaScrolled=false;
agendaDocument.getElementById('agenda').focus=()=>{agendaFocused=true;};
agendaDocument.getElementById('agenda').getBoundingClientRect=()=>({top:300});
agendaDocument.getElementById('siteHeader').getBoundingClientRect=()=>({height:80});
page.context.requestAnimationFrame=callback=>callback();
page.context.prefersReducedMotion=true;
page.context.window.scrollTo=()=>{agendaScrolled=true;};
page.context.history={pushState(_state,_title,hash){page.location.hash=hash;}};
const landingSource=fs.readFileSync('index.html','utf8');
vm.runInContext(landingSource.slice(landingSource.indexOf('    let selectedDay ='),landingSource.indexOf('    /* Keep only one disclosure')),page.context);
agendaDocument.dispatchEvent(new agendaDocument.defaultView.CustomEvent('impulso:agenda-updated'));
const visibleCards=()=>agendaCards.filter(card=>!card.hidden);
const showAllPages=()=>{while(!agendaDocument.getElementById('agendaMore').hidden)agendaDocument.getElementById('agendaMore').click();};
const search=value=>{agendaSearch.value=value;agendaSearch.dispatchEvent(new agendaDocument.defaultView.Event('input'));};
assert.equal(page.location.destination,undefined);
assert.ok(agendaDocument.getElementById('ponentes'));
ok('visitante accede al inicio y Ponentes sin cuenta');
agendaDocument.querySelector('button[data-day="16"]').click();
agendaDocument.querySelector('button[data-stage="deporte"]').click();
const speakerLink=agendaDocument.querySelector('[data-agenda-query]');
speakerLink.click();
assert.equal(agendaSearch.value,speakerLink.dataset.agendaQuery);
assert.equal(agendaDocument.querySelector('button[data-stage="all"]').getAttribute('aria-pressed'),'true');
assert.equal(agendaDocument.querySelector('button[data-day="all"]').getAttribute('aria-pressed'),'true');
assert.ok(visibleCards().length>0);
assert.ok(visibleCards().every(card=>card.textContent.includes(speakerLink.dataset.agendaQuery)));
assert.equal(page.location.hash,'#agenda');assert.ok(agendaFocused && agendaScrolled);
ok('Ver actividad busca al ponente, limpia día y escenario y navega a #agenda');
search('');
assert.equal(visibleCards().length,12);
showAllPages();assert.equal(visibleCards().length,agendaCards.length);
ok('borrar ponente recupera todas las actividades y VER MÁS conserva paginación');
for(const link of agendaDocument.querySelectorAll('[data-agenda-stage]:not([data-agenda-query])')){
 search('búsqueda anterior');agendaDocument.querySelector('button[data-day="16"]').click();
 link.click();showAllPages();
 assert.equal(agendaSearch.value,'');
 assert.deepEqual(visibleCards(),agendaCards.filter(card=>card.dataset.stage===link.dataset.agendaStage));
}
ok('cada escenario limpia búsqueda y día y muestra únicamente sus actividades');
agendaDocument.querySelector('button[data-day="15"]').click();search(speakerLink.dataset.agendaQuery);
agendaDocument.getElementById('resetAgenda').click();
assert.equal(agendaSearch.value,'');
showAllPages();assert.equal(visibleCards().length,agendaCards.length);
ok('VER TODAS LAS ACTIVIDADES elimina todos los filtros');
agendaDocument.querySelector('button[data-day="15"]').click();
agendaDocument.querySelector('button[data-stage="cultura"]').click();showAllPages();
assert.deepEqual(visibleCards(),agendaCards.filter(card=>card.dataset.day==='15' && card.dataset.stage==='cultura'));
agendaDocument.getElementById('resetAgenda').click();search(speakerLink.dataset.agendaQuery);
assert.ok(visibleCards().length>0);
assert.ok(visibleCards().every(card=>card.textContent.includes(speakerLink.dataset.agendaQuery)));
ok('filtros manuales de día, escenario y búsqueda conservados');
// Performance regressions use event-driven modules and a controlled clock, not real services.
const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,10));await settle();};
const rpcCount=(state,name)=>state.calls.filter(call=>call[0]==='rpc'&&call[1]===name).length;
const fireWindow=(page,type)=>page.context.window.dispatchEvent(new page.document.defaultView.Event(type));
const fireVisible=page=>page.document.dispatchEvent(new page.document.defaultView.Event('visibilitychange'));
const clock={now:Date.now()};
state=backend();state.activities=[{...openActivity}];
const initialSessionRead=state.client.auth.getSession;
state.client.auth.getSession=async()=>{const result=await initialSessionRead();state.emit('INITIAL_SESSION',state.session);return result;};
page=await load('index.html',['navbar-auth.js','agenda-route.js'],state,'',{clock});
assert.equal(state.authCalls.session,1);assert.equal(state.authCalls.user,0);
assert.equal(rpcCount(state,'list_impulso_activities'),1);
assert.ok(page.document.querySelector('.agenda-item'));
ok('navbar y agenda concurrentes comparten sesión y hacen una sola carga pública sin getUser');
for(let i=0;i<10;i++){fireWindow(page,'focus');fireVisible(page);fireWindow(page,'hashchange');}
await flush();assert.equal(rpcCount(state,'list_impulso_activities'),1);
clock.now+=120001;fireWindow(page,'focus');fireVisible(page);fireWindow(page,'focus');
await flush();assert.equal(rpcCount(state,'list_impulso_activities'),2);
ok('focus y visibility comparten límite de dos minutos; navegar no consulta ni crea bucles');
fireWindow(page,'impulso-activities-changed');await flush();
assert.equal(rpcCount(state,'list_impulso_activities'),3);
const storageEvent=new page.document.defaultView.Event('storage');storageEvent.key='impulso-activities-changed';
page.context.window.dispatchEvent(storageEvent);await flush();
assert.equal(rpcCount(state,'list_impulso_activities'),4);
ok('cambios locales y de otra pestaña actualizan agenda sin esperar al throttle');
const publicRpc=state.client.rpc;
state.client.rpc=async(name,args)=>{if(name==='admin_get_access'){state.calls.push(['rpc',name,args]);return {data:'staff'};}return publicRpc(name,args);};
state.emit('SIGNED_IN',{user,access_token:'first'});await flush();
assert.equal(rpcCount(state,'list_impulso_activities'),5);
assert.equal(rpcCount(state,'get_my_impulso_route'),1);
assert.equal(page.document.querySelector('[data-auth-user]').hidden,false);
assert.equal(page.document.querySelector('[data-admin-link]').hidden,false);
for(let i=0;i<5;i++)state.emit('SIGNED_IN',{user,access_token:'first'});
state.emit('TOKEN_REFRESHED',{user,access_token:'second'});await flush();
assert.equal(rpcCount(state,'list_impulso_activities'),5);
assert.equal(rpcCount(state,'admin_get_access'),1);assert.equal(state.authCalls.user,0);
ok('auth repetida y renovación de token no recargan catálogo ni permiso administrativo de UI');
state.emit('SIGNED_OUT',null);await flush();
assert.equal(page.document.querySelector('[data-admin-link]').hidden,true);
assert.equal(page.document.querySelector('[data-auth-user]').hidden,true);
state.emit('SIGNED_IN',{user:{...user,id:'user-b'}});await flush();
assert.equal(rpcCount(state,'admin_get_access'),2);
state.emit('SIGNED_IN',{user});await flush();
assert.equal(rpcCount(state,'admin_get_access'),3);
ok('cerrar sesión y cambiar usuario invalidan permiso de UI y refrescan la agenda');
const sharedAuth=await page.moduleFor(path.resolve('js/auth.js'));
const verifiedBefore=state.authCalls.user;
await Promise.all([sharedAuth.namespace.getVerifiedSession(),sharedAuth.namespace.getVerifiedSession()]);
assert.equal(state.authCalls.user,verifiedBefore+1);
await sharedAuth.namespace.getVerifiedSession();assert.equal(state.authCalls.user,verifiedBefore+2);
ok('verificación privada comparte solicitudes simultáneas pero vuelve a verificar acciones posteriores');
const originalGetUser=state.client.auth.getUser;
state.client.auth.getUser=async()=>{
 state.emit('TOKEN_REFRESHED',{user,access_token:'renewed-during-verification'});
 return originalGetUser();
};
assert.equal((await sharedAuth.namespace.getVerifiedSession()).access_token,'renewed-during-verification');
let releaseVerification;
state.client.auth.getUser=()=>new Promise(resolve=>{releaseVerification=resolve;});
const oldVerification=sharedAuth.namespace.getVerifiedSession();await flush();
state.emit('SIGNED_IN',{user:{...user,id:'user-c'}});
releaseVerification({data:{user}});
assert.equal(await oldVerification,null);await flush();
ok('renovar token durante getUser conserva sesión; cambiar usuario invalida respuesta anterior');
const beforeLocalEvent=rpcCount(state,'list_impulso_activities');
page.document.dispatchEvent(new page.document.defaultView.Event('impulso-activities-changed'));await flush();
assert.equal(rpcCount(state,'list_impulso_activities'),beforeLocalEvent+1);
ok('evento local enviado en document también refresca agenda');

// Navbar permission TTL: role changes become visible without restarting the session.
{
 const cacheClock={now:Date.now()},cacheState=backend({user});
 let role=null,requests=0,activeRequests=0,maxRequests=0,releaseAccess=null,delayAccess=false;
 cacheState.client.rpc=async name=>{
  assert.equal(name,'admin_get_access');requests++;activeRequests++;maxRequests=Math.max(maxRequests,activeRequests);
  const result=role;
  if(delayAccess)await new Promise(resolve=>{releaseAccess=resolve;});
  activeRequests--;return {data:result};
 };
 const cachePage=await load('index.html','navbar-auth.js',cacheState,'',{clock:cacheClock});
 const links=()=>[...cachePage.document.querySelectorAll('[data-admin-link]')];
 assert.ok(links().every(link=>link.hidden));assert.equal(requests,1);
 role='staff';cacheClock.now+=119999;
 for(let i=0;i<5;i++){fireWindow(cachePage,'focus');fireVisible(cachePage);}
 await flush();assert.equal(requests,1);assert.ok(links().every(link=>link.hidden));
 cacheClock.now+=2;
 for(let i=0;i<5;i++){fireWindow(cachePage,'focus');fireVisible(cachePage);}
 await flush();assert.equal(requests,2);assert.ok(links().every(link=>!link.hidden));
 assert.equal(cacheState.authCalls.user,0);
 ok('navbar conserva permiso menos de dos minutos y detecta nuevo staff al volver sin getUser');
 role=null;cacheClock.now+=120001;
 Object.defineProperty(cachePage.document,'hidden',{configurable:true,value:true});fireVisible(cachePage);fireWindow(cachePage,'focus');
 await flush();assert.equal(requests,2);
 Object.defineProperty(cachePage.document,'hidden',{configurable:true,value:false});fireVisible(cachePage);await flush();
 assert.equal(requests,3);assert.ok(links().every(link=>link.hidden));
 ok('visibility solo refresca cuando la página es visible y oculta el enlace tras revocar permisos');
 role='staff';delayAccess=true;cacheClock.now+=120001;fireWindow(cachePage,'focus');await flush();
 assert.equal(requests,4);
 cacheClock.now+=120001;
 for(let i=0;i<10;i++){fireWindow(cachePage,'focus');fireVisible(cachePage);cacheState.emit('SIGNED_IN',{user});}
 await flush();assert.equal(requests,4);assert.equal(maxRequests,1);
 releaseAccess();await flush();
 fireWindow(cachePage,'focus');fireVisible(cachePage);await flush();assert.equal(requests,4);
 assert.ok(links().every(link=>!link.hidden));
 ok('caché vencida comparte consulta lenta y reinicia throttle al completarla');
 cacheClock.now+=120001;fireWindow(cachePage,'focus');await flush();assert.equal(requests,5);
 cacheState.emit('SIGNED_IN',{user:{...user,id:'cache-user-b'}});role=null;
 await flush();assert.equal(requests,5);assert.ok(links().every(link=>link.hidden));
 delayAccess=false;releaseAccess();await flush();
 assert.equal(requests,6);assert.equal(maxRequests,1);assert.ok(links().every(link=>link.hidden));
 cacheState.emit('SIGNED_OUT',null);fireWindow(cachePage,'focus');await flush();assert.equal(requests,6);
 role='staff';cacheState.emit('SIGNED_IN',{user:{...user,id:'cache-user-b'}});await flush();
 assert.equal(requests,7);assert.ok(links().every(link=>!link.hidden));
 ok('cambio de usuario descarta respuesta anterior sin consultas paralelas; logout invalida la caché');
}

// A late response from user A must not restore their private route after sign-out.
let resolveRoute;
state=backend({user});state.activities=[{...openActivity}];
page=await load('index.html','agenda-route.js',state,'',{clock});
const normalRpc=state.client.rpc;
state.client.rpc=async(name,args)=>name==='get_my_impulso_route'?new Promise(resolve=>{resolveRoute=resolve;}):normalRpc(name,args);
fireWindow(page,'impulso-activities-changed');await flush();assert.equal(typeof resolveRoute,'function');
state.emit('SIGNED_OUT',null);await flush();
resolveRoute({data:[{activity_id:openActivity.id,status:'registered'}]});await flush();
assert.equal(page.document.querySelector('.route-selected'),null);
assert.equal(page.document.querySelector('.route-controls button').textContent,'ASISTIR');
ok('respuestas privadas tardías no restauran ruta después de cerrar sesión');

// Repeated return events must not launch parallel catalog requests.
let releaseCatalog,concurrentCatalogs=0,maxConcurrentCatalogs=0;
const normalCatalogRpc=state.client.rpc;
state.client.rpc=async(name,args)=>{
 if(name!=='list_impulso_activities')return normalCatalogRpc(name,args);
 concurrentCatalogs++;maxConcurrentCatalogs=Math.max(maxConcurrentCatalogs,concurrentCatalogs);
 if(!releaseCatalog)await new Promise(resolve=>{releaseCatalog=resolve;});
 concurrentCatalogs--;return {data:[{...openActivity}]};
};
clock.now+=120001;fireWindow(page,'focus');await flush();
for(let i=0;i<10;i++){fireWindow(page,'focus');fireVisible(page);}
fireWindow(page,'impulso-activities-changed');fireWindow(page,'impulso-activities-changed');
releaseCatalog();await flush();assert.equal(maxConcurrentCatalogs,1);
assert.ok(page.document.querySelector('.agenda-item'));
ok('consultas lentas se serializan y agrupan cambios pendientes sin duplicar solicitudes en vuelo');

for(const [file,script] of [['mi-cuenta.html','account.js'],['pasaporte.html','passport.js']]){
 state=backend({user});page=await load(file,['navbar-auth.js',script],state);
 assert.equal(state.authCalls.session,1);assert.equal(state.authCalls.user,1);
 assert.equal(page.document.querySelector('[data-private]').hidden,false);
 ok(file+': usuario verificado una vez y navbar sin verificación adicional');
}
const routeClock={now:clock.now};
state=backend({user});state.activities=[{...openActivity}];
page=await load('pasaporte.html','passport.js',state,'',{clock:routeClock});
for(let i=0;i<5;i++){fireWindow(page,'focus');fireVisible(page);}
await flush();assert.equal(rpcCount(state,'get_my_impulso_route'),1);
routeClock.now+=120001;fireWindow(page,'focus');fireVisible(page);await flush();
assert.equal(rpcCount(state,'get_my_impulso_route'),2);
ok('Mi ruta elimina polling y agrupa focus/visibility sin repetir getUser');

state=backend({user});let accessChecks=0;
state.client.rpc=async(name)=>{
 if(name==='admin_get_access'){accessChecks++;return {data:'staff'};}
 if(name==='admin_list_scenarios')return {data:[]};
 throw Error('Unexpected '+name);
};
const adminClock={now:clock.now};page=await load('admin.html','admin.js',state,'',{clock:adminClock});
for(let i=0;i<5;i++){fireWindow(page,'focus');fireVisible(page);state.emit('SIGNED_IN',{user});}
await flush();assert.equal(accessChecks,1);assert.equal(state.authCalls.user,1);
adminClock.now+=120001;fireWindow(page,'focus');fireVisible(page);await flush();
assert.equal(accessChecks,2);assert.equal(state.authCalls.user,2);
state.emit('SIGNED_OUT',null);
assert.equal(page.document.querySelector('#admin-content').hidden,true);
assert.equal(page.location.destination,'login.html?next=admin');
ok('admin verifica remotamente al entrar y al regresar con throttle; logout bloquea inmediatamente');

assert.doesNotMatch(landingSource,/lenis|smoothScroller|gsap\.ticker/i);
for(const file of ['js/agenda-route.js','js/my-route.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/setInterval/);
ok('sin Lenis, ticker asociado ni polling de agenda/ruta');
const inlineScripts=[...parseHTML(landingSource).document.querySelectorAll('script:not([src])')].map(script=>script.textContent);
for(const source of inlineScripts)new vm.Script(source);
for(const file of fs.readdirSync('js').filter(file=>file.endsWith('.js')))new vm.SourceTextModule(fs.readFileSync(path.join('js',file),'utf8'));
ok('sintaxis válida de todos los módulos y scripts inline');

for(const mode of ['mobile','reduced','cdn-failure']){
 const legacyListeners=[];
 const matchMedia=query=>({matches:mode==='mobile'?query==='(any-pointer: coarse)':mode==='reduced'?query==='(prefers-reduced-motion: reduce)':query.includes('min-width: 821px'),addListener(listener){legacyListeners.push(listener);}});
 page=await load('index.html','site-header.js',backend(),'',{matchMedia});
 let intervals=0;
 page.context.setInterval=()=>{intervals++;return 1;};page.context.clearInterval=()=>{intervals=0;};
 page.context.requestAnimationFrame=callback=>callback();
 page.context.window.IntersectionObserver=function(){};
 const appended=[];const append=page.document.head.append.bind(page.document.head);
 page.document.head.append=script=>{appended.push(script.src);append(script);script.onerror();};
 for(const source of inlineScripts)vm.runInContext(source,page.context);
 await flush();
 assert.ok(legacyListeners.length>=3);
 assert.equal(appended.length,mode==='cdn-failure'?1:0);
 assert.notEqual(page.document.querySelector('.hero-title').style.opacity,'0');
 assert.ok(page.document.getElementById('agendaSearch'));
 page.document.querySelector('#menuToggle').click();assert.equal(page.document.querySelector('#mobileMenu').getAttribute('aria-hidden'),'false');
 legacyListeners[0]({matches:true});assert.equal(page.document.querySelector('#mobileMenu').getAttribute('aria-hidden'),'true');
 Object.defineProperty(page.document,'hidden',{configurable:true,value:true});fireVisible(page);assert.equal(intervals,0);
 ok(mode+': contenido visible, filtros disponibles, menú compatible con addListener y contador pausado al ocultar');
}
// Confirmation is deliberately passive until the user activates its button.
const sensitiveWrites=[];
const noSensitiveStorage={getItem(){return null;},setItem(...args){sensitiveWrites.push(args);},removeItem(){}};
const confirmHtml=parseHTML(fs.readFileSync('confirmar.html','utf8')).document;
const confirmScripts=[...confirmHtml.querySelectorAll('script[type="module"][src]')].map(script=>path.basename(script.getAttribute('src').split('?')[0]));
assert.deepEqual(confirmScripts,['site-header.js','confirm-email.js']);
assert.equal(confirmHtml.querySelector('meta[name="referrer"]').getAttribute('content'),'no-referrer');
assert.match(confirmHtml.querySelector('main .small').textContent,/Spam, Correo no deseado o Promociones/);
for(const el of confirmHtml.querySelectorAll('[src],[href]')){
 const href=el.getAttribute('src')||el.getAttribute('href');assert.ok(fs.existsSync(path.resolve(root,href.split('?')[0])));
}
ok('confirmación usa recursos existentes, nota de Spam y política no-referrer');

state=backend();let finishConfirmation;
state.client.auth.verifyOtp=payload=>{state.calls.push(['verifyOtp',payload]);return new Promise(resolve=>{finishConfirmation=resolve;});};
const redirectTimers=[];
page=await load('confirmar.html',confirmScripts,state,'?token_hash=test-token-only&type=email&next=https://example.invalid',{storage:noSensitiveStorage,setTimeout:(callback,ms)=>redirectTimers.push({callback,ms})});
const confirmationButton=page.document.getElementById('confirm-email');
assert.equal(confirmationButton.disabled,false);assert.equal(confirmationButton.type,'button');
fireWindow(page,'focus');fireVisible(page);await flush();
assert.equal(state.clientLoads,0);assert.equal(state.calls.length,0);assert.equal(redirectTimers.length,0);
ok('abrir, enfocar y recuperar visibilidad no inicializan Auth ni consumen token');
confirmationButton.click();confirmationButton.click();await flush();
assert.equal(state.clientLoads,1);assert.equal(state.calls.length,1);
assert.equal(state.calls[0][1].token_hash,'test-token-only');assert.equal(state.calls[0][1].type,'email');
assert.equal(confirmationButton.disabled,true);assert.equal(confirmationButton.textContent,'CONFIRMANDO...');
assert.equal(confirmationButton.getAttribute('aria-busy'),'true');
ok('clic explícito verifica una sola vez y bloquea doble clic durante la solicitud');
finishConfirmation({data:{session:{user}},error:null});await flush();
assert.equal(page.document.querySelector('[data-message]').textContent,'Correo confirmado correctamente.');
assert.equal(state.profiles.length,0);assert.equal(state.registrations.length,0);assert.equal(state.calls.length,1);
assert.equal(redirectTimers.length,1);assert.equal(page.location.destination,undefined);
confirmationButton.click();await flush();assert.equal(state.calls.length,1);
redirectTimers[0].callback();assert.equal(page.location.destination,'login.html?confirmed=1');
assert.equal(sensitiveWrites.length,0);
ok('éxito muestra aviso y reemplaza URL por login interno sin perfil, folio ni almacenamiento del token');
for(const query of ['', '?type=email', '?token_hash=&type=email', '?token_hash=test&type=recovery', '?token_hash=test&type=signup', '?token_hash=test', '?token_hash=test&type=email&type=recovery']){
 state=backend();page=await load('confirmar.html',confirmScripts,state,query,{storage:noSensitiveStorage});
 page.document.getElementById('confirm-email').click();fireWindow(page,'focus');fireVisible(page);await flush();
 assert.equal(state.clientLoads,0);assert.equal(state.calls.length,0);
 assert.equal(page.document.getElementById('confirm-email').hidden,true);
 assert.equal(page.document.getElementById('confirm-email').disabled,true);
 assert.equal(page.document.querySelector('[data-message]').textContent,'Este enlace de confirmación no es válido o está incompleto.');
 assert.equal(page.document.getElementById('confirmation-login').hidden,false);
}
ok('enlaces incompletos, vacíos o de otro tipo no hacen llamadas a Supabase');
for(const error of [{code:'otp_expired',status:403},{code:'access_denied',status:400},{status:422,message:'Token already used: test-token-only'}]){
 state=backend();state.client.auth.verifyOtp=async()=>({error});
 page=await load('confirmar.html',confirmScripts,state,'?token_hash=test-token-only&type=email',{storage:noSensitiveStorage});
 page.document.getElementById('confirm-email').click();await flush();
 assert.equal(page.document.querySelector('[data-message]').textContent,'Este enlace ya fue utilizado o ha expirado.');
 assert.equal(page.document.getElementById('confirmation-help').hidden,false);
 assert.equal(page.document.getElementById('confirmation-login').hidden,false);
 assert.equal(page.location.destination,undefined);assert.doesNotMatch(page.document.querySelector('main').textContent,/test-token-only|otp_expired|access_denied/);
}
ok('token expirado o utilizado muestra explicación neutral y acceso a login sin errores técnicos');
for(const error of [{status:503},{status:429},new Error('Failed to fetch')]){
 state=backend();let attempts=0;state.client.auth.verifyOtp=async()=>{attempts++;throw error;};
 page=await load('confirmar.html',confirmScripts,state,'?token_hash=test-token-only&type=email',{storage:noSensitiveStorage});
 const button=page.document.getElementById('confirm-email');button.click();await flush();
 assert.equal(button.disabled,false);assert.equal(button.hidden,false);
 assert.match(page.document.querySelector('[data-message]').textContent,/inténtalo de nuevo/);
 assert.doesNotMatch(page.document.querySelector('[data-message]').textContent,/Correo confirmado correctamente/);
 assert.equal(page.location.destination,undefined);button.click();await flush();assert.equal(attempts,2);
}
ok('fallos temporales de confirmación permiten reintentar solo mediante otro clic');
state=backend({user});page=await load('login.html','login.js',state,'?confirmed=1');
assert.equal(state.session,null);assert.equal(state.profiles.length,0);assert.equal(state.registrations.length,0);
await page.submit('form',{email:user.email,password:'password123'});
assert.equal(state.profiles.length,1);assert.equal(state.registrations.length,1);
assert.equal(page.location.destination,'mi-cuenta.html');
ok('login confirmado cierra la sesión de verificación; login explícito posterior crea perfil y folio');

state=backend();page=await load('registro.html','registro.js',state,'',{storage:noSensitiveStorage});
const passwordFields=[page.document.getElementById('signup-password'),page.document.getElementById('signup-confirm-password')];
const passwordButtons=[...page.document.querySelectorAll('[data-password-toggle]')];
assert.equal(passwordButtons.length,2);let accidentalSubmits=0;
page.document.querySelector('form').addEventListener('submit',()=>{accidentalSubmits++;});
for(const input of passwordFields){assert.equal(input.type,'password');input.value='Private-test-value-42!';}
for(let index=0;index<2;index++){
 const button=passwordButtons[index],input=passwordFields[index],other=passwordFields[1-index];
 assert.equal(button.type,'button');assert.equal(button.getAttribute('aria-label'),'Mostrar contraseña');
 assert.equal(button.getAttribute('aria-controls'),input.id);assert.equal(button.getAttribute('tabindex'),null);
 assert.ok(page.document.querySelector('label[for="'+input.id+'"]'));
 button.click();assert.equal(input.type,'text');assert.equal(other.type,'password');
 assert.equal(button.getAttribute('aria-label'),'Ocultar contraseña');assert.equal(input.value,'Private-test-value-42!');
 button.click();assert.equal(input.type,'password');assert.equal(button.getAttribute('aria-label'),'Mostrar contraseña');
 assert.equal(input.value,'Private-test-value-42!');
}
assert.equal(accidentalSubmits,0);assert.equal(state.calls.length,0);assert.equal(sensitiveWrites.length,0);
ok('botones nativos independientes alternan contraseña sin enviar, modificar valores ni guardar secretos');
await page.submit('form',signupValues);
const signupNotice=page.document.querySelector('#signup-result');
assert.equal(signupNotice.hidden,false);
assert.match(signupNotice.textContent,/Spam, Correo no deseado o Promociones/);
assert.match(signupNotice.textContent,/tardar unos minutos/);
assert.match(signupNotice.textContent,/El correo será enviado por IMPULSO UAEMéx 2026/);
assert.ok(signupNotice.querySelector('a[href="login.html"]'));assert.ok(signupNotice.querySelector('a[href="recuperar-password.html"]'));
assert.ok(parseHTML(fs.readFileSync('login.html','utf8')).document.getElementById('resend-form'));
ok('aviso de registro incluye Spam, demora y remitente; conserva login, recuperación y reenvío existente');
for(const error of [{status:500,message:'Error sending confirmation email'},{code:'over_email_send_rate_limit'},{code:'over_request_rate_limit'}]){
 state=backend();state.client.auth.signUp=async()=>({error});
 page=await load('registro.html','registro.js',state,'',{storage:noSensitiveStorage});await page.submit('form',signupValues);
 assert.equal(page.document.querySelector('form').hidden,false);assert.equal(page.document.querySelector('#signup-result').hidden,true);
 assert.equal(page.document.querySelector('button[type="submit"]').disabled,false);
 assert.doesNotMatch(page.document.querySelector('[data-message]').textContent,/te enviamos/i);
 assert.match(page.document.querySelector('[data-message]').textContent,/inténtalo|espera/i);
}
assert.equal(sensitiveWrites.length,0);
assert.doesNotMatch(fs.readFileSync('js/confirm-email.js','utf8'),/localStorage|sessionStorage|document\.cookie|console\./);
assert.doesNotMatch(fs.readFileSync('js/registro.js','utf8'),/localStorage|sessionStorage|document\.cookie|console\./);
ok('SMTP y rate limit mantienen formulario y reintento sin anunciar envío; tokens y contraseñas no se guardan');
// Google uses the same SDK/session and only an allowlisted local callback.
const oauthErrorText='No pudimos iniciar sesión con Google. Inténtalo nuevamente o utiliza tu correo y contraseña.';
const oauthBase='https://rodrigogar130-cmyk.github.io/impulso-uaemex-2026/';
const oauthStorageValues=new Map(),oauthWrites=[];
const oauthStorage={getItem:key=>oauthStorageValues.get(key)||null,setItem(key,value){oauthWrites.push([key,value]);oauthStorageValues.set(key,value);},removeItem:key=>oauthStorageValues.delete(key)};
for(const [file,script] of [['login.html','login.js'],['registro.html','registro.js']]){
 state=backend();page=await load(file,script,state,'?activity='+openActivity.slug+'&next=admin',{storage:oauthStorage,baseUrl:oauthBase});
 const googleButton=page.document.querySelector('[data-google-login]');
 assert.ok(googleButton);assert.equal(googleButton.type,'button');
 assert.match(googleButton.textContent,/CONTINUAR CON GOOGLE/);
 assert.ok(page.document.querySelector('form input[name="email"]'));assert.ok(page.document.querySelector('form input[type="password"]'));
 assert.ok(page.document.querySelector('.auth-divider'));
 let accidentalSubmit=0;page.document.querySelector('form').addEventListener('submit',()=>accidentalSubmit++);
 googleButton.click();googleButton.click();await flush();
 assert.equal(state.calls.length,1);assert.equal(state.calls[0][0],'oauth');assert.equal(accidentalSubmit,0);
 const payload=state.calls[0][1];assert.equal(payload.provider,'google');
 const redirect=new URL(payload.options.redirectTo);
 assert.equal(redirect.origin,new URL(oauthBase).origin);assert.equal(redirect.pathname,'/impulso-uaemex-2026/completar-registro.html');
 assert.equal(redirect.searchParams.get('activity'),openActivity.slug);assert.equal(redirect.searchParams.get('next'),'admin');
 assert.equal(payload.options.skipBrowserRedirect,undefined);
 assert.equal(googleButton.disabled,true);assert.match(googleButton.textContent,/CONECTANDO CON GOOGLE/);
 assert.equal(JSON.parse(oauthStorageValues.get('impulso-route-intent')).slug,openActivity.slug);
 const restore=new page.document.defaultView.Event('pageshow');restore.persisted=true;page.context.window.dispatchEvent(restore);
 assert.equal(googleButton.disabled,false);assert.match(googleButton.textContent,/CONTINUAR CON GOOGLE/);
 ok(file+': Google principal, doble clic bloqueado, retorno local con actividad/admin y botón recuperable al volver');
}
assert.ok(oauthWrites.every(([key,value])=>key==='impulso-route-intent'&&Object.keys(JSON.parse(value)).every(key=>['slug','section'].includes(key))));
ok('Google solo reutiliza el almacenamiento de intención de actividad; no guarda tokens ni redirects libres');
for(const query of ['?next=https://example.invalid&activity=https://example.invalid','?next=//example.invalid','?redirectTo=https://example.invalid']){
 state=backend();page=await load('login.html','login.js',state,query,{baseUrl:oauthBase});
 page.document.querySelector('[data-google-login]').click();await flush();
 assert.equal(state.calls[0][1].options.redirectTo,oauthBase+'completar-registro.html');
}
ok('redirectTo externo, next arbitrario y activity inválida no alteran el retorno OAuth');
for(const code of ['provider_disabled','access_denied','oauth_error']){
 state=backend();state.client.auth.signInWithOAuth=async()=>({error:{code,message:'Technical provider detail'}});
 page=await load('login.html','login.js',state);
 const button=page.document.querySelector('[data-google-login]');button.click();await flush();
 assert.equal(page.document.querySelector('[data-message]').textContent,oauthErrorText);assert.equal(button.disabled,false);
 assert.equal(page.document.querySelector('form').hidden,false);
}
ok('errores al iniciar Google muestran mensaje neutral y mantienen el método por correo');

const googleUser={id:'google-user-id',email:'google@example.invalid',email_confirmed_at:'2026-09-18',app_metadata:{provider:'google'},user_metadata:{given_name:'Ana María',family_name:'García López',full_name:'Ana María García López'}};
const completionScripts=['navbar-auth.js','completar-registro.js'];
const completeValues={privacy_acknowledged:true,nombre:'Ana editada',apellidos:'García editada',tipo_usuario:'Público general',telefono:'7221234567'};
state=backend({user:googleUser});
page=await load('completar-registro.html',completionScripts,state,'?activity='+openActivity.slug,{storage:noSensitiveStorage});
assert.equal(state.authCalls.session,1);assert.equal(state.authCalls.user,1);
assert.equal(page.document.querySelector('#completion-content').hidden,false);
assert.equal(page.document.querySelector('[name="nombre"]').value,'Ana María');assert.equal(page.document.querySelector('[name="apellidos"]').value,'García López');
assert.equal(page.document.querySelector('#completion-email').textContent,googleUser.email);
assert.equal(page.document.querySelector('[name="email"],input[type="password"],[name="confirm_password"]'),null);
assert.equal(state.profiles.length,0);assert.equal(state.registrations.length,0);
ok('nuevo usuario Google verifica sesión, muestra correo readonly y prellena nombres sin crear inscripción aún');
await page.submit('#completion-form',completeValues);
assert.equal(state.profiles.length,1);assert.equal(state.profiles[0].id,googleUser.id);
assert.equal(state.profiles[0].nombre,'Ana editada');assert.equal(state.profiles[0].apellidos,'García editada');
assert.equal(state.registrations.length,1);assert.equal(state.registrations[0].user_id,googleUser.id);assert.ok(state.registrations[0].folio);
assert.equal(page.location.destination,'index.html?activity='+openActivity.slug+'#arma-tu-ruta');
assert.equal(state.calls.some(call=>['signUp','resend','verifyOtp'].includes(call[0])),false);
assert.equal(sensitiveWrites.length,0);
ok('guardar Google usa id verificado, crea perfil/folio con helpers y vuelve a actividad sin correo SMTP');
const originalFolio=state.registrations[0].folio;
state.route=[{id:'preserved-route',activity_id:openActivity.id,status:'registered'}];
const insertsBefore=state.calls.filter(call=>call[1]==='insert').length;
page=await load('completar-registro.html','completar-registro.js',state);
assert.equal(page.document.querySelector('#completion-content').hidden,true);assert.equal(page.location.destination,'mi-cuenta.html');
assert.equal(state.profiles.length,1);assert.equal(state.registrations[0].folio,originalFolio);
assert.equal(state.calls.filter(call=>call[1]==='insert').length,insertsBefore);assert.equal(state.route[0].id,'preserved-route');
ok('perfil existente omite formulario, conserva folio y ruta y no duplica inserciones');
state.registrations[0].status='cancelled';
page=await load('completar-registro.html','completar-registro.js',state);
assert.equal(state.registrations[0].status,'cancelled');assert.equal(state.registrations[0].folio,originalFolio);
ok('OAuth no reactiva ni sustituye una inscripción cancelada existente');

for(const metadata of [{full_name:'Nombre Completo Sin Separar'},{name:'Nombre alternativo'}]){
 state=backend({user:{...googleUser,user_metadata:metadata}});page=await load('completar-registro.html','completar-registro.js',state);
 assert.equal(page.document.querySelector('[name="nombre"]').value,metadata.full_name||metadata.name);
 assert.equal(page.document.querySelector('[name="apellidos"]').value,'');
}
ok('full_name/name ayudan al prellenado sin inventar apellidos');
state=backend({user:googleUser});page=await load('completar-registro.html','completar-registro.js',state);
const studentType=page.document.querySelector('[name="tipo_usuario"]');
assert.deepEqual([...studentType.querySelectorAll('option')].map(option=>option.value||option.textContent).slice(1),['Estudiante','Docente','Administrativo','Investigador','Empresario','Público general']);
studentType.value='Estudiante';studentType.dispatchEvent(new page.document.defaultView.Event('change'));
assert.equal(page.document.querySelector('[data-student]').hidden,false);
assert.equal(page.document.querySelector('[name="numero_cuenta"]').required,true);assert.equal(page.document.querySelector('[name="espacio_academico"]').required,true);
await page.submit('#completion-form',{...completeValues,tipo_usuario:'Estudiante'});
assert.equal(state.profiles.length,0);assert.equal(state.registrations.length,0);
assert.match(page.document.querySelector('[data-message]').textContent,/número de cuenta y espacio académico/);
await page.submit('#completion-form',{numero_cuenta:'1234567',espacio_academico:'Ingeniería'});
assert.equal(state.profiles[0].numero_cuenta,'1234567');assert.equal(state.profiles[0].espacio_academico,'Ingeniería');
assert.equal(state.registrations.length,1);
ok('mismos tipos de usuario; estudiante exige cuenta y espacio antes de guardar');

state=backend({user:googleUser});state.profiles=[{id:googleUser.id,nombre:'Ana',apellidos:'',tipo_usuario:'Público general'}];
page=await load('completar-registro.html','completar-registro.js',state);
assert.equal(page.document.querySelector('#completion-content').hidden,false);
await page.submit('#completion-form',completeValues);
assert.equal(state.profiles.length,1);assert.equal(state.profiles[0].apellidos,'García editada');
assert.equal(state.calls.some(call=>call[0]==='profiles'&&call[1]==='update'),true);
ok('perfil incompleto se completa con saveProfile sin crear otro perfil');

for(const options of [{search:'?error=access_denied'}, {hash:'#error=access_denied&error_description=private-detail'}, {search:'?error_code=provider_disabled'}]){
 state=backend({user:googleUser});page=await load('completar-registro.html','completar-registro.js',state,options.search||'',options);
 assert.equal(page.document.querySelector('[data-message]').textContent,oauthErrorText);
 assert.equal(page.document.querySelector('#completion-content').hidden,true);assert.equal(state.calls.length,0);
 assert.equal(page.location.destination,undefined);
}
ok('cancelación y errores de callback muestran mensaje neutral y no preparan otra sesión existente');
for(const active of [null,{user:{...googleUser,email_confirmed_at:null}}]){
 state=backend(active);page=await load('completar-registro.html','completar-registro.js',state);
 assert.equal(page.document.querySelector('#completion-content').hidden,true);assert.equal(state.calls.length,0);
 assert.equal(page.document.querySelector('[data-message]').textContent,oauthErrorText);
}
state=backend({user:googleUser});state.client.auth.getUser=async()=>({error:{status:503}});
page=await load('completar-registro.html','completar-registro.js',state);
assert.equal(page.document.querySelector('#completion-content').hidden,true);assert.equal(state.calls.length,0);
assert.equal(page.document.querySelector('[data-message]').textContent,oauthErrorText);
ok('sesión ausente, no confirmada o sin verificación remota no puede crear perfil ni registro');
state=backend({user:googleUser});page=await load('completar-registro.html','completar-registro.js',state);
state.emit('SIGNED_IN',{user:{...googleUser,id:'different-google-id'}});
await page.submit('#completion-form',completeValues);
assert.equal(page.document.querySelector('#completion-content').hidden,true);assert.equal(state.profiles.length,0);assert.equal(state.registrations.length,0);
ok('cambiar de usuario mientras se completa el formulario bloquea el guardado anterior');

// Identity linking is owned by Supabase: the returned ID locates the existing profile.
state=backend({user:{...user,app_metadata:{provider:'google'},user_metadata:{given_name:'Otro nombre'}}});
state.profiles=[{id:user.id,nombre:'Nombre existente',apellidos:'Apellido existente',tipo_usuario:'Docente'}];
state.registrations=[{id:'reg-existing',user_id:user.id,event_id:event.id,status:'confirmed',folio:'IMP-2026-123456'}];
state.client.rpc=async name=>{state.calls.push(['admin',name]);if(name==='admin_get_access')return {data:'staff'};if(name==='admin_list_scenarios')return {data:[]};throw Error('Unexpected '+name);};
page=await load('completar-registro.html','completar-registro.js',state,'?next=admin');
assert.equal(page.location.destination,'admin.html');assert.equal(state.profiles[0].nombre,'Nombre existente');assert.equal(state.registrations[0].folio,'IMP-2026-123456');
assert.equal(state.calls.some(call=>call[1]==='insert'||call[1]==='update'),false);
page=await load('admin.html','admin.js',state);
assert.equal(page.document.querySelector('#admin-content').hidden,false);
assert.ok(state.calls.some(call=>call[0]==='admin'&&call[1]==='admin_get_access'));
assert.equal(page.document.querySelector('[data-section="users"]').hidden,true);
ok('identidad Google enlazada conserva perfil/folio y admin sigue comprobando rol staff mediante RPC');
state.client.rpc=async()=>({error:{message:'ADMIN_REQUIRED'}});
page=await load('admin.html','admin.js',state);assert.equal(page.document.querySelector('#admin-content').hidden,true);
ok('next=admin no concede acceso: backend puede denegar al usuario OAuth');
const newFrontend=['js/google-auth.js','js/completar-registro.js','js/auth.js','completar-registro.html','login.html','registro.html'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
assert.doesNotMatch(newFrontend,/client_secret|[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com|window\.open\s*\(|localStorage\.setItem|sessionStorage\.setItem|document\.cookie\s*=/i);
assert.doesNotMatch(fs.readFileSync('js/completar-registro.js','utf8'),/resendConfirmation|signUp\(|confirmar\.html|console\./);
ok('sin secretos, OAuth Client ID, popup, almacenamiento manual de tokens ni confirmación SMTP para Google');
// Public catalog is independent of SDK loading, session storage and private RPCs.
function mountAgendaFilters(target){
 target.context.requestAnimationFrame=callback=>callback();
 target.context.prefersReducedMotion=true;
 vm.runInContext(landingSource.slice(landingSource.indexOf('    let selectedDay ='),landingSource.indexOf('    /* Keep only one disclosure')),target.context);
}

const public55=Array.from({length:55},(_,i)=>({...openActivity,id:'public-'+i,slug:'public-'+i,title:'Actividad '+i}));
for(const failure of ['no-session','sdk-unavailable','auth-error','auth-pending','route-pending']){
 const isolated=backend(failure==='route-pending'?{user}:null);
 isolated.activities=[...public55,...Array.from({length:12},(_,i)=>({...openActivity,id:'draft-'+i,slug:'draft-'+i,status:'draft'}))];
 if(failure==='auth-error')isolated.client.auth.getSession=async()=>{throw Error('Auth offline');};
 if(failure==='auth-pending')isolated.client.auth.getSession=()=>new Promise(()=>{});
 if(failure==='route-pending'){
  const rpc=isolated.client.rpc;
  isolated.client.rpc=(name,args)=>name==='get_my_impulso_route'?new Promise(()=>{}):rpc(name,args);
 }
 const isolatedPage=await load('index.html','agenda-route.js',isolated,'',{sdkUnavailable:failure==='sdk-unavailable',storage:{getItem(){throw Error('Storage unavailable');}}});
 mountAgendaFilters(isolatedPage);
 assert.equal(isolatedPage.document.querySelectorAll('.agenda-item').length,55);
 assert.match(isolatedPage.document.querySelector('#agendaResults').textContent,/de 55 actividades/);
 assert.equal(isolatedPage.document.querySelector('#agendaEmpty').hidden,true);
 while(!isolatedPage.document.querySelector('#agendaMore').hidden)isolatedPage.document.querySelector('#agendaMore').click();
 assert.equal([...isolatedPage.document.querySelectorAll('.agenda-item')].filter(card=>!card.hidden).length,55);
 assert.equal(isolated.authCalls.user,0);
 ok(failure+': 55 open renderizadas sin borradores, sin getUser ni depender del almacenamiento');
}
{
 const isolated=backend();let release,requests=0,fail=false;
 const diagnostics=[];
 const isolatedPage=await load('index.html','site-header.js',isolated,'',{
  console:{...console,error(...args){diagnostics.push(args);}},
  fetch:async(url)=>{if(url==='data/activities-public.json')throw Error('Snapshot offline');requests++;await new Promise(resolve=>{release=resolve;});if(fail)throw Error('private diagnostic must not leak');return {ok:true,json:async()=>public55};}
 });
 mountAgendaFilters(isolatedPage);
 const agendaModule=await isolatedPage.moduleFor(path.resolve('js/agenda-route.js'));
 const first=agendaModule.evaluate();await flush();
 assert.match(isolatedPage.document.querySelector('#agendaList').textContent,/Cargando actividades/);
 assert.equal(isolatedPage.document.querySelector('#agendaList').getAttribute('aria-busy'),'true');
 assert.equal(isolatedPage.document.querySelector('#agendaResults').textContent,'Cargando actividades…');
 assert.equal(isolatedPage.document.querySelector('#agendaEmpty').hidden,true);
 ok('carga inicial pendiente muestra Cargando actividades y nunca 0 ni ausencia de coincidencias');
 fail=true;release();await first;await flush();
 assert.match(isolatedPage.document.querySelector('#agendaList').textContent,/No pudimos cargar la agenda en este momento/);
 assert.equal(isolatedPage.document.querySelector('#agendaResults').textContent,'No pudimos cargar la agenda en este momento.');
 assert.equal(isolatedPage.document.querySelector('#agendaEmpty').hidden,true);
 assert.deepEqual(diagnostics,[['Agenda public catalog load failed']]);
 const retry=isolatedPage.document.querySelector('#agendaList button');assert.equal(retry.type,'button');
 fail=false;retry.click();await flush();assert.equal(requests,2);
 release();await flush();
 assert.equal(isolatedPage.document.querySelectorAll('.agenda-item').length,55);
 assert.equal(isolatedPage.document.querySelector('#agendaList').dataset.catalogState,'loaded');
 ok('error inicial ofrece reintentar, diagnóstico sin datos sensibles y segundo intento recupera 55 actividades');
 const input=isolatedPage.document.querySelector('#agendaSearch');input.value='Actividad 2';input.dispatchEvent(new isolatedPage.document.defaultView.Event('input'));
 const previousResults=isolatedPage.document.querySelector('#agendaResults').textContent;
 const previousCards=[...isolatedPage.document.querySelectorAll('.agenda-item')];
 fail=true;fireWindow(isolatedPage,'impulso-activities-changed');await flush();release();await flush();
 assert.equal(isolatedPage.document.querySelector('#agendaList').dataset.catalogState,'error');
 assert.deepEqual([...isolatedPage.document.querySelectorAll('.agenda-item')],previousCards);
 assert.equal(isolatedPage.document.querySelector('#agendaResults').textContent,previousResults);
 assert.equal(input.value,'Actividad 2');
 assert.match(isolatedPage.document.querySelector('#catalog-status').textContent,/última información cargada/);
 input.value='';input.dispatchEvent(new isolatedPage.document.defaultView.Event('input'));
 assert.match(isolatedPage.document.querySelector('#agendaResults').textContent,/de 55 actividades/);
 ok('refresh fallido conserva las mismas tarjetas y filtros; limpiar búsqueda recupera catálogo completo');
 fail=false;isolatedPage.document.querySelector('#catalog-status button').click();await flush();release();await flush();
 assert.equal(isolatedPage.document.querySelector('#catalog-status').textContent,'');
 ok('reintentar actualización conserva catálogo y elimina el aviso al recuperarse');
}
for(const result of ['empty','http-error','invalid-json','invalid-shape']){
 const isolatedPage=await load('index.html','agenda-route.js',backend(),'',{console:{...console,error(){}},fetch:async()=>({ok:result!=='http-error',json:async()=>{if(result==='invalid-json')throw Error('invalid JSON');return result==='invalid-shape'?null:[];}})});
 mountAgendaFilters(isolatedPage);
 const isEmpty=result==='empty';
 assert.equal(isolatedPage.document.querySelector('#agendaList').dataset.catalogState,isEmpty?'loaded':'error');
 assert.equal(isolatedPage.document.querySelector('#agendaEmpty').hidden,!isEmpty);
 assert.equal(isolatedPage.document.querySelector('#agendaResults').textContent,isEmpty?'Mostrando 0 de 0 actividades':'No pudimos cargar la agenda en este momento.');
 ok(result+': únicamente una respuesta válida vacía muestra 0 actividades');
}
{
 let abort;
 const isolatedPage=await load('index.html','agenda-route.js',backend(),'',{
  console:{...console,error(){}},
  setTimeout(callback,delay){if(delay===15000){abort=callback;return setTimeout(callback,0);}return setTimeout(callback,delay);},
  fetch:async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timeout'))))
 });
 assert.equal(typeof abort,'function');
 assert.equal(isolatedPage.document.querySelector('#agendaList').dataset.catalogState,'error');
 assert.ok(isolatedPage.document.querySelector('#agendaList button'));
 ok('solicitud pública sin respuesta vence y ofrece reintento sin polling');
}
{
 const crypto=await import('node:crypto');
 const bundle=fs.readFileSync('vendor/supabase-js-2.57.4/supabase.js','utf8');
 assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'),'7e94b62086deecef8c0ba3b38f514e2a1944ff6c81d92fb3ff967828c406c38f');
 const sdkContext=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Headers,Request,Response,setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},fetch(){throw Error('Unexpected SDK network request');}});
 sdkContext.self=sdkContext;
 assert.equal(sdkContext.supabase,undefined);
 new vm.Script(bundle).runInContext(sdkContext);
 assert.equal(typeof sdkContext.supabase.createClient,'function');
 const sdkFactory=sdkContext.supabase.createClient,clientOptions=[];
 sdkContext.supabase={...sdkContext.supabase,createClient(...args){clientOptions.push(args[2]);return sdkFactory(...args);}};
 const config=new vm.SyntheticModule(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'],function(){this.setExport('SUPABASE_URL','https://example.invalid');this.setExport('SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');},{context:sdkContext});
 const clientSource=fs.readFileSync('js/supabase-client.js','utf8');
 assert.doesNotMatch(clientSource,/esm\.sh|https:\/\/.*supabase-js/);
 assert.doesNotMatch(clientSource,/import\s*\(/);
 const actualClient=new vm.SourceTextModule(clientSource,{context:sdkContext});
 await actualClient.link(()=>config);await actualClient.evaluate();
 assert.ok(actualClient.namespace.supabase);
 assert.equal(actualClient.namespace.client(),actualClient.namespace.supabase);
 assert.equal(actualClient.namespace.client(),actualClient.namespace.client());
 assert.equal(actualClient.namespace.supabase.auth.flowType,'implicit');
 assert.equal(clientOptions.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(clientOptions[0])),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
 for(const method of ['signInWithOAuth','signInWithPassword','signUp','verifyOtp'])assert.equal(typeof actualClient.namespace.supabase.auth[method],'function');
 ok('bundle oficial íntegro ejecutado como script clásico antes del cliente: instancia compartida, implicit y APIs Auth disponibles');
}
const snapshot=JSON.parse(fs.readFileSync('data/activities-public.json','utf8'));
const publicFields=['id','title','slug','description','scenario','speaker','activity_date','start_time','end_time','timezone','location','status'];
assert.equal(snapshot.length,55);assert.equal(new Set(snapshot.map(a=>a.id)).size,55);
for(const activity of snapshot){assert.equal(activity.status,'open');assert.deepEqual(Object.keys(activity),publicFields);}
ok('snapshot contiene 55 actividades open con identificadores únicos y exclusivamente los campos públicos solicitados');
for(const mode of ['network','cors-safari','timeout','http-401','http-500','bad-json','bad-shape']){
 const logs=[],requests=[];
 const isolated=backend();
 const isolatedPage=await load('index.html','agenda-route.js',isolated,'',{
  console:{...console,error(...args){logs.push(args);}},
  matchMedia:()=>({matches:true,addListener(){}}),
  setTimeout(callback,delay){return setTimeout(callback,delay===15000?0:delay);},
  fetch:async(url,init)=>{
   requests.push(url);
   if(url==='data/activities-public.json'){
    assert.equal(init.credentials,'omit');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers.apikey,undefined);
    return {ok:true,json:async()=>snapshot};
   }
   assert.equal(init.headers.Authorization,'Bearer '+init.headers.apikey);
   assert.equal(init.headers['Content-Type'],'application/json');assert.equal(init.headers.Accept,'application/json');
   assert.equal(init.credentials,'omit');
   if(mode==='timeout')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timeout'))));
   if(mode.startsWith('http-'))return {ok:false,status:Number(mode.slice(5))};
   if(mode==='bad-json')return {ok:true,json:async()=>{throw Error('JSON');}};
   if(mode==='bad-shape')return {ok:true,json:async()=>({error:'unexpected'})};
   throw new TypeError('Failed to fetch');
  }
 });
 // No synthetic agenda-updated event: the real load finished BEFORE filters initialized.
 mountAgendaFilters(isolatedPage);
 assert.equal(requests.length,2);assert.equal(requests[1],'data/activities-public.json');
 assert.equal(isolatedPage.document.querySelectorAll('.agenda-item').length,55);
 assert.match(isolatedPage.document.querySelector('#agendaResults').textContent,/de 55 actividades/);
 assert.equal(isolatedPage.document.querySelector('#agendaEmpty').hidden,true);
 assert.equal(isolatedPage.document.querySelector('#catalog-status').textContent,'Mostramos la última versión disponible de la agenda.');
 if(mode.startsWith('http-'))assert.deepEqual(logs,[['Agenda public catalog load failed',Number(mode.slice(5))]]);
 else assert.deepEqual(logs,[]);
 const input=isolatedPage.document.querySelector('#agendaSearch');input.value='no-match-snapshot';input.dispatchEvent(new isolatedPage.document.defaultView.Event('input'));
 assert.equal(isolatedPage.document.querySelector('#agendaEmpty').hidden,false);
 isolatedPage.document.querySelector('#resetAgenda').click();
 while(!isolatedPage.document.querySelector('#agendaMore').hidden)isolatedPage.document.querySelector('#agendaMore').click();
 assert.equal([...isolatedPage.document.querySelectorAll('.agenda-item')].filter(card=>!card.hidden).length,55);
 ok(mode+': fallback real, aviso discreto, filtros/reset y primer evento recuperado sin depender del orden de carga');
}
{
 const isolated=backend({user});let offline=false,snapshotRequests=0;
 const isolatedPage=await load('index.html','agenda-route.js',isolated,'',{
  fetch:async(url)=>{if(url==='data/activities-public.json'){snapshotRequests++;return {ok:true,json:async()=>snapshot};}if(offline)throw Error('offline');return {ok:true,json:async()=>public55};}
 });
 mountAgendaFilters(isolatedPage);
 const initial=[...isolatedPage.document.querySelectorAll('.agenda-item')];
 offline=true;fireWindow(isolatedPage,'impulso-activities-changed');await flush();
 assert.equal(snapshotRequests,1);assert.deepEqual([...isolatedPage.document.querySelectorAll('.agenda-item')],initial);
 assert.match(isolatedPage.document.querySelector('#catalog-status').textContent,/última versión disponible/);
 isolated.emit('SIGNED_OUT',null);await flush();
 isolated.emit('SIGNED_IN',{user});await flush();
 assert.deepEqual([...isolatedPage.document.querySelectorAll('.agenda-item')],initial);
 assert.equal(isolatedPage.document.querySelectorAll('.agenda-item').length,55);
 ok('snapshot no sustituye catálogo en memoria más reciente; entrar/salir de sesión no cambia actividades públicas');
}
{
 let requests=0;
 const isolatedPage=await load('index.html','agenda-route.js',backend(),'',{fetch:async()=>{requests++;return {ok:true,json:async()=>[]};}});
 mountAgendaFilters(isolatedPage);assert.equal(requests,1);
 assert.equal(isolatedPage.document.querySelector('#agendaResults').textContent,'Mostrando 0 de 0 actividades');
 ok('RPC con [] válido no solicita snapshot ni inventa actividades');
}
const authPages=['index.html','login.html','registro.html','completar-registro.html','mi-cuenta.html','pasaporte.html','admin.html','recuperar-password.html','confirmar.html'];
for(const file of authPages){
 const html=fs.readFileSync(file,'utf8'),doc=parseHTML(html).document;
 const scripts=[...doc.querySelectorAll('script')];
 const bundle=scripts.filter(script=>script.getAttribute('src')==='vendor/supabase-js-2.57.4/supabase.js?v=20260921-4');
 assert.equal(bundle.length,1);assert.equal(bundle[0].hasAttribute('type'),false);
 assert.equal(bundle[0].hasAttribute('async'),false);assert.equal(bundle[0].hasAttribute('defer'),false);
 for(const mod of scripts.filter(script=>script.getAttribute('type')==='module')){
  assert.ok(scripts.indexOf(bundle[0])<scripts.indexOf(mod));
  assert.match(mod.getAttribute('src'),/\?v=20260921-4$/);
 }
 assert.doesNotMatch(html,/esm\.sh/);
 ok(file+': UMD clásico único antes de todos los módulos, sin async/defer y con versión coherente');
}
for(const name of fs.readdirSync('js').filter(name=>name.endsWith('.js'))){
 const source=fs.readFileSync('js/'+name,'utf8');
 assert.doesNotMatch(source,/esm\.sh/);
 for(const match of source.matchAll(/['"](\.\/[^'" ]+\.js(?:\?[^'"]*)?)['"]/g)){
  assert.ok(match[1].endsWith('?v=20260921-4'),name+': '+match[1]);
  assert.ok(fs.existsSync(path.resolve('js',match[1].split('?')[0])));
 }
}
ok('todos los imports locales comparten versión, existen y no dependen de esm.sh');
for(const sdkMode of ['missing','invalid','throws']){
 const context=vm.createContext({});
 if(sdkMode==='invalid')context.supabase={};
 if(sdkMode==='throws')context.supabase={createClient(){throw Error('SDK initialization failed');}};
 const config=new vm.SyntheticModule(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'],function(){this.setExport('SUPABASE_URL','https://example.invalid');this.setExport('SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');},{context});
 const mod=new vm.SourceTextModule(fs.readFileSync('js/supabase-client.js','utf8'),{context});
 await mod.link(()=>config);await mod.evaluate();
 assert.equal(mod.namespace.supabase,null);assert.ok(mod.namespace.connectionError);
 assert.throws(()=>mod.namespace.client());
 ok(sdkMode+': importación del cliente no lanza; servicio ausente informa connectionError');
}
// Creation/deletion UI exercises real handlers; permissions are also tested in PostgreSQL.
for(const role of ['super_admin','staff']){
 const adminState=backend({user}),writes=[];
 let denyCreate=false,delayCreate=false,releaseCreate;
 const scenarios=(role==='super_admin'?['cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar']:['deporte']).map(scenario=>({scenario,label:scenario,total_activities:0,open_count:0,draft_count:0,closed_count:0,cancelled_count:0}));
 const profileRead=adminState.client.from;
 adminState.client.from=table=>{assert.equal(table,'profiles');const query=profileRead(table);query.insert=query.update=()=>{throw Error('No direct table writes allowed');};return query;};
 adminState.client.rpc=async(name,args)=>{
  adminState.calls.push([name,args]);
  if(name==='admin_get_access')return {data:role};
  if(name==='admin_get_dashboard_stats')return {data:{users:0,routes:0,selections:0,activities:0,attendance:0}};
  if(name==='admin_list_scenarios')return {data:scenarios};
  if(name==='admin_list_activities')return {data:adminState.activities.filter(a=>a.scenario===args.p_scenario)};
  if(name==='admin_get_activity')return {data:adminState.activities.find(a=>a.id===args.p_activity_id)};
  if(name==='admin_get_activity_participants')return {data:{rows:[],total:0}};
  if(name==='list_impulso_activities')return {data:adminState.activities.filter(a=>a.status==='open')};
  if(name==='get_my_impulso_route')return {data:[]};
  if(name==='admin_create_activity'){
   if(denyCreate)return {error:{message:'SCENARIO_ADMIN_REQUIRED'}};
   if(delayCreate)await new Promise(resolve=>{releaseCreate=resolve;});
   const activity={id:'created-'+adminState.activities.length,slug:'slug-generated-'+adminState.activities.length,selected_count:0,updated_at:'2026-09-21T12:00:00Z'};
   for(const [key,val] of Object.entries(args))activity[key.slice(2)]=val;
   adminState.activities.push(activity);return {data:activity};
  }
  if(name==='admin_update_activity'){
   const activity=adminState.activities.find(a=>a.id===args.p_activity_id);
   for(const [key,val] of Object.entries(args))if(!['p_activity_id','p_expected_updated_at'].includes(key))activity[key.slice(2)]=val;
   return {data:activity};
  }
  if(name==='admin_delete_activity'){
   const activity=adminState.activities.find(a=>a.id===args.p_activity_id);
   if(activity.selected_count)return {error:{message:'ACTIVITY_HAS_REGISTRATIONS'}};
   adminState.activities=adminState.activities.filter(a=>a.id!==activity.id);return {data:{id:activity.id,deleted:true}};
  }
  throw Error(name);
 };
 const adminPage=await load('admin.html','admin.js',adminState,'',{storage:{setItem(...args){writes.push(args);}}});
 const findButton=label=>[...adminPage.document.querySelectorAll('#admin-view button')].find(b=>b.textContent===label);
 const click=async label=>{assert.ok(findButton(label),label);findButton(label).click();await flush();};
 const submit=async values=>{
  for(const [key,val] of Object.entries(values))adminPage.document.querySelector('[name="'+key+'"]').value=val;
  adminPage.document.querySelector('.admin-edit').dispatchEvent(new adminPage.document.defaultView.Event('submit',{cancelable:true}));await flush();
 };
 if(role==='super_admin'){adminPage.document.querySelector('[data-section="activities"]').click();await flush();}
 await click('+ NUEVA ACTIVIDAD');
 assert.equal(adminPage.document.querySelector('[name="status"]').value,'draft');
 assert.equal(adminPage.document.querySelector('[name="slug"]'),null);
 assert.deepEqual([...adminPage.document.querySelectorAll('[name="scenario"] option')].map(o=>o.value),scenarios.map(s=>s.scenario));
 assert.equal(findButton('ELIMINAR ACTIVIDAD'),undefined);
 await submit({title:'   '});assert.equal(adminState.activities.length,0);
 await submit({title:'Nueva actividad',status:'open',activity_date:''});assert.equal(adminState.activities.length,0);
 await submit({status:'draft',start_time:'12:00',end_time:'11:00'});assert.equal(adminState.activities.length,0);
 assert.equal(adminState.calls.filter(c=>c[0]==='admin_create_activity').length,0);
 delayCreate=true;
 await submit({start_time:'',end_time:''});await submit({});
 assert.equal(adminState.calls.filter(c=>c[0]==='admin_create_activity').length,1);
 releaseCreate();await flush();delayCreate=false;
 assert.equal(adminState.activities.length,1);
 assert.equal(adminState.activities[0].status,'draft');
 const createArgs=adminState.calls.find(c=>c[0]==='admin_create_activity')[1];
 for(const field of ['p_slug','p_event_id','p_updated_by','p_activity_id','p_expected_updated_at'])assert.equal(field in createArgs,false);
 assert.equal(adminPage.document.querySelector('[name="slug"]').value,'slug-generated-0');
 assert.equal(adminPage.document.querySelector('[name="slug"]').readOnly,true);
 assert.equal(writes.length,1);assert.equal(writes[0][0],'impulso-activities-changed');
 ok(role+': alta draft por RPC, escenarios permitidos, validación, doble envío bloqueado y slug readonly solo después de guardar');
 await click('VOLVER A ACTIVIDADES');
 assert.match(adminPage.document.querySelector('table').textContent,/Nueva actividad/);
 await click('+ AGREGAR ACTIVIDAD');
 assert.equal(adminPage.document.querySelector('[name="scenario"]').value,adminState.activities[0].scenario);
 denyCreate=true;await submit({title:'Denegada'});
 assert.match(adminPage.document.querySelector('#admin-message').textContent,/No tienes permiso/);
 assert.equal(adminPage.document.querySelector('.admin-edit button[type="submit"]').disabled,false);
 assert.equal(adminState.activities.length,1);denyCreate=false;
 await submit({title:'Publicada',status:'open',activity_date:'2026-10-16'});
 assert.equal(adminState.activities.length,2);
 const publicPage=await load('index.html','agenda-route.js',adminState);
 assert.equal(publicPage.document.querySelectorAll('.agenda-item').length,1);
 assert.match(publicPage.document.querySelector('.agenda-title strong').textContent,/Publicada/);
 ok(role+': agregar desde escenario conserva selección; denegación recuperable; actividad OPEN aparece en agenda');
 if(role==='super_admin'){
  const deleteCalls=()=>adminState.calls.filter(c=>c[0]==='admin_delete_activity').length;
  await click('ELIMINAR ACTIVIDAD');assert.equal(deleteCalls(),0);
  const confirmation=adminPage.document.querySelector('[aria-label="Confirmar eliminación de actividad"]');
  assert.equal(confirmation.hidden,false);assert.match(confirmation.textContent,/Esta acción solo está disponible si nadie la ha seleccionado/);
  [...confirmation.querySelectorAll('button')].find(b=>b.textContent==='CANCELAR').click();
  assert.equal(confirmation.hidden,true);assert.equal(deleteCalls(),0);
  adminState.activities[1].selected_count=1;
  await click('ELIMINAR ACTIVIDAD');await click('ELIMINAR DEFINITIVAMENTE');
  assert.equal(deleteCalls(),1);assert.equal(adminState.activities.length,2);
  assert.match(adminPage.document.querySelector('#admin-message').textContent,/Cámbiala a CANCELADA.*sin perder el historial/);
  assert.equal(writes.length,2);
  ok('super_admin: eliminar exige dos clics, CANCELAR no borra y selecciones muestran instrucción de cancelación sin borrar');
 }else{
  assert.equal(findButton('ELIMINAR ACTIVIDAD'),undefined);
  assert.equal(findButton('ELIMINAR DEFINITIVAMENTE'),undefined);
  ok('staff: sin controles de borrado definitivo en editor');
 }
 await submit({status:'cancelled'});
 assert.equal(adminState.activities[1].status,'cancelled');
 const cancelledPage=await load('index.html','agenda-route.js',adminState);
 assert.equal(cancelledPage.document.querySelectorAll('.agenda-item').length,0);
 assert.equal(writes.length,3);
 ok(role+': cancelación por RPC notifica agenda y retira la actividad pública');
 if(role==='super_admin'){
  await click('VOLVER A ACTIVIDADES');await click('VER / EDITAR');
  await click('ELIMINAR ACTIVIDAD');await click('ELIMINAR DEFINITIVAMENTE');
  assert.equal(adminState.activities.length,1);
  assert.equal(adminPage.document.querySelector('table').textContent.includes('Nueva actividad'),false);
  assert.equal(writes.length,4);assert.match(adminPage.document.querySelector('#admin-message').textContent,/Actividad eliminada/);
  ok('super_admin: borrado confirmado sin selecciones regresa al escenario, actualiza tabla y notifica agenda');
 }
 assert.ok(writes.every(([key,value])=>key==='impulso-activities-changed'&&/^\d+$/.test(value)));
}
// Privacy cases use real NULL defaults in the mock instead of acknowledged regression fixtures.
for(const file of ['registro.html','completar-registro.html','aceptar-privacidad.html']){
 const doc=parseHTML(fs.readFileSync(file,'utf8')).document;
 const checkbox=doc.querySelector('[name="privacy_acknowledged"]');
 assert.equal(checkbox.type,'checkbox');assert.equal(checkbox.hasAttribute('required'),true);assert.equal(checkbox.hasAttribute('checked'),false);
 assert.ok(doc.querySelector('label[for="'+checkbox.id+'"]'));
 const link=doc.querySelector('main a[href="privacidad.html"],main a[href="https://controlescolar.uaemex.mx/AvisoPrivacidadSCE.pdf"]');
 assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');
 assert.ok(doc.querySelector('[data-message][role="status"][aria-live="polite"]'));
 ok(file+': reconocimiento obligatorio sin premarcar, label asociado, enlace accesible y mensajes anunciables');
}
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){
 const doc=parseHTML(fs.readFileSync(file,'utf8')).document;
 assert.ok(doc.querySelector('footer a[href="privacidad.html"],footer a[href="https://controlescolar.uaemex.mx/AvisoPrivacidadSCE.pdf"]'),file);
}
const privacyDoc=fs.readFileSync('privacidad.html','utf8');
assert.match(privacyDoc,/https:\/\/controlescolar\.uaemex\.mx\/AvisoPrivacidadSCE\.pdf/);
assert.doesNotMatch(privacyDoc,/supabase-js|navbar-auth/);
ok('aviso público disponible sin SDK ni sesión y enlazado desde todos los footers');
assert.equal(hasCurrentPrivacyAcknowledgement(null),false);
assert.equal(hasCurrentPrivacyAcknowledgement({privacy_notice_version:PRIVACY_NOTICE_VERSION}),false);
assert.equal(hasCurrentPrivacyAcknowledgement({...currentPrivacy,privacy_notice_version:'anterior'}),false);
assert.equal(hasCurrentPrivacyAcknowledgement(currentPrivacy),true);
ok('helper exige fecha y versión vigente; una versión anterior requiere reconocimiento');
{
 const pendingState=backend(null,false);
 let signupMetadata;
 pendingState.client.auth.signUp=async payload=>{pendingState.calls.push(['signUp',payload]);signupMetadata=payload.options.data;return {data:{user,session:null}};};
 let pendingPage=await load('registro.html','registro.js',pendingState,'?activity='+openActivity.slug);
 await pendingPage.submit('form',{...signupValues,privacy_acknowledged:false});
 assert.equal(pendingState.calls.length,0);assert.match(pendingPage.document.querySelector('[data-message]').textContent,/consulta y reconoce/);
 await pendingPage.submit('form',signupValues);
 assert.equal(signupMetadata.privacy_notice_pending_version,PRIVACY_NOTICE_VERSION);
 assert.equal('privacy_acknowledged_at' in signupMetadata,false);
 assert.equal(pendingState.profiles.length,0);assert.equal(pendingState.registrations.length,0);
 assert.equal(pendingState.calls.some(c=>c[1]==='acknowledge_privacy_notice'),false);
 const emailUser={...user,user_metadata:signupMetadata};
 pendingState.client.auth.signInWithPassword=async payload=>{pendingState.calls.push(['signIn',payload]);pendingState.emit('SIGNED_IN',{user:emailUser});return {data:{user:emailUser}};};
 pendingPage=await load('login.html','login.js',pendingState,'?activity='+openActivity.slug);
 await pendingPage.submit('form',{email:user.email,password:'password123'});
 assert.equal(pendingState.profiles.length,1);assert.equal(pendingState.registrations.length,1);
 assert.ok(hasCurrentPrivacyAcknowledgement(pendingState.profiles[0]));
 const ackIndex=pendingState.calls.findIndex(c=>c[1]==='acknowledge_privacy_notice');
 assert.ok(ackIndex>pendingState.calls.findIndex(c=>c[0]==='profiles'&&c[1]==='insert'));
 assert.ok(ackIndex<pendingState.calls.findIndex(c=>c[0]==='event_registrations'&&c[1]==='insert'));
 assert.deepEqual(JSON.parse(JSON.stringify(pendingState.calls[ackIndex][2])),{p_version:PRIVACY_NOTICE_VERSION});
 assert.equal(pendingPage.location.destination,'index.html?activity='+openActivity.slug+'#arma-tu-ruta');
 ok('correo: sin checkbox no hay signup; metadata conserva solo versión; login registra evidencia por RPC antes del folio y conserva actividad');
}
{
 const googleState=backend({user:googleUser},false);
 const googlePage=await load('completar-registro.html','completar-registro.js',googleState,'?next=admin');
 await googlePage.submit('#completion-form',{...completeValues,privacy_acknowledged:false});
 assert.equal(googleState.profiles.length,0);assert.equal(googleState.registrations.length,0);
 assert.match(googlePage.document.querySelector('[data-message]').textContent,/consulta y reconoce/);
 await googlePage.submit('#completion-form',completeValues);
 assert.ok(hasCurrentPrivacyAcknowledgement(googleState.profiles[0]));assert.equal(googleState.registrations.length,1);
 const ackIndex=googleState.calls.findIndex(c=>c[1]==='acknowledge_privacy_notice');
 assert.ok(ackIndex>googleState.calls.findIndex(c=>c[0]==='profiles'&&c[1]==='insert'));
 assert.ok(ackIndex<googleState.calls.findIndex(c=>c[0]==='event_registrations'&&c[1]==='insert'));
 assert.equal(googlePage.location.destination,'admin.html');assert.equal(googleState.profiles[0].id,googleUser.id);
 assert.equal(googleState.calls.some(c=>['signUp','resend','verifyOtp'].includes(c[0])),false);
 ok('Google: perfil → reconocimiento → inscripción, checkbox obligatorio, mismo user.id y sin correo de confirmación');
}
function privacyState(fields={}){
 const result=backend({user},false);
 result.profiles=[{id:user.id,...user.user_metadata,privacy_acknowledged_at:null,privacy_notice_version:null,...fields}];
 result.registrations=[{id:'existing-reg',user_id:user.id,event_id:event.id,status:'confirmed',folio:'IMP-2026-000099',created_at:'2026-09-17T12:00:00Z'}];
 return result;
}
for(const [file,script,next] of [['mi-cuenta.html','account.js','account'],['pasaporte.html','passport.js','passport'],['admin.html','admin.js','admin']]){
 const existing=privacyState();const rpc=existing.client.rpc;
 existing.client.rpc=async(name,args)=>{
  if(name==='admin_get_access'){existing.calls.push(['role-check']);return {data:'super_admin'};}
  if(name==='admin_get_dashboard_stats')return {data:{users:1,routes:0,selections:0,activities:0,attendance:0}};
  return rpc(name,args);
 };
 let existingPage=await load(file,script,existing);
 assert.equal(existingPage.location.destination,'aceptar-privacidad.html?next='+next);
 assert.equal(existingPage.document.querySelector(file==='admin.html'?'#admin-content':'[data-private]').hidden,true);
 assert.equal(existing.calls.some(c=>c[1]==='get_my_impulso_route'||c[0]==='role-check'),false);
 existingPage=await load('aceptar-privacidad.html','aceptar-privacidad.js',existing,'?next='+next);
 assert.equal(existingPage.document.querySelector('#privacy-form').hidden,false);
 await existingPage.submit('#privacy-form',{privacy_acknowledged:false});
 assert.equal(existing.calls.some(c=>c[1]==='acknowledge_privacy_notice'),false);
 await existingPage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(existingPage.location.destination,file);
 assert.equal(existingPage.document.querySelector('[data-message]').textContent,'Aviso de Privacidad registrado.');
 const ackCount=existing.calls.filter(c=>c[1]==='acknowledge_privacy_notice').length;
 existingPage=await load(file,script,existing);
 assert.equal(existingPage.location.destination,undefined);
 assert.equal(existingPage.document.querySelector(file==='admin.html'?'#admin-content':'[data-private]').hidden,false);
 assert.equal(existing.profiles.length,1);assert.equal(existing.registrations.length,1);assert.equal(existing.registrations[0].folio,'IMP-2026-000099');
 assert.equal(existing.calls.filter(c=>c[1]==='acknowledge_privacy_notice').length,ackCount);
 if(file==='admin.html')assert.ok(existing.calls.some(c=>c[0]==='role-check'));
 ok(file+': usuario existente reconoce una vez, vuelve al destino y conserva perfil, folio e identidad/permisos');
}
{
 const stale=privacyState({...currentPrivacy,privacy_notice_version:'anterior'});
 let stalePage=await load('mi-cuenta.html','account.js',stale);assert.match(stalePage.location.destination,/aceptar-privacidad/);
 stalePage=await load('aceptar-privacidad.html','aceptar-privacidad.js',stale,'?next=passport');
 await stalePage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(stale.profiles[0].privacy_notice_version,PRIVACY_NOTICE_VERSION);assert.equal(stalePage.location.destination,'pasaporte.html');
 ok('versión anterior vuelve a solicitar reconocimiento y se actualiza sin cambiar folio');
}
{
 const publicState=privacyState();publicState.activities=[{...openActivity}];
 let publicPage=await load('index.html','agenda-route.js',publicState);
 assert.equal(publicPage.document.querySelectorAll('.agenda-item').length,1);assert.equal(publicPage.location.destination,undefined);
 assert.equal(publicState.calls.some(c=>c[1]==='get_my_impulso_route'),false);
 publicPage.document.querySelector('.route-controls button').click();await flush();
 assert.equal(publicPage.location.destination,'aceptar-privacidad.html?activity='+openActivity.slug);
 assert.equal(publicState.calls.some(c=>c[1]==='set_my_activity_registration'),false);
 publicPage=await load('aceptar-privacidad.html','aceptar-privacidad.js',publicState,'?activity='+openActivity.slug);
 await publicPage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(publicPage.location.destination,'index.html?activity='+openActivity.slug+'#arma-tu-ruta');
 assert.equal(publicState.calls.some(c=>c[1]==='set_my_activity_registration'),false);
 ok('agenda pública no se bloquea; ASISTIR solicita aviso antes de escritura y conserva actividad sin selección automática');
}
for(const query of ['?next=https://evil.invalid','?next=//evil.invalid','?next=constructor','?next=__proto__','?activity=https://evil.invalid']){
 const safe=privacyState();const safePage=await load('aceptar-privacidad.html','aceptar-privacidad.js',safe,query);
 await safePage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(safePage.location.destination,'mi-cuenta.html');
}
ok('reconocimiento descarta destinos externos, nombres heredados y slugs inválidos');
{
 const failing=privacyState();const rpc=failing.client.rpc;
 failing.client.rpc=async(name,args)=>name==='acknowledge_privacy_notice'?{error:{message:'offline'}}:rpc(name,args);
 const failPage=await load('aceptar-privacidad.html','aceptar-privacidad.js',failing);
 await failPage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(failPage.location.destination,undefined);assert.equal(failing.profiles[0].privacy_acknowledged_at,null);
 assert.match(failPage.document.querySelector('[data-message]').textContent,/No pudimos registrar/);
 assert.equal(failPage.document.querySelector('button[type="submit"]').disabled,false);
 failing.client.rpc=rpc;await failPage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(failPage.location.destination,'mi-cuenta.html');
 ok('fallo de RPC no concede acceso ni finge evidencia y permite reintento');
}
{
 const changed=privacyState();const changedPage=await load('aceptar-privacidad.html','aceptar-privacidad.js',changed,'?next=admin');
 changed.emit('SIGNED_IN',{user:{...user,id:'another-user'}});
 await changedPage.submit('#privacy-form',{privacy_acknowledged:true});
 assert.equal(changedPage.document.querySelector('#privacy-form').hidden,true);
 assert.equal(changed.calls.some(c=>c[1]==='acknowledge_privacy_notice'),false);
 assert.equal(changedPage.location.destination,'login.html?next=admin');
 const guest=await load('aceptar-privacidad.html','aceptar-privacidad.js',backend(null,false),'?next=passport');
 assert.equal(guest.location.destination,'login.html?next=passport');
 ok('reconocimiento verifica sesión remotamente y bloquea ausencia/cambio de identidad sin perder destino');
}
{
 const activity={...openActivity,scenario:'tecnologia',attendance_enabled:true};
 const checkin='tecnologia/'+activity.slug;
 const query='?checkin='+encodeURIComponent(checkin)+'&t='+'a'.repeat(64);
 const nfcState=backend({user});nfcState.activities=[activity];
 let nfcPage=await load('actividad.html','activity-page.js',nfcState,'?checkin='+encodeURIComponent(checkin));
 assert.equal(nfcPage.document.querySelector('#activity-title').textContent,activity.title);
 assert.match(nfcPage.document.querySelector('#attendance-status').textContent,/Enlace de asistencia inválido/);
 assert.equal(nfcState.route.length,0);
 nfcPage=await load('actividad.html','activity-page.js',nfcState,query);
 const captchaScript=nfcPage.document.querySelector('script[src*="challenges.cloudflare.com"]');
 assert.ok(captchaScript);captchaScript.onerror();
 assert.match(nfcPage.document.querySelector('#attendance-status').textContent,/verificación/);
 nfcState.attendances=[{activity_id:activity.id,title:activity.title,method:'NFC',attended_at:'2026-10-15T16:00:00Z'}];
 nfcPage=await load('actividad.html','activity-page.js',nfcState,query);
 assert.match(nfcPage.document.querySelector('#attendance-status').textContent,/ya fue completada/);
 nfcPage=await load('pasaporte.html','passport.js',nfcState);
 assert.equal(nfcPage.document.querySelector('[data-attendance-count]').textContent,'1');
 assert.equal(nfcState.route.length,0);
 assert.match(nfcPage.document.querySelector('[data-attendance-progress]').textContent,/1 de 12/);
 assert.equal(nfcPage.document.querySelector('[data-attendance-badge]').textContent,'BLOQUEADA');
 assert.match(nfcPage.document.querySelector('[data-attendance-list]').textContent,/Asistencia confirmada/);
 const guest=backend();guest.activities=[activity];
 nfcPage=await load('actividad.html','activity-page.js',guest,query);
 assert.match(nfcPage.document.querySelector('#attendance-actions a').href,/login.html\?checkin=/);
 const authPage=await load('login.html','login.js',backend({user}),query);
 assert.equal(authPage.location.destination,'actividad.html'+query);
 const redirects=await authPage.moduleFor(path.resolve('js/return-to.js'));
 assert.equal(redirects.namespace.googleReturnPath().includes('checkin='),true);
 assert.equal(redirects.namespace.confirmationPath().includes('checkin='),true);
 assert.equal(redirects.namespace.privacyLink('actividad.html'+query),'aceptar-privacidad.html'+query);
 assert.ok(redirects.namespace.googleReturnPath().includes('&t='+'a'.repeat(64)));
 assert.ok(redirects.namespace.confirmationPath().includes('&t='+'a'.repeat(64)));
 nfcState.attendances=Array.from({length:12},(_,i)=>({activity_id:'attended-'+i,title:'Actividad '+i,attended_at:'2026-10-15T16:00:00Z'}));
 nfcPage=await load('pasaporte.html','passport.js',nfcState);
 assert.equal(nfcPage.document.querySelector('[data-attendance-count]').textContent,'12');
 assert.match(nfcPage.document.querySelector('[data-attendance-badge]').textContent,/DESBLOQUEADA/);
 const invalid=await load('login.html','login.js',backend({user}),'?checkin=https://evil.example');
 assert.equal(invalid.location.destination,'mi-cuenta.html');
 ok('NFC: token requerido, sin ruta previa, pasaporte e insignia 12, login/OAuth/privacidad conservan token');
}
for(const blocked of [false,true]){
 const authState=backend();const authPage=await load('login.html','login.js',authState,'',{captchaError:blocked});
 const authModule=await authPage.moduleFor(path.resolve('js/auth.js'));
 for(const [name,args,operation,action] of [
  ['signUp',[user.email,'password123',{}],'signUp','signup'],
  ['signInWithPassword',[user.email,'password123'],'signIn','login'],
  ['requestRecovery',[user.email],'reset','recovery'],
  ['resendConfirmation',[user.email],'resend','resend']
 ]){
  if(blocked)await assert.rejects(authModule.namespace[name](...args),{code:'captcha_failed'});
  else {await authModule.namespace[name](...args);const call=authState.calls.find(c=>c[0]===operation);assert.equal((operation==='reset'?call[2]:call[1].options).captchaToken,'test-captcha-'+action);}
 }
 if(blocked)assert.equal(authState.calls.length,0);
}
ok('Auth: signup/login/recovery/resend envían token; fallo CAPTCHA impide llamadas');
{
 const adminState=backend({user});let enabled=false,writes=0,fail=false;
 const control=()=>({attendance_enabled:enabled,point_token:'b'.repeat(64),audit:[]});
 adminState.client.rpc=async(name,args)=>{
  if(name==='admin_get_attendance_control')return {data:control()};
  if(name==='admin_set_attendance_enabled'){writes++;if(fail)return {error:{message:'ADMIN_REQUIRED'}};enabled=args.p_enabled;return {data:control()};}
  throw Error(name);
 };
 const p=await load('login.html',[] ,adminState);
 const m=await p.moduleFor(path.resolve('js/admin-attendance.js'));await m.evaluate();
 const panel=m.namespace.attendancePanel({...openActivity,scenario:'deporte'},()=>true);p.document.querySelector('main').append(panel);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};await settle();
 const button=text=>[...panel.querySelectorAll('button')].find(b=>b.textContent===text&&!b.hidden);
 assert.match(panel.textContent,/ASISTENCIA CERRADA/);assert.ok(panel.querySelector('input').value.includes('&t='+'b'.repeat(64)));
 button('HABILITAR ASISTENCIA').click();assert.equal(writes,0);assert.match(panel.textContent,/¿Habilitar el registro/);
 button('CANCELAR').click();assert.equal(writes,0);
 button('HABILITAR ASISTENCIA').click();button('HABILITAR').click();button('HABILITAR').click();await settle();assert.equal(writes,1);assert.match(panel.textContent,/ASISTENCIA ACTIVA/);
 button('CERRAR ASISTENCIA').click();assert.match(panel.textContent,/¿Cerrar el registro/);button('CERRAR ASISTENCIA').click();await settle();assert.equal(enabled,false);
 button('HABILITAR ASISTENCIA').click();button('HABILITAR').click();await settle();assert.equal(enabled,true);
 fail=true;button('CERRAR ASISTENCIA').click();button('CERRAR ASISTENCIA').click();await settle();assert.equal(enabled,true);assert.match(panel.textContent,/No tienes permisos/);
 ok('panel de asistencia: confirmación, cancelar, doble clic, cerrar, reabrir y denegación backend');
}
{
 const activity={...openActivity,scenario:'deporte',attendance_enabled:false};const query='?checkin='+encodeURIComponent('deporte/'+activity.slug)+'&t='+'a'.repeat(64);
 const s=backend({user,access_token:'test-session'});s.activities=[activity];
 let p=await load('actividad.html','activity-page.js',s,query);assert.match(p.document.querySelector('#attendance-status').textContent,/asistencia está cerrada/);assert.equal(p.document.querySelector('script[src*="challenges.cloudflare.com"]'),null);
 activity.attendance_enabled=true;let sent;
 p=await load('actividad.html','activity-page.js',s,query,{fetch:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({code:'RECORDED'})};}});
 let challenge;p.context.window.turnstile={render(selector,options){challenge=options;return 1;}};p.document.querySelector('script[src*="challenges.cloudflare.com"]').onload();
 await challenge.callback('turnstile-test-token');assert.equal(sent.point_token,'a'.repeat(64));assert.equal(sent.token,'turnstile-test-token');assert.equal(s.route.length,0);assert.match(p.document.querySelector('#attendance-status').textContent,/Asistencia registrada/);
 ok('check-in: cerrada bloquea interfaz; activa envía ambos tokens sin selección previa');
}
console.log('TOTAL: '+passed+' comprobaciones de interfaz.');
