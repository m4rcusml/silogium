begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

insert into auth.users(id,email,raw_user_meta_data) values
('51000000-0000-4000-8000-000000000001','editorial-owner@silogium.test','{"user_name":"editorial-owner"}'),
('51000000-0000-4000-8000-000000000002','editorial-other@silogium.test','{"user_name":"editorial-other"}');
insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,fingerprint)
values ('52000000-0000-4000-8000-000000000001','editorial-test','51000000-0000-4000-8000-000000000001','native','public','published','Editorial','Questão de teste editorial','medium','classic',array['typescript'],'editorial-fixture');
insert into public.problem_versions(problem_id,version,definition,created_by) values
('52000000-0000-4000-8000-000000000001',1,'{"status":"published","title":"Publicada"}','51000000-0000-4000-8000-000000000001'),
('52000000-0000-4000-8000-000000000001',2,'{"status":"validated","title":"Privada em revisão"}','51000000-0000-4000-8000-000000000001');
update public.problems set latest_version=2 where id='52000000-0000-4000-8000-000000000001';

select ok(not has_table_privilege('authenticated','private.editorial_records','SELECT'),'cliente não lê materiais privados');
select ok(not has_function_privilege('authenticated','public.save_editorial_record(uuid,integer,jsonb)','EXECUTE'),'cliente não forja CAS');
select ok(not has_function_privilege('authenticated','public.commit_editorial_version(uuid,integer,jsonb,uuid,text,text)','EXECUTE'),'cliente não forja validação');
select ok(not has_function_privilege('authenticated','public.moderate_editorial_review(uuid,uuid,text,text,text)','EXECUTE'),'cliente não aprova diretamente');
select ok(not has_table_privilege('authenticated','public.problem_versions','INSERT'),'cliente não injeta versão publicada');
select ok(not has_table_privilege('authenticated','public.problems','UPDATE'),'cliente não promove status diretamente');

set local role service_role;
select ok(public.save_editorial_record('52000000-0000-4000-8000-000000000001',0,'{"problemId":"52000000-0000-4000-8000-000000000001","revision":1}'),'primeiro save reivindica revisão zero');
select ok(not public.save_editorial_record('52000000-0000-4000-8000-000000000001',0,'{"problemId":"52000000-0000-4000-8000-000000000001","revision":1}'),'save concorrente não sobrescreve');
select ok(public.save_editorial_record('52000000-0000-4000-8000-000000000001',1,'{"problemId":"52000000-0000-4000-8000-000000000001","revision":2}'),'revisão esperada atualiza');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000001"}',true);
select is((select count(*) from public.problem_versions where problem_id='52000000-0000-4000-8000-000000000001'),2::bigint,'proprietário lê snapshots próprios');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.problem_versions where problem_id='52000000-0000-4000-8000-000000000001'),1::bigint,'outro usuário só lê versão publicada');
select throws_ok($$select * from private.editorial_records$$,'42501',null,'rascunho interno não é exposto');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*) from public.problem_versions where problem_id='52000000-0000-4000-8000-000000000001'),1::bigint,'anônimo não lê versão ainda não revisada');
reset role;
update public.problems set visibility='private' where id='52000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.problem_versions where problem_id='52000000-0000-4000-8000-000000000001'),0::bigint,'visibilidade atual protege versões antigas');
reset role;
select is((select revision from private.editorial_records where problem_id='52000000-0000-4000-8000-000000000001'),2,'somente CAS aceito altera revisão');
select * from finish();
rollback;
