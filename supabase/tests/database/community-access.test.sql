-- Prepared contract tests for migrations 006-008. Requires the local Supabase
-- database; this file does not claim those migrations have been executed.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','community-owner@silogium.test','{"user_name":"community-owner"}'),
 ('a1000000-0000-4000-8000-000000000002','community-other@silogium.test','{"user_name":"community-other"}'),
 ('a1000000-0000-4000-8000-000000000003','community-admin@silogium.test','{"user_name":"community-admin"}');
update public.profiles set role='admin' where id='a1000000-0000-4000-8000-000000000003';
insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,fingerprint)
values ('a2000000-0000-4000-8000-000000000001','community-access-fixture','a1000000-0000-4000-8000-000000000001','native','public','published','Community fixture','Public problem, private drafts.','easy','classic',array['typescript'],'community-access-fixture');
insert into public.problem_versions(problem_id,version,definition,created_by)
values ('a2000000-0000-4000-8000-000000000001',1,'{"status":"published"}','a1000000-0000-4000-8000-000000000001');
insert into public.personal_workspaces(user_id,revision,state)
values ('a1000000-0000-4000-8000-000000000001',1,'{"revision":1,"favorites":["a2000000-0000-4000-8000-000000000001"],"profile":{"shared":true,"displayName":"Public name","bio":"Public bio"}}');
insert into public.solution_drafts(user_id,problem_id,problem_version,runtime,revision,snapshot)
values ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',1,'typescript',1,'{"source":"private source","preferences":{"customTests":"private tests"}}');

create temporary table community_test_payload(value jsonb);
insert into community_test_payload values ('{
 "id":"a3000000-0000-4000-8000-000000000001",
 "problemId":"a2000000-0000-4000-8000-000000000001","problemVersion":1,
 "authorId":"a1000000-0000-4000-8000-000000000001","authorHandle":"community-owner",
 "kind":"hint","title":"Text A","body":"Pending private body","status":"pending",
 "createdAt":"2026-09-09T12:00:00.000Z","updatedAt":"2026-09-09T12:00:00.000Z"
}');
grant select on community_test_payload to service_role;
insert into public.community_posts(id,problem_id,problem_version,author_id,status,content,created_at,updated_at)
select (value->>'id')::uuid,(value->>'problemId')::uuid,1,(value->>'authorId')::uuid,'pending',value,'2026-09-09T12:00:00Z','2026-09-09T12:00:00Z' from community_test_payload;
insert into public.community_posts(id,problem_id,problem_version,author_id,status,content,created_at,updated_at)
select 'a3000000-0000-4000-8000-000000000002',(value->>'problemId')::uuid,1,(value->>'authorId')::uuid,'approved',
 value || '{"id":"a3000000-0000-4000-8000-000000000002","status":"approved","reason":"Private review reason"}'::jsonb,
 '2026-09-09T12:00:00Z','2026-09-09T12:00:00Z' from community_test_payload;
insert into public.community_reports(post_id,user_id,reason)
values ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','Private report reason');

-- Either privilege denial or an empty RLS result is a valid anonymous denial.
-- Keep this invoker-only: it must not gain the fixture owner's privileges.
create function pg_temp.visible_rows(target regclass) returns bigint language plpgsql security invoker as $$
declare result bigint;
begin
  execute format('select count(*) from %s', target) into result;
  return result;
exception when insufficient_privilege then return 0;
end;
$$;

select ok((select relrowsecurity from pg_class where oid='public.personal_workspaces'::regclass),'RLS ativa na biblioteca pessoal');
select ok((select relrowsecurity from pg_class where oid='public.solution_drafts'::regclass),'RLS ativa nos rascunhos sincronizados');
select ok((select relrowsecurity from pg_class where oid='public.community_posts'::regclass),'RLS ativa nas contribuições');
select ok((select relrowsecurity from pg_class where oid='public.community_reports'::regclass),'RLS ativa nas denúncias');
select ok(not has_function_privilege('authenticated','public.save_community_post_for(uuid,jsonb,timestamptz)','EXECUTE'),'cliente não invoca escrita/moderação privilegiada');
select ok(not has_function_privilege('anon','public.save_community_post_for(uuid,jsonb,timestamptz)','EXECUTE'),'anônimo não invoca escrita/moderação privilegiada');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(pg_temp.visible_rows('public.personal_workspaces'),0::bigint,'perfil compartilhado não torna a biblioteca bruta pública');
select is(pg_temp.visible_rows('public.solution_drafts'),0::bigint,'questão pública não torna código e testes próprios públicos');
select is(pg_temp.visible_rows('public.community_posts'),0::bigint,'anônimo não lê DTO bruto, nem mesmo de contribuições aprovadas');
select is(pg_temp.visible_rows('public.community_reports'),0::bigint,'anônimo não lê denúncias');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',true);
select is((select count(*) from public.personal_workspaces),1::bigint,'proprietário lê somente sua biblioteca');
select is((select snapshot->>'source' from public.solution_drafts),'private source','proprietário recupera o próprio código');
select is((select count(*) from public.community_posts),2::bigint,'autor lê seus textos pendentes e aprovados');
select is((select count(*) from public.community_reports),0::bigint,'autor não descobre denunciante ou denúncia privada');
select throws_ok($$update public.personal_workspaces set state='{}'$$,'42501',null,'cliente não contorna CAS da biblioteca');
select throws_ok($$update public.solution_drafts set snapshot='{}'$$,'42501',null,'cliente não contorna CAS do rascunho');
select throws_ok($$update public.community_posts set status='approved'$$,'42501',null,'autor não aprova texto por escrita direta');
select throws_ok($$select public.save_community_post_for('a1000000-0000-4000-8000-000000000001','{}',null)$$,'42501',null,'autor não chama RPC de moderação diretamente');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.personal_workspaces),0::bigint,'outra conta não lê biblioteca compartilhada apenas por DTO');
select is((select count(*) from public.solution_drafts),0::bigint,'outra conta não lê solução para uma questão pública');
select is((select count(*) from public.community_posts),0::bigint,'outra conta não lê pendentes ou motivos privados de posts aprovados');
select is((select count(*) from public.community_reports),0::bigint,'denunciante não recebe dados brutos de denúncias');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000003"}',true);
select is((select count(*) from public.community_posts),2::bigint,'administrador pode revisar contribuições');
select is((select count(*) from public.community_reports),1::bigint,'administrador pode revisar denúncias');
select is((select count(*) from public.personal_workspaces),0::bigint,'papel administrativo não publica nem abre bibliotecas pessoais');
select is((select count(*) from public.solution_drafts),0::bigint,'papel administrativo não concede leitura direta de rascunhos alheios');
reset role;

set local role service_role;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.save_community_post_for('a1000000-0000-4000-8000-000000000001',value,'2026-09-09T12:00:00Z') from community_test_payload$$,'P0001','service role required','guard da comunidade falha fechado quando role está ausente');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select public.save_community_post_for('a1000000-0000-4000-8000-000000000002',value,'2026-09-09T12:00:00Z') from community_test_payload$$,'P0001','not allowed','backend também recusa ator que não é autor nem administrador');
select throws_ok($$select public.save_community_post_for('a1000000-0000-4000-8000-000000000001',value || '{"status":"approved"}'::jsonb,'2026-09-09T12:00:00Z') from community_test_payload$$,'P0001','review required','autor não pode se autoaprovar via RPC');
select ok(not public.save_community_post_for('a1000000-0000-4000-8000-000000000001',value,null),'revisão ausente não substitui post existente') from community_test_payload;
select ok(public.save_community_post_for('a1000000-0000-4000-8000-000000000001',value || '{"body":"Text B, not reviewed","updatedAt":"2026-09-09T12:00:01.000Z"}'::jsonb,'2026-09-09T12:00:00Z'),'autor edita com CAS da versão observada') from community_test_payload;
select ok(not public.save_community_post_for('a1000000-0000-4000-8000-000000000003',value || '{"status":"approved","updatedAt":"2026-09-09T12:00:02.000Z"}'::jsonb,'2026-09-09T12:00:00Z'),'aprovação de A não publica nem sobrescreve B') from community_test_payload;
select is((select status from public.community_posts where id='a3000000-0000-4000-8000-000000000001'),'pending','texto B continua pendente após conflito');
select is((select content->>'body' from public.community_posts where id='a3000000-0000-4000-8000-000000000001'),'Text B, not reviewed','CAS preserva conteúdo novo');
insert into public.community_reports(post_id,user_id,reason) values ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','Report cleared with decision');
select ok(public.save_community_post_for('a1000000-0000-4000-8000-000000000003',value || '{"body":"Text B, not reviewed","status":"approved","updatedAt":"2026-09-09T12:00:02.000Z"}'::jsonb,'2026-09-09T12:00:01Z'),'administrador aprova exatamente a revisão atual') from community_test_payload;
select is((select count(*) from public.community_reports where post_id='a3000000-0000-4000-8000-000000000001'),0::bigint,'moderação limpa denúncias da mesma contribuição na transação');
select is((select count(*) from public.community_reports where post_id='a3000000-0000-4000-8000-000000000002'),1::bigint,'moderação não apaga denúncias de outra contribuição');
select ok(public.save_community_post_for('a1000000-0000-4000-8000-000000000001',value || '{"title":"Removed","body":"Removed by author","status":"removed","updatedAt":"2026-09-09T12:00:03.000Z"}'::jsonb,'2026-09-09T12:00:02Z'),'autor remove somente a revisão atual') from community_test_payload;
select throws_ok($$select public.save_community_post_for('a1000000-0000-4000-8000-000000000003',value || '{"status":"approved"}'::jsonb,'2026-09-09T12:00:03Z') from community_test_payload$$,'P0001','removed post is immutable','nem administrador republica contribuição removida');
reset role;

select * from finish();
rollback;
