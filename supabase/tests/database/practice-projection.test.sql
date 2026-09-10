begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users(id,email,raw_user_meta_data) values
 ('74000000-0000-4000-8000-000000000001','projection-owner@silogium.test','{"user_name":"projection-owner"}'),
 ('74000000-0000-4000-8000-000000000002','projection-other@silogium.test','{"user_name":"projection-other"}');

create temporary table projection_payload(label text primary key, value jsonb);
insert into projection_payload values
 ('empty','{"userId":"74000000-0000-4000-8000-000000000001","historyComplete":true,"sourceExecutionCount":0,"milestones":[],"completions":[],"achievements":[]}'),
 ('complete','{
   "userId":"74000000-0000-4000-8000-000000000001","historyComplete":true,"sourceExecutionCount":2,
   "milestones":[{"canonicalProblemId":"projection-fixture","runtime":"typescript","kind":"problem_completed","occurredAt":"2026-09-10T12:00:00Z"}],
   "completions":[{"problemId":"75000000-0000-4000-8000-000000000001","problemVersion":1,"runtime":"typescript","occurredAt":"2026-09-10T12:00:00Z"}],
   "achievements":[{"id":"first_solution","awardedAt":"2026-09-10T12:00:00Z"}]
 }');
grant select on projection_payload to service_role;

select ok(not has_function_privilege('anon','public.store_practice_projection(uuid,jsonb)','EXECUTE'),'RPC não concede EXECUTE a anônimo');
select ok(not has_function_privilege('authenticated','public.store_practice_projection(uuid,jsonb)','EXECUTE'),'RPC não concede EXECUTE a usuário autenticado');
select ok(has_function_privilege('service_role','public.store_practice_projection(uuid,jsonb)','EXECUTE'),'backend mantém EXECUTE');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001','{}')$$,'42501',null,'anônimo não pode gravar projeções');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001','{}')$$,'42501',null,'nem o proprietário pode forjar progresso via RPC');
reset role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001','{}')$$,'42501',null,'defesa interna também exige claim service_role');
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- The first real RPC already failed with SQLSTATE 42702 before migration 013.
-- Named arguments match the PostgREST call used by getPracticeOverview.
select lives_ok($$select public.store_practice_projection(requested_user => '74000000-0000-4000-8000-000000000001', projection => value) from projection_payload where label='empty'$$,'primeiro acesso ao perfil persiste histórico vazio sem ambiguidade');
select is((select projection from public.practice_projections where user_id='74000000-0000-4000-8000-000000000001'),(select value from projection_payload where label='empty'),'snapshot vazio preserva o argumento JSON recebido');
select lives_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001',value) from projection_payload where label='empty'$$,'repetir acesso ao perfil vazio é seguro');
select is((select count(*) from public.practice_projections where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'replay mantém uma única projeção');

select lives_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001',value) from projection_payload where label='complete'$$,'snapshot posterior percorre atualização e todos os laços de evidências');
select is((select projection from public.practice_projections where user_id='74000000-0000-4000-8000-000000000001'),(select value from projection_payload where label='complete'),'atualização guarda o novo argumento, não o valor anterior da coluna');
select is((select count(*) from public.practice_milestones where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'marco persistido');
select is((select count(*) from public.problem_completions where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'conclusão persistida');
select is((select count(*) from public.user_achievements where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'conquista persistida');
select lives_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001',value) from projection_payload where label='complete'$$,'replay de snapshot completo não falha');
select is((select count(*) from public.practice_milestones where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'replay não duplica marcos');
select is((select count(*) from public.problem_completions where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'replay não duplica conclusões');
select is((select count(*) from public.user_achievements where user_id='74000000-0000-4000-8000-000000000001'),1::bigint,'replay não duplica conquistas');
select lives_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001',value) from projection_payload where label='empty'$$,'snapshot obsoleto é ignorado sem erro');
select is((select projection from public.practice_projections where user_id='74000000-0000-4000-8000-000000000001'),(select value from projection_payload where label='complete'),'snapshot obsoleto não apaga progresso mais recente');
select throws_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000002',value) from projection_payload where label='complete'$$,'P0001','incomplete projection','usuário do snapshot deve corresponder ao destinatário');
select throws_ok($$select public.store_practice_projection('74000000-0000-4000-8000-000000000001',jsonb_set(value,'{historyComplete}','false')) from projection_payload where label='complete'$$,'P0001','incomplete projection','histórico incompleto continua recusado');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000001"}',true);
select is((select count(*) from public.practice_projections),1::bigint,'proprietário lê a projeção persistida');
select throws_ok($$update public.practice_projections set projection='{}'$$,'42501',null,'cliente não edita projeção diretamente');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.practice_projections),0::bigint,'outro usuário não lê a projeção privada');
reset role;

select * from finish();
rollback;
