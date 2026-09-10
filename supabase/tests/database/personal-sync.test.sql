begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users(id,email,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','personal-sync@silogium.test','{"user_name":"personal-sync"}');
insert into public.problems(id,slug,owner_id,origin,visibility,status,title,summary,difficulty,format,runtimes,fingerprint)
values ('92000000-0000-4000-8000-000000000001','personal-sync-fixture','91000000-0000-4000-8000-000000000001','native','private','validated','Fixture','A private fixture','easy','classic',array['typescript'],'personal-sync-fixture');
insert into public.problem_versions(problem_id,version,definition,created_by)
values ('92000000-0000-4000-8000-000000000001',1,'{"status":"validated"}','91000000-0000-4000-8000-000000000001');

select ok(not has_function_privilege('authenticated','public.save_personal_workspace_for(uuid,integer,jsonb)','EXECUTE'),'cliente não altera biblioteca diretamente');
select ok(not has_function_privilege('authenticated','public.save_solution_draft_for(uuid,uuid,integer,text,integer,jsonb)','EXECUTE'),'cliente não altera snapshot diretamente');
set local role service_role;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.save_personal_workspace_for('91000000-0000-4000-8000-000000000001',0,'{"revision":1}')$$,'P0001','service role required','role ausente não satisfaz guard da biblioteca');
select throws_ok($$select public.save_solution_draft_for('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1,'typescript',0,'{}')$$,'P0001','service role required','role ausente não satisfaz guard do snapshot');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(public.save_personal_workspace_for('91000000-0000-4000-8000-000000000001',0,'{"revision":1}'),'primeiro CAS salva biblioteca');
select ok(not public.save_personal_workspace_for('91000000-0000-4000-8000-000000000001',0,'{"revision":1}'),'CAS antigo não sobrescreve biblioteca');
select throws_ok($$select public.save_personal_workspace_for('91000000-0000-4000-8000-000000000001',null,'{"revision":2}')$$,'P0001','invalid workspace','revisão NULL é recusada');
select throws_ok($$select public.save_personal_workspace_for('91000000-0000-4000-8000-000000000001',1,'{}')$$,'P0001','invalid revision','estado sem revisão é recusado');
select ok(public.save_solution_draft_for('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1,'typescript',0,'{"source":""}'),'primeiro CAS salva snapshot');
select ok(not public.save_solution_draft_for('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1,'typescript',0,'{"source":"stale"}'),'CAS antigo não sobrescreve snapshot');
select throws_ok($$select public.save_solution_draft_for('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1,'typescript',null,'{}')$$,'P0001','invalid draft','revisão NULL de snapshot é recusada');
select throws_ok($$select public.save_solution_draft_for('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',1,'typescript',1,null)$$,'P0001','invalid draft','snapshot NULL é recusado');
reset role;
select * from finish();
rollback;
