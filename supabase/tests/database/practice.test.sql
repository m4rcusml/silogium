begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

insert into auth.users(id,email,raw_user_meta_data) values
 ('71000000-0000-4000-8000-000000000001','practice-owner@silogium.test','{"user_name":"practice-owner"}'),
 ('71000000-0000-4000-8000-000000000002','practice-other@silogium.test','{"user_name":"practice-other"}');
insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,tags,fingerprint)
values('72000000-0000-4000-8000-000000000001','practice-private','71000000-0000-4000-8000-000000000001','native','private','validated','Practice private','A private fixture for history tests.','easy','classic',array['typescript'],array['arrays'],'practice-history-fixture');
insert into public.problem_versions(problem_id,version,definition,created_by) values
 ('72000000-0000-4000-8000-000000000001',1,'{"status":"validated"}','71000000-0000-4000-8000-000000000001');
insert into public.practice_settings(user_id,settings) values ('71000000-0000-4000-8000-000000000001','{"preferences":{"timeZone":"UTC","goalDays":null},"showProgress":true,"weeks":[]}');

select ok((select relrowsecurity from pg_class where oid='public.practice_settings'::regclass),'RLS ativa nas preferências');
select ok((select relrowsecurity from pg_class where oid='public.practice_milestones'::regclass),'RLS ativa nos marcos');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.practice_settings$$,'42501',null,'anônimo não lê metas');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}',true);
select is((select count(*) from public.practice_settings),1::bigint,'proprietário lê sua meta');
select throws_ok($$update public.practice_settings set settings='{}'$$,'42501',null,'cliente não altera snapshots diretamente');
select throws_ok($$select public.finalize_practice_submission('{}')$$,'42501',null,'cliente não pode forjar evidência ou veredito');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.practice_settings),0::bigint,'outro usuário não lê metas privadas');
reset role;

create temporary table practice_payload(value jsonb);
insert into practice_payload values ('{
 "id":"73000000-0000-4000-8000-000000000001","user_id":"71000000-0000-4000-8000-000000000001",
 "problem_id":"72000000-0000-4000-8000-000000000001","problem_version":1,"runtime":"typescript","kind":"submission",
 "source":"console.log(42)","max_stage":1,"verdict":"accepted","score":100,"max_score":100,"duration_ms":10,
 "result":{"id":"73000000-0000-4000-8000-000000000001","verdict":"accepted","score":100,"maxScore":100,"durationMs":10,"cases":[]},
 "practice_evidence":null,"created_at":"2026-09-09T12:00:00.000Z"
}');
grant select on practice_payload to service_role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.finalize_practice_submission(value) from practice_payload$$,'backend persiste resultado e outbox');
select lives_ok($$select public.finalize_practice_submission(value) from practice_payload$$,'replay é idempotente');
select throws_ok($$select public.finalize_practice_submission(jsonb_set(value,'{source}','"changed"')) from practice_payload$$,'P0001',null,'ID existente não pode trocar código');
reset role;
select is((select count(*) from private.practice_outbox where submission_id='73000000-0000-4000-8000-000000000001'),1::bigint,'outbox não duplica eventos');
select is((select max_stage from public.submissions where id='73000000-0000-4000-8000-000000000001'),1,'corte de estágio preservado');
select is((select practice_evidence from public.submissions where id='73000000-0000-4000-8000-000000000001'),null::jsonb,'legado não vira oficial pelo veredito accepted');
select * from finish();
rollback;
