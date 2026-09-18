import assert from 'node:assert/strict';
export async function testAdmin(db){
 const admin='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',normal='33333333-3333-4333-8333-333333333333';
 let checks=0;
 const q=(sql,args=[])=>db.query(sql,args);
 const one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const rejects=async(sql,pattern,args=[])=>{await assert.rejects(q(sql,args),pattern);checks++;};
 async function asUser(id,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role})]);await db.exec('set role '+role);}
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
 ('${admin}','admin@example.invalid',now()),('${staff}','staff@example.invalid',now()),('${normal}','normal@example.invalid',now());
 insert into public.admin_users(user_id,role) values ('${admin}','super_admin'),('${staff}','staff');
 insert into public.profiles(id,email,nombre,apellidos,tipo_usuario) values ('${normal}','normal@example.invalid','Usuario','Normal','Administrativo');
 insert into public.event_registrations(user_id,event_id) select '${normal}',id from public.events where slug='impulso-uaemex-2026';`);
 const a=await one("select id,event_id,slug,created_at::text from public.activities where status='open' order by slug limit 1");
 const updateSql='select public.admin_update_activity($1,$2,$3,$4,$5,$6,$7,$8,$9) as result';
 const args=[a.id,'Ponente A; Ponente B','2026-10-16',null,'10:00','Nueva sede','Nueva descripción','open',null];
 await asUser(normal);
 for(const sql of ['select public.admin_get_access()','select public.admin_get_dashboard_stats()','select public.admin_list_activities()',`select public.admin_get_activity('${a.id}')`,`select public.admin_get_activity_participants('${a.id}')`,'select public.admin_list_users()',`select public.admin_get_user_route('${normal}')`])await rejects(sql,/ADMIN_REQUIRED/);
 await rejects(updateSql,/ADMIN_REQUIRED/,args);
 await rejects('select * from public.admin_users',/permission denied/);
 await rejects(`insert into public.admin_users values('${normal}','super_admin',now())`,/permission denied/);
 await rejects('select updated_by from public.activities',/permission denied/);
 await rejects('select * from public.activities',/permission denied/);
 await rejects('select to_jsonb(a) from public.activities a',/permission denied/);
 await rejects("update public.activities set speaker='Ataque'",/permission denied/);
 const firstPublic=await one('select * from public.list_impulso_activities() limit 1');
 assert.equal('updated_by' in firstPublic,false);checks++;
 await q('select public.set_my_activity_registration($1,\'registered\')',[a.id]);
 await asUser(admin);
 assert.equal((await one('select public.admin_get_access() as role')).role,'super_admin');checks++;
 assert.equal((await one('select public.admin_list_users() as value')).value.rows[0].tipo_usuario,'Administrativo');checks++;
 assert.equal((await one('select public.admin_get_dashboard_stats() as value')).value.routes,1);checks++;
 assert.equal((await one('select public.admin_get_activity_participants($1) as value',[a.id])).value.total,1);checks++;
 assert.equal((await one('select public.admin_get_user_route($1) as value',[normal])).value.length,1);checks++;
 const saved=(await one(updateSql,args)).result;
 assert.equal(saved.updated_by,admin);assert.ok(saved.updated_at);assert.equal(saved.start_time,null);assert.equal(saved.end_time,'10:00:00');checks++;
 assert.equal(saved.id,a.id);assert.equal(saved.slug,a.slug);assert.equal(saved.event_id,a.event_id);checks++;
 await rejects(updateSql,/EDIT_CONFLICT/,args);
 await asUser(staff);
 let token=saved.updated_at;
 for(const [start,end] of [['09:00','10:00'],['09:00',null],[null,'10:00'],[null,null]]){
   const result=(await one(updateSql,[...args.slice(0,3),start,end,...args.slice(5,8),token])).result;
   assert.equal(result.updated_by,staff);token=result.updated_at;checks++;
 }
 await rejects(updateSql,/INVALID_ACTIVITY_TIME/,[...args.slice(0,3),'11:00','10:00',...args.slice(5,8),token]);
 await rejects(updateSql,/ACTIVITY_DATE_REQUIRED/,[a.id,null,null,null,null,null,null,'open',token]);
 const cleared=(await one(updateSql,[a.id,'','2026-10-15',null,null,'','', 'open',token])).result;
 assert.equal(cleared.speaker,null);assert.equal(cleared.location,null);assert.equal(cleared.description,null);checks++;
 await db.exec('reset role');
 const other=(await one("insert into public.events(nombre,slug,fecha_inicio,fecha_fin,ubicacion,status) values('Otro','otro','2026-10-15','2026-10-16','Otra','open') returning id")).id;
 const foreign=(await one("insert into public.activities(event_id,title,slug,scenario,activity_date,status) values($1,'Otra','otra','cultura','2026-10-15','open') returning id",[other])).id;
 await asUser(admin);await rejects(updateSql,/ACTIVITY_UNAVAILABLE/,[foreign,...args.slice(1)]);
 await asUser(normal);
 const own=(await one('select activity from public.get_my_impulso_route() limit 1')).activity;
 assert.equal('updated_by' in own,false);assert.equal('updated_at' in own,false);checks++;
 assert.equal((await one('select count(*)::integer as n from public.profiles')).n,1);checks++;
 await asUser(null,'anon');
 await rejects('select updated_by from public.activities',/permission denied/);await rejects('select * from public.activities',/permission denied/);
 await rejects('select public.admin_list_users()',/permission denied/);
 const publicRows=(await q('select * from public.list_impulso_activities()')).rows;
 assert.ok(publicRows.every(r=>!('updated_by' in r)&&!('updated_at' in r)));checks++;
 await db.exec(`reset role;delete from public.admin_users where user_id='${staff}';`);
 await asUser(staff);await rejects('select public.admin_list_users()',/ADMIN_REQUIRED/);
 await rejects(updateSql,/ADMIN_REQUIRED/,[a.id,...args.slice(1,8),cleared.updated_at]);
 await db.exec('reset role');
 assert.equal((await one("select count(*)::integer as n from public.activities where event_id=$1",[a.event_id])).n,67);checks++;
 console.log(`PASS Fase 3A: ${checks} comprobaciones PostgreSQL (roles, privacidad, NULL, conflictos, horas, ámbito y revocación).`);
}
