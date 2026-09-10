-- Prepared pgTAP contracts. This file must run against migrated PostgreSQL;
-- mocked TypeScript tests do not substitute for these transaction/RLS checks.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','worker-owner@silogium.test','{"user_name":"worker-owner"}'),
 ('a1000000-0000-4000-8000-000000000002','worker-other@silogium.test','{"user_name":"worker-other"}');
create temporary table worker_payload(name text primary key, value jsonb);
grant all on worker_payload to service_role;
insert into worker_payload values ('enqueue','{
 "actorId":"a1000000-0000-4000-8000-000000000001",
 "job":{"id":"b1000000-0000-4000-8000-000000000001","actorId":"a1000000-0000-4000-8000-000000000001","status":"running","createdAt":"2026-09-10T00:00:00Z",
 "request":{"mode":"create","prompt":"Worker fixture","runtime":"typescript","format":"classic","difficulty":"easy","visibility":"private"}}
}');

select ok(not has_function_privilege('anon','public.authoring_queue(text,jsonb)','EXECUTE'),'anônimo não opera a fila');
select ok(not has_function_privilege('authenticated','public.authoring_queue(text,jsonb)','EXECUTE'),'usuário não forja leases nem reserva cota');
select ok(not has_table_privilege('authenticated','private.authoring_tasks','SELECT'),'checkpoint privado não é legível pelo usuário');
select ok(not has_table_privilege('anon','private.authoring_tasks','SELECT'),'checkpoint privado não é público');
select ok((select relrowsecurity from pg_class where oid='private.authoring_tasks'::regclass),'RLS ativa na fila');

set local role service_role;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.authoring_queue('claim','{"workerId":"test","leaseSeconds":120}')$$,'P0001','service role required','role ausente falha fechada');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.authoring_queue('enqueue',(select value from worker_payload where name='enqueue')),'true'::jsonb,'job e tarefa criados juntos');
select is(public.authoring_queue('enqueue',(select value from worker_payload where name='enqueue')),'true'::jsonb,'replay de enqueue é idempotente');
select is((select count(*) from private.authoring_tasks),1::bigint,'um único registro de fila');
select throws_ok($$select public.authoring_queue('enqueue',jsonb_set((select value from worker_payload where name='enqueue'),'{actorId}','"a1000000-0000-4000-8000-000000000002"'))$$,'P0001','invalid queued job','identidade divergente é recusada');

insert into worker_payload values ('lease1',public.authoring_queue('claim','{"workerId":"one","leaseSeconds":30}'));
select is((select value->>'attempt' from worker_payload where name='lease1'),'1','primeira tentativa é contada');
select is((select value#>>'{actor,id}' from worker_payload where name='lease1'),'a1000000-0000-4000-8000-000000000001','ator vem do perfil no banco');
select is(public.authoring_queue('claim','{"workerId":"two","leaseSeconds":30}'),null::jsonb,'outra claim não rouba lease vigente');
select is(public.authoring_queue('heartbeat','{"jobId":"b1000000-0000-4000-8000-000000000001","token":"c1000000-0000-4000-8000-000000000099","leaseSeconds":30}'),'false'::jsonb,'token incorreto é recusado');
insert into worker_payload values ('fence',(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from worker_payload where name='lease1'));
select is(public.authoring_queue('checkpoint',(select value || '{"key":"generated","value":{"reference":"PRIVATE_SENTINEL"}}'::jsonb from worker_payload where name='fence')),'true'::jsonb,'checkpoint privado persistido');
select is(public.authoring_queue('checkpoint',(select value || '{"key":"generated","value":{"reference":"OVERWRITE"}}'::jsonb from worker_payload where name='fence')),'true'::jsonb,'replay de checkpoint é aceito sem sobrescrita');
select is((select checkpoints#>>'{generated,reference}' from private.authoring_tasks),'PRIVATE_SENTINEL','primeiro checkpoint prevalece');
select is(public.authoring_queue('reserve_ai',(select value from worker_payload where name='fence')),'true'::jsonb,'primeira reserva de cota');
select is(public.authoring_queue('reserve_ai',(select value from worker_payload where name='fence')),'true'::jsonb,'reserva repetida do mesmo job é idempotente');
reset role;
select is((select daily_count from private.usage_counters where user_id='a1000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date),1,'cota consumida uma vez');
set local role service_role;
update private.authoring_tasks set lease_until=clock_timestamp()-interval '1 second';
select is(public.authoring_queue('heartbeat',(select value || '{"leaseSeconds":30}'::jsonb from worker_payload where name='fence')),'false'::jsonb,'lease expirado não é renovado');
insert into worker_payload values ('lease2',public.authoring_queue('claim','{"workerId":"two","leaseSeconds":30}'));
select is((select value->>'attempt' from worker_payload where name='lease2'),'2','morte do processo incrementa tentativa na retomada');
select is((select value#>>'{checkpoints,generated,reference}' from worker_payload where name='lease2'),'PRIVATE_SENTINEL','novo worker recebe checkpoint');
select is(public.authoring_queue('retry',(select value || '{"error":"stale","permanent":true}'::jsonb from worker_payload where name='fence')),'false'::jsonb,'worker antigo não marca falha no novo');
update worker_payload set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from worker_payload where name='lease2') where name='fence';

insert into worker_payload values ('outcome','{
 "job":{"id":"b1000000-0000-4000-8000-000000000001","actorId":"a1000000-0000-4000-8000-000000000001","status":"completed",
   "result":{"kind":"create","package":{"problem":{"id":"d1000000-0000-4000-8000-000000000001"},"bundle":{"private":"PRIVATE_SENTINEL"},"validation":{"valid":true}}}},
 "effects":{"package":{
   "problem":{"id":"d1000000-0000-4000-8000-000000000001","version":1,"slug":"worker-atomic-fixture","title":"Worker fixture","summary":"Fixture","origin":"native","visibility":"private","status":"validated","difficulty":"easy","format":"classic","runtimes":[{"language":"typescript"}],"tags":[],"provenance":{"kind":"native","createdBy":"a1000000-0000-4000-8000-000000000001"},"createdAt":"2026-09-10T00:00:00Z","updatedAt":"2026-09-10T00:00:00Z"},
   "bundle":{"schemaVersion":1,"problemId":"d1000000-0000-4000-8000-000000000001","problemVersion":1,"visibleCases":[],"hiddenCases":[],"referenceSolutions":{"typescript":"PRIVATE_SENTINEL"}},
   "validation":{"valid":true},"fingerprint":"worker-atomic-fixture","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
}');
select throws_ok($$select public.authoring_queue('finish',(select value from worker_payload where name='fence') || jsonb_build_object('outcome',jsonb_set((select value from worker_payload where name='outcome'),'{effects,package,bundle,problemVersion}','2')))$$,'P0001','bundle identity mismatch','falha no bundle aborta toda a transação de conclusão');
select is((select count(*) from public.problems where slug='worker-atomic-fixture'),0::bigint,'não fica questão parcialmente gravada');
select is((select status::text from public.ai_jobs where id='b1000000-0000-4000-8000-000000000001'),'running','job não conclui quando efeito falha');
select is(public.authoring_queue('finish',(select value from worker_payload where name='fence') || jsonb_build_object('outcome',(select value from worker_payload where name='outcome'))),'true'::jsonb,'conteúdo e job concluem juntos');
select is((select count(*) from public.problem_versions where problem_id='d1000000-0000-4000-8000-000000000001'),1::bigint,'versão única materializada');
select is((select bundle#>>'{referenceSolutions,typescript}' from private.judge_bundles where problem_id='d1000000-0000-4000-8000-000000000001'),'PRIVATE_SENTINEL','referência fica no armazenamento privado');
select ok((select result::text not like '%PRIVATE_SENTINEL%' from public.ai_jobs where id='b1000000-0000-4000-8000-000000000001'),'resultado do job não copia bundle');
select is((select checkpoints from private.authoring_tasks),'{}'::jsonb,'checkpoints removidos depois de concluir');
select is(public.authoring_queue('finish',(select value from worker_payload where name='fence') || jsonb_build_object('outcome',(select value from worker_payload where name='outcome'))),'false'::jsonb,'replay de conclusão não reaplica efeitos');
select is(public.authoring_queue('claim','{"workerId":"three","leaseSeconds":30}'),null::jsonb,'job concluído não é reivindicado novamente');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.authoring_queue('claim','{"workerId":"forged","leaseSeconds":30}')$$,'42501',null,'até proprietário não pode operar worker via RPC');
select throws_ok($$select * from private.authoring_tasks$$,'42501',null,'proprietário não lê checkpoints diretamente');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.problems where slug='worker-atomic-fixture'),0::bigint,'outro usuário não lê questão privada gerada');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Fill the owner's three active slots, without invoking AI or charging a quota.
do $$
declare payload jsonb; number integer;
begin
  for number in 1..3 loop
    payload := (select value from worker_payload where name='enqueue');
    payload := jsonb_set(payload,'{job,id}',to_jsonb(gen_random_uuid()::text));
    perform public.authoring_queue('enqueue',payload);
  end loop;
end;
$$;
insert into worker_payload values ('blocked-conversation',
 jsonb_set(jsonb_set((select value from worker_payload where name='enqueue'),'{job,id}','"b1000000-0000-4000-8000-000000000004"'),'{job,request,conversationId}','"f1000000-0000-4000-8000-000000000001"') ||
 '{"newConversation":{"id":"f1000000-0000-4000-8000-000000000001","actorId":"a1000000-0000-4000-8000-000000000001","title":"Must not be orphaned"}}'::jsonb);
select throws_ok($$select public.authoring_queue('enqueue',(select value from worker_payload where name='blocked-conversation'))$$,'P0001','Você já tem três pedidos pendentes. Conclua os anteriores antes de criar outro.','quarto job ativo é recusado pela transação');
select is((select count(*) from public.authoring_conversations where id='f1000000-0000-4000-8000-000000000001'),0::bigint,'admissão recusada não cria conversa órfã');
select is((select count(*) from public.ai_jobs where id='b1000000-0000-4000-8000-000000000004'),0::bigint,'admissão recusada não cria job');

-- A legacy confirmation is not silently upgraded/replayed by the queue.
insert into public.ai_jobs(id,user_id,mode,status,request)
values ('b1000000-0000-4000-8000-000000000099','a1000000-0000-4000-8000-000000000001','create','needs_confirmation','{"mode":"create"}');
select is(public.authoring_queue('confirm','{"jobId":"b1000000-0000-4000-8000-000000000099","actorId":"a1000000-0000-4000-8000-000000000001"}'),'false'::jsonb,'legado sem task não finge retomar');

-- The other actor can admit a new conversation even while the owner is at capacity.
insert into worker_payload values ('other-enqueue',
 jsonb_set(jsonb_set(jsonb_set(jsonb_set((select value from worker_payload where name='enqueue'),'{job,id}','"b1000000-0000-4000-8000-000000000010"'),'{actorId}','"a1000000-0000-4000-8000-000000000002"'),'{job,actorId}','"a1000000-0000-4000-8000-000000000002"'),'{job,request,conversationId}','"f1000000-0000-4000-8000-000000000002"') ||
 '{"newConversation":{"id":"f1000000-0000-4000-8000-000000000002","actorId":"a1000000-0000-4000-8000-000000000002","title":"Admitted atomically"}}'::jsonb);
select is(public.authoring_queue('enqueue',(select value from worker_payload where name='other-enqueue')),'true'::jsonb,'limite é pessoal, não bloqueia outro ator');
select is((select count(*) from public.authoring_conversations where id='f1000000-0000-4000-8000-000000000002'),1::bigint,'conversa admitida é criada junto com job');
select is(public.authoring_queue('enqueue',(select value from worker_payload where name='other-enqueue')),'true'::jsonb,'replay não insere conversa pela segunda vez');

-- Test clock-independent rate admission with ten already completed records.
update private.authoring_tasks q set state='done'
from public.ai_jobs j where j.id=q.job_id and j.user_id='a1000000-0000-4000-8000-000000000002';
do $$
declare identifier uuid; number integer;
begin
  for number in 1..9 loop
    identifier := gen_random_uuid();
    insert into public.ai_jobs(id,user_id,mode,status,request) values(identifier,'a1000000-0000-4000-8000-000000000002','search','completed','{"mode":"search"}');
    insert into private.authoring_tasks(job_id,state) values(identifier,'done');
  end loop;
end;
$$;
select throws_ok($$select public.authoring_queue('enqueue',jsonb_set((select value from worker_payload where name='other-enqueue'),'{job,id}','"b1000000-0000-4000-8000-000000000011"'))$$,'P0001','Limite de dez pedidos por minuto. Aguarde antes de tentar novamente.','jobs rapidamente concluídos continuam contando na admissão por minuto');
reset role;
select is((select daily_count from private.usage_counters where user_id='a1000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date),1,'gates de admissão não cobram operações de IA');
select * from finish();
rollback;
