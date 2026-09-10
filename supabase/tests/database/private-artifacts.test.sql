begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','private-artifacts@silogium.test','{"user_name":"private-artifacts"}');
insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,fingerprint)
values ('b1000000-0000-4000-8000-000000000001','private-artifacts-fixture','a1000000-0000-4000-8000-000000000001','native','private','validated','Private artifacts','Fixture','easy','classic',array['typescript'],'private-artifacts-fixture');
insert into public.problem_versions(problem_id,version,definition,created_by)
values ('b1000000-0000-4000-8000-000000000001',1,'{"status":"validated"}','a1000000-0000-4000-8000-000000000001');
insert into private.editorial_records(problem_id,revision,record)
values ('b1000000-0000-4000-8000-000000000001',2,'{"revision":2,"private":"editorial-reference"}');

select ok(not has_function_privilege('anon','public.read_private_judge_bundle(uuid,integer)','EXECUTE'),'anônimo não lê bundle via RPC');
select ok(not has_function_privilege('authenticated','public.read_private_judge_bundle(uuid,integer)','EXECUTE'),'usuário não lê bundle via RPC');
select ok(not has_function_privilege('authenticated','public.insert_private_judge_bundle(uuid,integer,jsonb,text,jsonb)','EXECUTE'),'usuário não injeta judge via RPC');
select ok(not has_function_privilege('anon','public.read_private_editorial_record(uuid)','EXECUTE'),'anônimo não lê autoria via RPC');
select ok(not has_table_privilege('authenticated','private.judge_bundles','SELECT'),'tabela privada permanece sem leitura pelo cliente');

set local role service_role;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.read_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1)$$,'P0001','service role required','role NULL não satisfaz guard de leitura');
select throws_ok($$select public.insert_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1,'{}',repeat('a',64),null)$$,'P0001','service role required','role NULL não satisfaz guard de inserção');
select throws_ok($$select public.read_private_editorial_record('b1000000-0000-4000-8000-000000000001')$$,'P0001','service role required','role NULL não satisfaz guard editorial');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.read_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1),null::jsonb,'bundle ausente retorna NULL sem expor schema');
select is(public.read_private_editorial_record('b1000000-0000-4000-8000-000000000001')->>'revision','2','servidor lê registro privado');
select lives_ok($$select public.insert_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1,'{"schemaVersion":1,"problemId":"b1000000-0000-4000-8000-000000000001","problemVersion":1,"visibleCases":[],"hiddenCases":[],"referenceSolutions":{"typescript":"private-reference"}}',repeat('a',64),'{"valid":true,"checks":[]}')$$,'servidor insere bundle e relatório');
select is(public.read_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1)#>>'{bundle,referenceSolutions,typescript}','private-reference','leitura interna preserva referência');
select is(public.read_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1)#>>'{validation,valid}','true','leitura interna preserva relatório');
select throws_ok($$select public.insert_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1,'{"schemaVersion":1,"problemId":"b1000000-0000-4000-8000-000000000001","problemVersion":1}',repeat('b',64),null)$$,'23505',null,'INSERT duplicado não sobrescreve versão imutável');
select throws_ok($$select public.insert_private_judge_bundle('b1000000-0000-4000-8000-000000000001',1,'{"schemaVersion":1,"problemId":"b1000000-0000-4000-8000-000000000002","problemVersion":1}',repeat('a',64),null)$$,'P0001','bundle identity mismatch','identidade divergente é recusada');
select throws_ok($$select public.read_private_judge_bundle('b1000000-0000-4000-8000-000000000001',null)$$,'P0001','invalid problem version','versão NULL é recusada');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.read_private_editorial_record('b1000000-0000-4000-8000-000000000001')$$,'42501',null,'até o proprietário passa pelo opt-in autorizado da API');
reset role;
select * from finish();
rollback;
