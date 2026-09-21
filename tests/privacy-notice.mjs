import assert from 'node:assert/strict';
import { PRIVACY_NOTICE_VERSION } from '../js/privacy-notice.js';

export async function testPrivacyNotice(db){
 const a='71111111-1111-4111-8111-111111111111',b='72222222-2222-4222-8222-222222222222',missing='73333333-3333-4333-8333-333333333333';
 const q=(sql,args=[])=>db.query(sql,args);
 const one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 let checks=0;
 const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
 const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
 async function asUser(id,role='authenticated'){
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role,email:'privacy@example.invalid'})]);
  await db.exec('set role '+role);
 }
 await db.exec('reset role');
 check((await one('select count(*)::integer n from public.profiles where privacy_acknowledged_at is not null or privacy_notice_version is not null')).n,0);
 const registrations=(await q('select * from public.event_registrations order by id')).rows;
 const roles=(await q('select * from public.admin_users order by user_id')).rows;
 const scenarios=(await q('select * from public.admin_scenario_access order by id')).rows;
 await q('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())',[a,b,missing]);
 await q("insert into public.profiles(id,email,nombre,apellidos,tipo_usuario) values($1,'a@privacy.invalid','Ana','Prueba','Público general'),($2,'b@privacy.invalid','Beto','Prueba','Docente')",[a,b]);
 await asUser(null,'anon');
 await rejects(()=>q('select public.acknowledge_privacy_notice($1)',[PRIVACY_NOTICE_VERSION]),/permission denied/);
 await asUser(null);await rejects(()=>q('select public.acknowledge_privacy_notice($1)',[PRIVACY_NOTICE_VERSION]),/AUTH_REQUIRED/);
 await asUser(missing);await rejects(()=>q('select public.acknowledge_privacy_notice($1)',[PRIVACY_NOTICE_VERSION]),/PROFILE_REQUIRED/);
 await asUser(a);
 for(const version of [null,'','anterior','2099-12'])await rejects(()=>q('select public.acknowledge_privacy_notice($1)',[version]),/INVALID_PRIVACY_NOTICE_VERSION/);
 await rejects(()=>q("update public.profiles set privacy_acknowledged_at='2000-01-01',privacy_notice_version=$1 where id=$2",[PRIVACY_NOTICE_VERSION,a]),/permission denied/);
 await rejects(()=>q('select public.acknowledge_privacy_notice($1,$2)',[PRIVACY_NOTICE_VERSION,b]),/does not exist/);
 const result=await one('select public.acknowledge_privacy_notice($1) result,now() server_now',[PRIVACY_NOTICE_VERSION]);
 check(result.result.id,a);check(result.result.privacy_notice_version,PRIVACY_NOTICE_VERSION);
 check(new Date(result.result.privacy_acknowledged_at).getTime(),result.server_now.getTime());
 const again=await one('select public.acknowledge_privacy_notice($1) result',[PRIVACY_NOTICE_VERSION]);
 check(again.result,result.result);
 check((await q('select id from public.profiles')).rows.map(p=>p.id),[a]);
 await db.exec('reset role');
 check((await one('select privacy_acknowledged_at,privacy_notice_version from public.profiles where id=$1',[b])),{privacy_acknowledged_at:null,privacy_notice_version:null});
 await q("update public.profiles set privacy_notice_version='anterior',privacy_acknowledged_at='2000-01-01' where id=$1",[b]);
 await asUser(b);
 const renewed=await one('select public.acknowledge_privacy_notice($1) result,now() server_now',[PRIVACY_NOTICE_VERSION]);
 check(renewed.result.privacy_notice_version,PRIVACY_NOTICE_VERSION);
 check(new Date(renewed.result.privacy_acknowledged_at).getTime(),renewed.server_now.getTime());
 await db.exec('reset role');
 check((await one('select count(*)::integer n from public.profiles where id in ($1,$2)',[a,b])).n,2);
 check((await q('select * from public.event_registrations order by id')).rows,registrations);
 check((await q('select * from public.admin_users order by user_id')).rows,roles);
 check((await q('select * from public.admin_scenario_access order by id')).rows,scenarios);
 const fn=await one("select prosecdef,proconfig from pg_proc where oid='public.acknowledge_privacy_notice(text)'::regprocedure");
 check(fn.prosecdef,true);check(fn.proconfig.includes('search_path=""'),true);
 check((await one("select has_function_privilege('authenticated','public.acknowledge_privacy_notice(text)','execute') allowed")).allowed,true);
 check((await one("select has_function_privilege('anon','public.acknowledge_privacy_notice(text)','execute') allowed")).allowed,false);
 console.log(`PASS 007: ${checks} comprobaciones PostgreSQL de reconocimiento, versión, fecha del servidor, aislamiento, folios y roles.`);
}
