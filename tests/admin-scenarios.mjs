import assert from 'node:assert/strict';
// Requiere una base de pruebas aislada con 001–005 ya cargadas.
// No aplica migraciones ni abre conexiones. No ejecutar contra producción.
export async function testAdminScenarios(db){
 const admin='51111111-1111-4111-8111-111111111111',staff='52222222-2222-4222-8222-222222222222',empty='53333333-3333-4333-8333-333333333333';
 const q=(sql,args=[])=>db.query(sql,args);
 const value=async(sql,args=[])=>(await q(sql,args)).rows[0].value;
 async function asUser(id,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role})]);await db.exec('set role '+role);}
 const list=scenario=>value('select public.admin_list_activities($1) as value',[scenario]);
 const detail=id=>value('select public.admin_get_activity($1) as value',[id]);
 const update=(a,scenario=a.scenario)=>value('select public.admin_update_activity($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as value',[a.id,'Editada',scenario,a.speaker,a.activity_date,a.start_time,a.end_time,a.location,a.description,a.status,a.updated_at]);
 try{
  await db.exec('reset role');
  await q('insert into auth.users(id) values ($1),($2),($3)',[admin,staff,empty]);
  await q("insert into public.admin_users(user_id,role) values($1,'super_admin'),($2,'staff'),($3,'staff')",[admin,staff,empty]);
  await q("insert into public.admin_scenario_access(user_id,scenario) values($1,'deporte')",[staff]);
  const fixtures=(await q(`insert into public.activities(event_id,title,slug,scenario,status)
   select e.id,'Prueba '||s.scenario,'scenario-test-'||s.scenario,s.scenario,'draft'
   from public.events e cross join (values ('deporte'),('diseno')) s(scenario)
   where e.slug='impulso-uaemex-2026' returning *`)).rows;
  let sport=fixtures.find(a=>a.scenario==='deporte'),design=fixtures.find(a=>a.scenario==='diseno');
  await asUser(admin);
  assert.equal((await value('select public.admin_list_scenarios() as value')).length,7);
  for(const a of fixtures)assert.equal((await detail(a.id)).id,a.id);
  await asUser(staff);
  const scenarios=await value('select public.admin_list_scenarios() as value');
  assert.deepEqual(scenarios.map(s=>s.scenario),['deporte']);assert.equal(scenarios[0].label,'Deporte');assert.ok(scenarios[0].draft_count>=1);
  assert.ok((await list('deporte')).some(a=>a.id===sport.id&&a.status==='draft'));
  assert.ok((await list(null)).every(a=>a.scenario==='deporte'));
  await assert.rejects(list('diseno'),/SCENARIO_ADMIN_REQUIRED/);
  await assert.rejects(detail(design.id),/SCENARIO_ADMIN_REQUIRED/);
  sport=await update(sport);assert.equal(sport.updated_by,staff);assert.equal(sport.slug,'scenario-test-deporte');
  await assert.rejects(update(design),/SCENARIO_ADMIN_REQUIRED/);
  await assert.rejects(update({...sport,id:design.id}),/SCENARIO_ADMIN_REQUIRED/);
  await assert.rejects(update(sport,'diseno'),/SCENARIO_ADMIN_REQUIRED/);
  for(const sql of ['select * from public.admin_scenario_access',`insert into public.admin_scenario_access(user_id,scenario) values('${staff}','diseno')`,`delete from public.admin_scenario_access where user_id='${staff}'`])await assert.rejects(q(sql),/permission denied/);
  await assert.rejects(q("select public.require_impulso_scenario_access('deporte')"),/permission denied/);
  for(const sql of ['select public.admin_list_users()','select public.admin_get_dashboard_stats()',`select public.admin_get_activity_participants('${sport.id}')`,`select public.admin_get_user_route('${admin}')`])await assert.rejects(q(sql),/SUPER_ADMIN_REQUIRED/);
  await asUser(empty);assert.deepEqual(await list(null),[]);assert.deepEqual(await value('select public.admin_list_scenarios() as value'),[]);
  await assert.rejects(detail(sport.id),/SCENARIO_ADMIN_REQUIRED/);
  await db.exec('reset role');await q("insert into public.admin_scenario_access(user_id,scenario) values($1,'diseno')",[staff]);
  await asUser(staff);sport=await update(sport,'diseno');assert.equal(sport.scenario,'diseno');assert.equal(sport.slug,'scenario-test-deporte');
  await asUser(admin);
  for(const scenario of ['cultura','deporte','tecnologia','diseno','investigacion','gobernanza','bienestar']){design=await update(design,scenario);assert.equal(design.scenario,scenario);}
  await value('select public.admin_list_users() as value');await value('select public.admin_get_user_route($1) as value',[staff]);
  await asUser(null,'anon');await assert.rejects(list(null),/permission denied/);
  await db.exec('reset role');await q('delete from public.admin_scenario_access where user_id=$1',[staff]);
  await asUser(staff);await assert.rejects(detail(sport.id),/SCENARIO_ADMIN_REQUIRED/);
  await db.exec('reset role');
  assert.equal((await q("select count(*)::integer n from pg_proc where pronamespace='public'::regnamespace and proname='admin_list_activities'")).rows[0].n,1);
  console.log('PASS 005: escenarios, permisos PostgreSQL, ID manipulado, destinos, drafts, RLS, roles y revocación.');
 }finally{
  await db.exec('reset role');
  await q("delete from public.activities where slug in ('scenario-test-deporte','scenario-test-diseno')");
  await q('delete from auth.users where id in ($1,$2,$3)',[admin,staff,empty]);
 }
}
