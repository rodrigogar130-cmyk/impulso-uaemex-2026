import assert from 'node:assert/strict';
export async function testAdminEditor(db){
 const admin='11111111-1111-4111-8111-111111111111',normal='33333333-3333-4333-8333-333333333333';
 const query=(sql,args=[])=>db.query(sql,args);
 const one=async(sql,args=[])=>(await query(sql,args)).rows[0];
 const a=(await one("select to_jsonb(a) as data from public.activities a join public.events e on e.id=a.event_id where e.slug='impulso-uaemex-2026' and a.updated_at is null order by a.slug limit 1")).data;
 const sql='select public.admin_update_activity($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as data';
 const args=[a.id,'  Título editado  ','bienestar','Ponente A; Ponente B','2026-10-16','09:00','10:00','Nueva ubicación','Nueva descripción','open',null];
 async function asUser(id){await db.exec('reset role');await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id})]);await db.exec('set role authenticated');}
 assert.equal((await one("select count(*)::integer as n from pg_proc where pronamespace='public'::regnamespace and proname='admin_update_activity'")).n,1);
 assert.equal((await one("select to_regprocedure('public.admin_update_activity(uuid,text,date,time,time,text,text,text,timestamptz)') as old")).old,null);
 await asUser(normal);await assert.rejects(query(sql,args),/ADMIN_REQUIRED/);
 await asUser(admin);
 for(const title of [null,'','   '])await assert.rejects(query(sql,[a.id,title,...args.slice(2)]),/ACTIVITY_TITLE_REQUIRED/);
 for(const scenario of [null,'','Tecnología','otro'])await assert.rejects(query(sql,[...args.slice(0,2),scenario,...args.slice(3)]),/INVALID_ACTIVITY_SCENARIO/);
 const changed=(await one(sql,args)).data;
 assert.equal(changed.title,'Título editado');assert.equal(changed.scenario,'bienestar');
 assert.equal(changed.slug,a.slug);assert.equal(changed.event_id,a.event_id);assert.equal(changed.created_at,a.created_at);
 assert.equal(changed.updated_by,admin);assert.ok(changed.updated_at);
 for(const [key,value] of Object.entries({speaker:args[3],activity_date:args[4],start_time:'09:00:00',end_time:'10:00:00',location:args[7],description:args[8],status:args[9]}))assert.equal(changed[key],value);
 await assert.rejects(query(sql,args),/EDIT_CONFLICT/);
 await assert.rejects(query(sql,[...args.slice(0,5),'11:00','10:00',...args.slice(7,10),changed.updated_at]),/INVALID_ACTIVITY_TIME/);
 await assert.rejects(query(sql,[...args.slice(0,4),null,...args.slice(5,10),changed.updated_at]),/ACTIVITY_DATE_REQUIRED/);
 await assert.rejects(query(sql,[...args.slice(0,9),'invalid',changed.updated_at]),/INVALID_ACTIVITY_STATUS/);
 let token=changed.updated_at;
 for(const scenario of ['cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar']){
   const result=(await one(sql,[a.id,'Título nuevo',scenario,null,null,null,null,null,null,'draft',token])).data;
   assert.equal(result.scenario,scenario);assert.equal(result.slug,a.slug);assert.equal(result.speaker,null);assert.equal(result.activity_date,null);assert.equal(result.start_time,null);assert.equal(result.end_time,null);assert.equal(result.location,null);assert.equal(result.description,null);assert.equal(result.status,'draft');token=result.updated_at;
 }
 await db.exec('reset role');
 const other=(await one("select a.id from public.activities a join public.events e on e.id=a.event_id where e.slug='otro' limit 1")).id;
 await asUser(admin);await assert.rejects(query(sql,[other,...args.slice(1)]),/ACTIVITY_UNAVAILABLE/);
 await db.exec('reset role;set role anon');await assert.rejects(query(sql,args),/permission denied/);await db.exec('reset role');
 console.log('PASS 004: título y escenario, trim/NULL, siete opciones, permisos, slug estable, auditoría, concurrencia, campos anteriores y una sola firma.');
}
