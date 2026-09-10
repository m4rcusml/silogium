-- Run against migrated PostgreSQL. TypeScript mocks do not validate transactions/RLS.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok(not has_function_privilege('anon','public.groq_capacity(text,jsonb)','EXECUTE'),'anonymous cannot reserve capacity');
select ok(not has_function_privilege('authenticated','public.groq_capacity(text,jsonb)','EXECUTE'),'users cannot forge settlements');
select ok(not has_table_privilege('authenticated','private.groq_capacity','SELECT'),'ledger is private');
select ok(not has_function_privilege('service_role','public.authoring_queue_v1(text,jsonb)','EXECUTE'),'legacy queue bypass is closed');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.groq_capacity('reserve','{"id":"c2000000-0000-4000-8000-000000000001","tokens":4000}')->>'allowed','true','first reservation');
select is(public.groq_capacity('reserve','{"id":"c2000000-0000-4000-8000-000000000002","tokens":1000}')->>'allowed','false','second worker respects inflight');
select is(public.groq_capacity('settle','{"id":"c2000000-0000-4000-8000-000000000001","actualTokens":7000}'),'true'::jsonb,'settles actual usage');
select is(public.groq_capacity('reserve','{"id":"c2000000-0000-4000-8000-000000000002","tokens":2000}')->>'allowed','false','actual tokens exceed minute capacity');
select is(public.groq_capacity('settle','{"id":"c2000000-0000-4000-8000-000000000001","actualTokens":0}'),'true'::jsonb,'settlement replay accepted without changing usage');
select is(public.groq_capacity('reserve','{"id":"c2000000-0000-4000-8000-000000000002","tokens":2000}')->>'allowed','false','settlement replay does not free tokens');
select throws_ok($$select public.groq_capacity('reserve','{"id":"c2000000-0000-4000-8000-000000000003","tokens":9000}')$$,'P0001','invalid capacity reservation','oversized request fails');
reset role;

insert into auth.users(id,email,raw_user_meta_data) values('a2000000-0000-4000-8000-000000000001','groq-owner@silogium.test','{"user_name":"groq-owner"}');
create temporary table groq_fence(value jsonb); grant all on groq_fence to service_role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.authoring_queue('enqueue','{"actorId":"a2000000-0000-4000-8000-000000000001","job":{"id":"b2000000-0000-4000-8000-000000000001","actorId":"a2000000-0000-4000-8000-000000000001","status":"running","createdAt":"2026-09-10T00:00:00Z","request":{"mode":"create","prompt":"groq smoke","runtime":"typescript","format":"classic","difficulty":"easy","visibility":"private"}}}');
insert into groq_fence select jsonb_build_object('jobId',v#>>'{job,id}','token',v->>'token') from (select public.authoring_queue('claim','{"workerId":"groq-test","leaseSeconds":120}') v) x;
select is(public.authoring_queue('reserve_ai',(select value from groq_fence)),'true'::jsonb,'reserve user operation');
select is(public.authoring_queue('progress',(select value || '{"phase":"code"}'::jsonb from groq_fence)),'true'::jsonb,'phase update is fenced');
select is(public.authoring_queue('retry',(select value || '{"deferMs":65000,"refund":true}'::jsonb from groq_fence)),'true'::jsonb,'rate limit defers');
select is((select attempts from private.authoring_tasks where job_id='b2000000-0000-4000-8000-000000000001'),0,'deferral does not spend failure attempts');
select is(public.authoring_queue('progress',(select value || '{"phase":"cases"}'::jsonb from groq_fence)),'false'::jsonb,'stale worker cannot update progress');
update private.authoring_tasks set available_at=clock_timestamp()-interval '1 second' where job_id='b2000000-0000-4000-8000-000000000001';
delete from groq_fence;
insert into groq_fence select jsonb_build_object('jobId',v#>>'{job,id}','token',v->>'token') from (select public.authoring_queue('claim','{"workerId":"groq-test","leaseSeconds":120}') v) x;
select is(public.authoring_queue('reserve_ai',(select value from groq_fence)),'true'::jsonb,'resume uses same user operation');
select is(public.authoring_queue('retry',(select value || '{"permanent":true,"refund":true}'::jsonb from groq_fence)),'true'::jsonb,'terminal infrastructure failure refunds');
select is(public.authoring_queue('retry',(select value || '{"permanent":true,"refund":true}'::jsonb from groq_fence)),'false'::jsonb,'refund cannot be repeated by old worker');
reset role;
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date),0,'user quota refunded exactly once');

-- Exercise the real queue through three attempts; only the retry clock is advanced.
create function pg_temp.groq_third_attempt(requested_id uuid) returns jsonb language plpgsql as $$
declare claimed jsonb; fence jsonb; attempt integer;
begin
  perform public.authoring_queue('enqueue', jsonb_build_object(
    'actorId', 'a2000000-0000-4000-8000-000000000001', 'job', jsonb_build_object(
      'id', requested_id, 'actorId', 'a2000000-0000-4000-8000-000000000001',
      'status', 'running', 'createdAt', clock_timestamp(), 'request',
      '{"mode":"create","prompt":"quota recovery regression","runtime":"typescript","format":"classic","difficulty":"easy","visibility":"private"}'::jsonb)));
  for attempt in 1..3 loop
    claimed := public.authoring_queue('claim', '{"workerId":"groq-recovery-test","leaseSeconds":120}');
    if (claimed#>>'{job,id}')::uuid is distinct from requested_id or (claimed->>'attempt')::integer is distinct from attempt then
      raise exception 'unexpected fixture claim';
    end if;
    fence := jsonb_build_object('jobId', requested_id, 'token', claimed->>'token');
    if public.authoring_queue('reserve_ai', fence) is distinct from 'true'::jsonb then raise exception 'fixture reservation failed'; end if;
    if attempt < 3 then
      if public.authoring_queue('retry', fence || '{"error":"temporary failure","refund":true}'::jsonb) is distinct from 'true'::jsonb then
        raise exception 'fixture retry failed';
      end if;
      update private.authoring_tasks set available_at = clock_timestamp() - interval '1 second' where job_id = requested_id;
    end if;
  end loop;
  return fence;
end;
$$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
delete from groq_fence;
insert into groq_fence select pg_temp.groq_third_attempt('b2000000-0000-4000-8000-000000000002');
select is(public.authoring_queue('retry',(select value || '{"error":"invalid output","permanent":true,"refund":false}'::jsonb from groq_fence)), 'true'::jsonb, 'third-attempt business failure is terminal without refund');
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date), 1, 'business failure retains the single reserved operation');
select is(public.authoring_queue('claim','{"workerId":"groq-recovery-test","leaseSeconds":120}'), null::jsonb, 'claim has no queued work after business failure');
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date), 1, 'claim cannot override explicit refund false on a third-attempt failure');
select is((select ai_refunded from private.authoring_tasks where job_id='b2000000-0000-4000-8000-000000000002'), false, 'business failure is not marked refunded');

delete from groq_fence;
insert into groq_fence select pg_temp.groq_third_attempt('b2000000-0000-4000-8000-000000000003');
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date), 2, 'crashing job reserved only one additional operation across retries');
select is(public.authoring_queue('claim','{"workerId":"groq-recovery-test","leaseSeconds":120}'), null::jsonb, 'a valid final lease is not recovered early');
select is((select state from private.authoring_tasks where job_id='b2000000-0000-4000-8000-000000000003'), 'leased', 'claim preserves the active final attempt');
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date), 2, 'active final lease keeps its reservation');
update private.authoring_tasks set lease_until = clock_timestamp() - interval '1 second' where job_id='b2000000-0000-4000-8000-000000000003';
select is(public.authoring_queue('claim','{"workerId":"groq-recovery-test","leaseSeconds":120}'), null::jsonb, 'expired final lease is not claimed again');
select is((select state from private.authoring_tasks where job_id='b2000000-0000-4000-8000-000000000003'), 'failed', 'worker death on the final attempt becomes terminal');
select is((select ai_refunded from private.authoring_tasks where job_id='b2000000-0000-4000-8000-000000000003'), true, 'expired final lease is refunded');
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date), 1, 'only the infrastructure failure is refunded');
select is(public.authoring_queue('retry',(select value || '{"permanent":true,"refund":true}'::jsonb from groq_fence)), 'false'::jsonb, 'dead worker cannot refund again with its stale fence');
select is(public.authoring_queue('claim','{"workerId":"groq-recovery-test","leaseSeconds":120}'), null::jsonb, 'claim recovery replay is harmless');
select is((select daily_count from private.usage_counters where user_id='a2000000-0000-4000-8000-000000000001' and kind='ai' and day=current_date), 1, 'replayed recovery preserves the charged business failure');
reset role;
select * from finish();
rollback;
