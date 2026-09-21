import assert from 'node:assert/strict';

// Solo la base PGlite aislada del runner, con 001–006 cargadas.
export async function testAdminCreateDelete(db){
 const admin='61111111-1111-4111-8111-111111111111',staff='62222222-2222-4222-8222-222222222222',normal='63333333-3333-4333-8333-333333333333';
 const q=(sql,args=[])=>db.query(sql,args);
 const value=async(sql,args=[])=>(await q(sql,args)).rows[0].value;
 let checks=0;
 const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
 const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
 async function asUser(id,role='authenticated'){
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role})]);
  await db.exec('set role '+role);
 }
 const create=(overrides={},omitStatus=false)=>{
  const p={title:'Diseño, acción y NIÑEZ',scenario:'deporte',speaker:null,date:null,start:null,end:null,location:null,description:null,status:'draft',...overrides};
  return value('select public.admin_create_activity($1,$2,$3,$4,$5,$6,$7,$8'+(omitStatus?'':',$9')+') as value',
   [p.title,p.scenario,p.speaker,p.date,p.start,p.end,p.location,p.description,...(omitStatus?[]:[p.status])]);
 };
 const remove=id=>value('select public.admin_delete_activity($1) as value',[id]);
 const update=(a,status)=>value('select public.admin_update_activity($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as value',
  [a.id,a.title,a.scenario,a.speaker,a.activity_date,a.start_time,a.end_time,a.location,a.description,status,a.updated_at]);
 await db.exec('reset role');
 await q('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())',[admin,staff,normal]);
 await q("insert into public.admin_users(user_id,role) values($1,'super_admin'),($2,'staff')",[admin,staff]);
 await q("insert into public.admin_scenario_access(user_id,scenario) values($1,'deporte')",[staff]);
 await q("insert into public.profiles(id,email,nombre,apellidos,tipo_usuario) values($1,'test@example.invalid','Prueba','Historial','Público general')",[normal]);
 const event=await value("select id as value from public.events where slug='impulso-uaemex-2026'");
 const fksBefore=(await q("select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.activity_registrations'::regclass and contype='f' order by conname")).rows;
 await asUser(admin);
 let draft=await create({},true);
 check(draft.status,'draft');check(draft.event_id,event);check(draft.timezone,'America/Mexico_City');check(draft.updated_by,admin);
 check(Boolean(draft.created_at&&draft.updated_at),true);check(draft.slug,'diseno-accion-y-ninez');
 const duplicate=await create();check(duplicate.slug,'diseno-accion-y-ninez-1');
 const repeated=await Promise.all([create(),create(),create()]);check(new Set([draft,duplicate,...repeated].map(a=>a.slug)).size,5);
 const nonLatin=await create({title:'🎨'});check(nonLatin.slug,'actividad');
 const decomposed=await create({title:'Cafe\u0301'});check(decomposed.slug,'cafe');
 const long=await create({title:'a'.repeat(500)});check(long.slug.length<=180,true);
 const trimmed=await create({title:'  Título  ',speaker:'  ',description:' texto ',location:'  '});
 check([trimmed.title,trimmed.speaker,trimmed.description,trimmed.location],['Título',null,'texto',null]);
 for(const scenario of ['cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar']){
  check((await create({title:'Alta superadmin '+scenario,scenario})).scenario,scenario);
 }
 for(const [args,pattern] of [[{title:' '},/ACTIVITY_TITLE_REQUIRED/],[{scenario:'otro'},/INVALID_ACTIVITY_SCENARIO/],
  [{status:'bad'},/INVALID_ACTIVITY_STATUS/],[{status:null},/INVALID_ACTIVITY_STATUS/],[{status:'open'},/ACTIVITY_DATE_REQUIRED/],
  [{start:'12:00',end:'11:00'},/INVALID_ACTIVITY_TIME/],[{start:'12:00',end:'12:00'},/INVALID_ACTIVITY_TIME/]])await rejects(()=>create(args),pattern);
 check((await value('select public.admin_list_activities($1) as value',['deporte'])).some(a=>a.id===draft.id),true);
 await asUser(staff);
 const assigned=await create({title:'Staff draft'});check(assigned.updated_by,staff);
 await rejects(()=>create({scenario:'diseno'}),/SCENARIO_ADMIN_REQUIRED/);
 await rejects(()=>remove(assigned.id),/SUPER_ADMIN_REQUIRED/);
 const published=await create({title:'Staff publicada',status:'open',date:'2026-10-16'});check(published.status,'open');
 await asUser(null,'anon');
 check((await q('select id from public.list_impulso_activities()')).rows.some(a=>a.id===published.id),true);
 await rejects(()=>create(),/permission denied/);await rejects(()=>remove(draft.id),/permission denied/);
 await asUser(normal);await rejects(()=>create(),/ADMIN_REQUIRED/);await rejects(()=>remove(draft.id),/ADMIN_REQUIRED/);
 await db.exec('reset role');
 await q("insert into public.activity_registrations(activity_id,user_id) values($1,$2)",[published.id,normal]);
 const history=await value('select to_jsonb(r) as value from public.activity_registrations r where activity_id=$1',[published.id]);
 await asUser(admin);await rejects(()=>remove(published.id),/ACTIVITY_HAS_REGISTRATIONS/);
 await asUser(staff);const cancelled=await update(published,'cancelled');check(cancelled.status,'cancelled');
 await asUser(null,'anon');check((await q('select id from public.list_impulso_activities()')).rows.some(a=>a.id===published.id),false);
 await db.exec('reset role');check(await value('select to_jsonb(r) as value from public.activity_registrations r where activity_id=$1',[published.id]),history);
 await q("update public.activity_registrations set status='cancelled' where activity_id=$1",[published.id]);
 await asUser(admin);await rejects(()=>remove(published.id),/ACTIVITY_HAS_REGISTRATIONS/);
 check((await remove(draft.id)).deleted,true);
 await rejects(()=>remove(draft.id),/ACTIVITY_UNAVAILABLE/);
 check((await value('select public.admin_list_activities($1) as value',['deporte'])).some(a=>a.id===draft.id),false);
 await db.exec('reset role');
 const otherEvent=await value("insert into public.events(slug,nombre,status,fecha_inicio,fecha_fin,ubicacion) values('other-event-006','Otro','open','2026-10-15','2026-10-16','Prueba') returning id as value");
 const otherActivity=await value("insert into public.activities(event_id,title,slug,scenario) values($1,'Ajena','ajena','deporte') returning id as value",[otherEvent]);
 await asUser(admin);await rejects(()=>remove(otherActivity),/ACTIVITY_UNAVAILABLE/);
 await db.exec('reset role');await q('delete from public.admin_scenario_access where user_id=$1',[staff]);
 await asUser(staff);await rejects(()=>create(),/SCENARIO_ADMIN_REQUIRED/);
 for(const sql of ["insert into public.activities(event_id,title,slug,scenario) values('"+event+"','No','no','deporte')","delete from public.activities where id='"+assigned.id+"'"])
  await rejects(()=>q(sql),/permission denied/);
 await db.exec('reset role');
 check((await q("select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.activity_registrations'::regclass and contype='f' order by conname")).rows,fksBefore);
 const functions=(await q("select prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('admin_create_activity','admin_delete_activity')")).rows;
 check(functions.length,2);check(functions.every(f=>f.prosecdef&&f.proconfig.includes('search_path=""')),true);
 console.log(`PASS 006: ${checks} comprobaciones PostgreSQL de creación, permisos, slugs, borrado, cancelación e historial.`);
}
