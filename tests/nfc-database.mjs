import assert from 'node:assert/strict';
export async function testNfcDatabase(db){
 const A='88888888-8888-4888-8888-888888888888',B='99999999-9999-4999-8999-999999999999',activity='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('${A}','nfc-a@example.invalid',now(),'{}'),('${B}','nfc-b@example.invalid',now(),'{}');
 insert into public.profiles(id,email,nombre,apellidos,tipo_usuario,privacy_notice_version,privacy_acknowledged_at) values
 ('${A}','nfc-a@example.invalid','NFC','A','Público general','2026-09',now()),('${B}','nfc-b@example.invalid','NFC','B','Público general','2026-09',now());
 insert into public.event_registrations(user_id,event_id) select u.id,e.id from public.events e cross join (values('${A}'::uuid),('${B}'::uuid))u(id) where e.slug='impulso-uaemex-2026';
 insert into public.activities(id,event_id,title,slug,scenario,status) select '${activity}',id,'NFC test','nfc-test','deporte','draft' from public.events where slug='impulso-uaemex-2026';`);
 async function as(role,user,fn){await db.exec(`set role ${role};select set_config('request.jwt.claims','${JSON.stringify({sub:user})}',false)`);try{return await fn();}finally{await db.exec('reset role');}}
 const admin=fn=>as('authenticated',B,fn);
 async function control(){return admin(async()=>(await db.query('select public.admin_get_attendance_control($1) r',[activity])).rows[0].r);}
 async function toggle(enabled){return admin(async()=>(await db.query('select public.admin_set_attendance_enabled($1,$2) r',[activity,enabled])).rows[0].r);}
 let token;
 async function check(user=A,id=activity,point=token){return as('service_role',null,async()=>(await db.query('select public.confirm_nfc_attendance($1,$2,$3,$4) r',[user,id,crypto.randomUUID(),point])).rows[0].r.code);}
 await as('authenticated',A,async()=>{
  await assert.rejects(db.query('select public.confirm_nfc_attendance($1,$2,$3,$4)',[A,activity,crypto.randomUUID(),'a'.repeat(64)]),/permission denied/);
  await assert.rejects(db.query('select public.admin_set_attendance_enabled($1,true)',[activity]),/ADMIN_REQUIRED/);
  await assert.rejects(db.query('select public.admin_get_attendance_control($1)',[activity]),/ADMIN_REQUIRED/);
  await assert.rejects(db.query('update public.activities set attendance_enabled=true'),/permission denied/);
  await assert.rejects(db.query('select * from impulso_private.attendance_points'),/permission denied/);
  await assert.rejects(db.query('select * from impulso_private.attendance_control_log'),/permission denied/);
  await assert.rejects(db.query('insert into public.activity_attendances(user_id,activity_id,request_id) values($1,$2,$3)',[A,activity,crypto.randomUUID()]),/permission denied/);
  await assert.rejects(db.query('select public.consume_nfc_attempt($1)',[A]),/permission denied/);
 });
 await as('anon',null,async()=>{
  await assert.rejects(db.query('select public.admin_get_attendance_control($1)',[activity]),/permission denied/);
  await assert.rejects(db.query('select * from public.activity_attendances'),/permission denied/);
  await assert.rejects(db.query('select public.get_my_passport_status()'),/permission denied/);
 });
 await db.exec(`insert into public.admin_users(user_id,role) values('${B}','staff');`);
 await assert.rejects(control(),/SCENARIO_ADMIN_REQUIRED/);
 await assert.rejects(toggle(true),/SCENARIO_ADMIN_REQUIRED/);
 await db.exec(`insert into public.admin_scenario_access(user_id,scenario) values('${B}','deporte');`);
 let c=await control();token=c.point_token;assert.match(token,/^[a-f0-9]{64}$/);assert.equal(c.attendance_enabled,false);assert.equal(c.audit.length,0);
 assert.equal(await check(),'ATTENDANCE_CLOSED');
 assert.equal(await check(A,activity,null),'POINT_TOKEN_INVALID');
 assert.equal(await check(A,activity,'f'.repeat(64)),'POINT_TOKEN_INVALID');
 c=await toggle(true);assert.equal(c.audit.length,1);assert.equal(c.audit[0].changed_by,B);assert.ok(c.audit[0].changed_at);
 assert.equal((await toggle(true)).audit.length,1); // idempotent admin retry
 assert.equal((await db.query('select count(*)::int n from public.activity_registrations where user_id=$1',[A])).rows[0].n,0);
 assert.equal(await check(),'RECORDED');assert.equal(await check(),'ALREADY_COMPLETED');
 await as('service_role',null,()=>assert.rejects(db.query('insert into public.activity_attendances(user_id,activity_id,request_id) values($1,$2,$3)',[A,activity,crypto.randomUUID()]),/unique constraint/));
 const original=(await db.query('select attended_at from public.activity_attendances where user_id=$1',[A])).rows[0].attended_at;
 assert.ok(Math.abs(Date.now()-new Date(original).getTime())<60000);
 c=await toggle(false);assert.equal(c.audit[0].enabled,false);assert.equal(c.point_token,token);
 assert.equal(await check(B),'ATTENDANCE_CLOSED');assert.equal(await check(),'ALREADY_COMPLETED');
 c=await toggle(true);assert.equal(c.audit.length,3);assert.equal(c.point_token,token);assert.equal(await check(),'ALREADY_COMPLETED');assert.equal(await check(B),'RECORDED');
 assert.deepEqual((await db.query('select attended_at from public.activity_attendances where user_id=$1',[A])).rows[0].attended_at,original);
 await as('authenticated',A,async()=>{
  assert.equal((await db.query('select * from public.get_my_impulso_attendances()')).rows.length,1);
  assert.equal((await db.query('select * from public.activity_attendances')).rows.length,1);
  await assert.rejects(db.query('delete from public.activity_attendances'),/permission denied/);
 });
 // 11 additional activities: future, past, absent and changed schedule all authorize identically.
 for(let i=0;i<11;i++){
  const id=crypto.randomUUID();
  await db.query(`insert into public.activities(id,event_id,title,slug,scenario,status,attendance_enabled,activity_date,start_time,end_time)
   select $1,event_id,'Attendance test',$2,'deporte','closed',true,$3::date,$4::time,$5::time from public.activities where id=$6`,
   [id,'attendance-test-'+i,i%3===0?'2099-01-01':i%3===1?'2000-01-01':null,i%3===2?null:'10:00',i%3===2?null:'11:00',activity]);
  await db.query('insert into impulso_private.attendance_points(activity_id) values($1)',[id]);
  const point=(await db.query('select point_token from impulso_private.attendance_points where activity_id=$1',[id])).rows[0].point_token;
  assert.notEqual(point,token);assert.equal(await check(A,id,token),'POINT_TOKEN_INVALID');
  assert.equal(await check(A,id,point),'RECORDED');
  await db.query("update public.activities set activity_date='2080-01-01',start_time='15:00',end_time='16:00',location='Otra sede' where id=$1",[id]);
  assert.equal(await check(A,id,point),'ALREADY_COMPLETED');
  const passport=await as('authenticated',A,async()=>(await db.query('select public.get_my_passport_status() r')).rows[0].r);
  assert.equal(passport.attendance_count,i+2);assert.equal(passport.badge_unlocked,i===10);
 }
 assert.equal((await db.query('select count(*)::int n from public.activity_attendances where user_id=$1',[A])).rows[0].n,12);
 await db.exec(`update auth.users set email_confirmed_at=null where id='${A}';`);
 assert.equal(await check(),'AUTH_REQUIRED');
 await db.exec(`update auth.users set email_confirmed_at=now() where id='${A}';update public.profiles set privacy_notice_version=null where id='${A}';`);
 assert.equal(await check(),'PRIVACY_REQUIRED');
 await db.exec(`update public.profiles set privacy_notice_version='2026-09' where id='${A}';update public.event_registrations set status='cancelled' where user_id='${A}';`);
 assert.equal(await check(),'EVENT_REGISTRATION_REQUIRED');
 await db.exec(`update public.event_registrations set status='confirmed' where user_id='${A}';update public.admin_users set role='super_admin' where user_id='${B}';delete from public.admin_scenario_access where user_id='${B}';`);
 assert.equal((await toggle(false)).attendance_enabled,false);
 assert.equal((await toggle(true)).attendance_enabled,true);
 await assert.rejects(toggle(null),/INVALID_ATTENDANCE_STATE/);
 assert.equal((await db.query("select to_regprocedure('public.confirm_nfc_attendance(uuid,uuid,uuid)') old")).rows[0].old,null);
 assert.equal((await db.query("select to_regprocedure('public.admin_set_attendance_window(uuid,timestamp with time zone,timestamp with time zone)') old")).rows[0].old,null);
 await as('authenticated',B,async()=>{assert.equal((await db.query('select public.get_my_passport_status() r')).rows[0].r.badge_unlocked,false);});
 await as('anon',null,async()=>{
  const exposed=JSON.stringify((await db.query('select * from public.get_attendance_activity($1,$2)',['deporte','nfc-test'])).rows);
  assert.ok(!exposed.includes(token));assert.ok(!exposed.includes('point_token'));
 });
 await as('service_role',null,async()=>{
  for(let i=0;i<30;i++)assert.equal((await db.query('select public.consume_nfc_attempt($1) ok',[A])).rows[0].ok,true);
  assert.equal((await db.query('select public.consume_nfc_attempt($1) ok',[A])).rows[0].ok,false);
 });
 console.log('PASS NFC SQL: manual state, audit, reopen, tokens, no route/schedule requirement, own data, 12 distinct badge, permissions and duplicates.');
}
