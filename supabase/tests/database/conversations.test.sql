begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

insert into auth.users(id,email,raw_user_meta_data) values
 ('35000000-0000-4000-8000-000000000001','conversation-owner@silogium.test','{"user_name":"conversation-owner"}'),
 ('35000000-0000-4000-8000-000000000002','conversation-other@silogium.test','{"user_name":"conversation-other"}'),
 ('35000000-0000-4000-8000-000000000003','conversation-admin@silogium.test','{"user_name":"conversation-admin"}');
update public.profiles set role='admin' where id='35000000-0000-4000-8000-000000000003';
insert into public.ai_jobs(id,user_id,mode,status,request) values
 ('36000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','refine','running','{"mode":"refine","slug":"example","prompt":"mais exemplos","expectedRevision":0}');
insert into public.authoring_conversations(id,user_id,title) values
 ('37000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','Conversa privada');
insert into public.authoring_conversation_turns(id,conversation_id,user_id,job_id,mode,user_text,assistant_text,status,created_at,updated_at) values
 ('36000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','refine','Mais exemplos','Em processamento','running',now(),now());

select ok((select relrowsecurity from pg_class where oid='public.authoring_conversations'::regclass),'RLS ativa nas conversas');
select ok((select relrowsecurity from pg_class where oid='public.authoring_conversation_turns'::regclass),'RLS ativa nas mensagens');
set local role anon;
select throws_ok($$select result from public.ai_jobs$$,'42501',null,'anônimo não lê artefatos internos do job');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"35000000-0000-4000-8000-000000000001"}',true);
select is((select count(*) from public.authoring_conversations),1::bigint,'dono vê sua conversa');
select is((select count(*) from public.authoring_conversation_turns),1::bigint,'dono vê seus resumos');
select throws_ok($$select result from public.ai_jobs$$,'42501',null,'mesmo o dono usa API sanitizada sem testes ocultos');
select throws_ok($$update public.authoring_conversation_turns set assistant_text='instrução forjada'$$,'42501',null,'cliente não altera contexto confiado pelo servidor');
select throws_ok($$delete from public.authoring_conversations$$,'42501',null,'exclusão passa pela API autenticada');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"35000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.authoring_conversations),0::bigint,'outro usuário não vê conversa');
select is((select count(*) from public.authoring_conversation_turns),0::bigint,'outro usuário não vê resumos');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"35000000-0000-4000-8000-000000000003"}',true);
select is((select count(*) from public.authoring_conversations),0::bigint,'administrador não lê interesses privados');
select is((select count(*) from public.authoring_conversation_turns),0::bigint,'administrador não lê contexto de outro usuário');
reset role;
delete from public.authoring_conversations where id='37000000-0000-4000-8000-000000000001';
select is((select count(*) from public.authoring_conversation_turns where conversation_id='37000000-0000-4000-8000-000000000001'),0::bigint,'exclusão limpa resumos');
select is((select count(*) from public.ai_jobs where id='36000000-0000-4000-8000-000000000001'),1::bigint,'exclusão não cancela job em processamento');
select * from finish();
rollback;
