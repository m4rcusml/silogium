begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'autor@silogium.test', '{"user_name":"autor"}'),
  ('10000000-0000-4000-8000-000000000002', 'outra@silogium.test', '{"user_name":"outra"}');

insert into public.problems(id, slug, owner_id, origin, visibility, status, title, summary, difficulty, format, runtimes, tags, fingerprint)
values
  ('20000000-0000-4000-8000-000000000001', 'questao-publica', '10000000-0000-4000-8000-000000000001', 'native', 'public', 'published', 'Questão pública', 'Uma questão pública para o teste.', 'easy', 'classic', array['typescript'], array['arrays'], 'rls-public'),
  ('20000000-0000-4000-8000-000000000002', 'questao-privada', '10000000-0000-4000-8000-000000000001', 'native', 'private', 'validated', 'Questão privada', 'Uma questão privada para o teste.', 'easy', 'classic', array['typescript'], array['arrays'], 'rls-private'),
  ('20000000-0000-4000-8000-000000000003', 'questao-nao-listada', '10000000-0000-4000-8000-000000000001', 'native', 'unlisted', 'validated', 'Questão não listada', 'Uma questão não listada para o teste.', 'easy', 'classic', array['python'], array['arrays'], 'rls-unlisted');

select ok((select relrowsecurity from pg_class where oid = 'public.problems'::regclass), 'RLS está ativa em problems');
select ok((select relrowsecurity from pg_class where oid = 'public.problem_versions'::regclass), 'RLS está ativa em problem_versions');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from public.problems), 1::bigint, 'anônimo enxerga somente a questão publicada');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
select is((select count(*) from public.problems), 3::bigint, 'autor enxerga seus rascunhos e a questão pública');
select lives_ok($$update public.profiles set handle = 'autor-editado' where id = '10000000-0000-4000-8000-000000000001'$$, 'usuário altera o próprio handle');
select throws_ok($$update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000001'$$, '42501', null, 'usuário não eleva o próprio papel');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}', true);
select is((select count(*) from public.problems), 1::bigint, 'outro usuário não enxerga rascunhos privados');
select is((select count(*) from public.problems where visibility = 'unlisted'), 0::bigint, 'questão não listada não vaza pela Data API');
select throws_ok($$select * from private.judge_bundles$$, '42501', null, 'bundles do judge não são acessíveis ao usuário');
reset role;

select * from finish();
rollback;
