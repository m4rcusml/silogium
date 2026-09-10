begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','explicit-owner@silogium.test','{"user_name":"explicit-owner"}'),
 ('c1000000-0000-4000-8000-000000000002','explicit-other@silogium.test','{"user_name":"explicit-other"}');
insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,fingerprint) values
 ('c2000000-0000-4000-8000-000000000001','explicit-public','c1000000-0000-4000-8000-000000000001','native','public','published','Public','Public fixture','easy','classic',array['typescript'],'explicit-public'),
 ('c2000000-0000-4000-8000-000000000002','explicit-private','c1000000-0000-4000-8000-000000000001','native','private','validated','Private','Private fixture','easy','classic',array['typescript'],'explicit-private');
insert into public.problem_versions(problem_id,version,definition,created_by) values
 ('c2000000-0000-4000-8000-000000000001',1,'{"status":"published"}','c1000000-0000-4000-8000-000000000001'),
 ('c2000000-0000-4000-8000-000000000001',2,'{"status":"validated"}','c1000000-0000-4000-8000-000000000001'),
 ('c2000000-0000-4000-8000-000000000002',1,'{"status":"validated"}','c1000000-0000-4000-8000-000000000001');
update public.problems set latest_version=2 where id='c2000000-0000-4000-8000-000000000001';
insert into public.problem_sources(problem_id,source_name,source_url,license_spdx,retrieved_at) values
 ('c2000000-0000-4000-8000-000000000001','Fixture','https://example.test/public','MIT',now()),
 ('c2000000-0000-4000-8000-000000000002','Fixture','https://example.test/private','MIT',now());

select ok(not has_function_privilege('anon','private.is_admin()','EXECUTE'),'anônimo continua sem executar helper privado');
select ok(not has_schema_privilege('anon','private','USAGE'),'schema privado permanece fora do acesso anônimo');
select ok(not has_table_privilege('authenticated','public.ai_jobs','SELECT'),'jobs brutos continuam reservados à API sanitizada');
select ok(not has_table_privilege('anon','public.personal_workspaces','SELECT'),'biblioteca privada não é concedida ao anônimo');
select ok(not has_table_privilege('anon','public.community_posts','SELECT'),'posts brutos seguem privados mesmo quando aprovados');
select ok(not has_table_privilege('authenticated','public.problems','INSERT'),'cliente não insere questões diretamente');
select ok(not has_table_privilege('authenticated','public.problem_versions','UPDATE'),'cliente não altera snapshots');
select ok(not has_table_privilege('authenticated','public.submissions','INSERT'),'cliente não forja resultado de submissão');
select ok(not has_table_privilege('authenticated','public.api_tokens','INSERT'),'tokens são emitidos somente pelo servidor');
select ok(not has_column_privilege('authenticated','public.profiles','role','UPDATE'),'perfil não permite elevação administrativa');
select ok(has_column_privilege('authenticated','public.profiles','handle','UPDATE'),'edição do handle continua disponível');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*) from public.problems),1::bigint,'anônimo lê catálogo sem chamar helper proibido');
select is((select count(*) from public.problem_versions),1::bigint,'anônimo lê só versão publicada, não rascunho em revisão');
select is((select count(*) from public.problem_sources),1::bigint,'atribuição pública funciona sem avaliar policy administrativa');
select throws_ok($$select private.is_admin()$$,'42501',null,'chamada direta ao helper privado permanece proibida');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}',true);
select is((select count(*) from public.problems),2::bigint,'dono lê pública e privada com grants explícitos');
select is((select count(*) from public.problem_versions),3::bigint,'dono lê revisões próprias');
select is((select count(*) from public.problem_sources),2::bigint,'dono lê atribuição de questão privada');
select lives_ok($$update public.profiles set handle='explicit-owner-updated' where id='c1000000-0000-4000-8000-000000000001'$$,'grant por coluna permite alterar o próprio handle');
select throws_ok($$update public.profiles set role='admin' where id='c1000000-0000-4000-8000-000000000001'$$,'42501',null,'grant por coluna não permite mudar role');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.problems),1::bigint,'grants não anulam isolamento por proprietário');
select is((select count(*) from public.problem_versions),1::bigint,'outra conta não vê a revisão privada da questão pública');
reset role;

-- Verify adapter operations under the actual database role, not only ACL strings.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from public.problems),2::bigint,'servidor lê dados necessários sem depender de defaults');
select lives_ok($$insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,fingerprint)
 values('c2000000-0000-4000-8000-000000000003','explicit-server','c1000000-0000-4000-8000-000000000001','native','private','validated','Server','Server fixture','easy','classic',array['python'],'explicit-server')$$,'servidor insere questão');
select lives_ok($$insert into public.problem_versions(problem_id,version,definition,created_by)
 values('c2000000-0000-4000-8000-000000000003',1,'{"status":"validated"}','c1000000-0000-4000-8000-000000000001')$$,'servidor insere snapshot');
select lives_ok($$update public.problems set title='Server updated' where id='c2000000-0000-4000-8000-000000000003'$$,'servidor atualiza metadados');
select is((select title from public.problems where id='c2000000-0000-4000-8000-000000000003'),'Server updated','escrita do servidor foi aplicada');
select lives_ok($$insert into public.api_tokens(user_id,token_hash,prefix,expires_at)
 values('c1000000-0000-4000-8000-000000000001','explicit-test-token-hash','sil_test',now()+interval '1 day')$$,'servidor persiste token');
select lives_ok($$insert into public.personal_workspaces(user_id,revision,state)
 values('c1000000-0000-4000-8000-000000000001',1,'{"revision":1}')$$,'servidor persiste biblioteca');
select lives_ok($$insert into public.community_posts(id,problem_id,problem_version,author_id,status,content,created_at,updated_at)
 values('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003',1,'c1000000-0000-4000-8000-000000000001','pending','{}',now(),now())$$,'servidor persiste contribuição');
select lives_ok($$delete from public.community_posts where id='c3000000-0000-4000-8000-000000000001'$$,'servidor exclui registro do fluxo administrativo');
reset role;

select * from finish();
rollback;
