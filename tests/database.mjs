import { readFile } from 'node:fs/promises';
import { PGlite } from '../.test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
try {
  // PostgreSQL local: emular solamente los roles y helpers de Supabase Auth.
  // No prueba el servidor Auth, correo ni la configuración del proyecto remoto.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.jwt(),auth.uid() to anon,authenticated;
  `);
  await db.exec(await readFile('supabase/migrations/001_users_events.sql','utf8'));
  console.log('PASS: migración aplicada en PostgreSQL local aislado');
  const results = await db.exec(await readFile('supabase/tests/phase1.sql','utf8'));
  console.log(results.at(-1).rows);
  const checks = await db.exec(await readFile('supabase/verify.sql','utf8'));
  console.log('RLS:', checks[0].rows);
  console.log('Políticas:', checks[1].rows.length);
  console.log('Evento:', checks[3].rows);
  console.log('Secuencia:', checks[5].rows);
  await db.exec(await readFile('supabase/migrations/002_activities_routes.sql','utf8'));
  await db.exec(await readFile('supabase/seeds/002_activities_catalog.sql','utf8'));
  await db.exec(await readFile('supabase/seeds/002_activities_catalog.sql','utf8'));
  console.log('Catálogo:', (await db.query('select count(*) as total,count(*) filter(where status=\'draft\') as drafts from public.activities')).rows);
  const phase2=await db.exec(await readFile('supabase/tests/phase2.sql','utf8'));
  console.log(phase2.at(-1).rows);

  await db.exec(await readFile('supabase/migrations/003_admin_panel.sql','utf8'));
  await db.exec(await readFile('supabase/tests/phase1.sql','utf8'));
  await db.exec(await readFile('supabase/tests/phase2.sql','utf8'));
  console.log('PASS: regresión fases 1 y 2 después de 003');
  await (await import('./admin.mjs')).testAdmin(db);
  await db.exec(await readFile('supabase/migrations/004_admin_activity_editor.sql','utf8'));
  await (await import('./admin-editor.mjs')).testAdminEditor(db);
  await db.exec(await readFile('supabase/migrations/005_admin_scenario_access.sql','utf8'));
  await (await import('./admin-scenarios.mjs')).testAdminScenarios(db);
} finally { await db.close(); }
