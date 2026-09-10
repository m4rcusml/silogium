begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);
insert into auth.users(id,email,raw_user_meta_data) values
 ('87000000-0000-4000-8000-000000000001','capacity-admin@silogium.test','{"user_name":"capacity-admin"}'),
 ('87000000-0000-4000-8000-000000000002','capacity-user@silogium.test','{"user_name":"capacity-user"}');
update public.profiles set role='admin' where id='87000000-0000-4000-8000-000000000001';
select ok(not has_table_privilege('authenticated','private.modal_budget','SELECT'),'financial configuration private');
select ok(not has_table_privilege('anon','private.modal_reservations','SELECT'),'reservations private');
select ok(not has_function_privilege('authenticated','public.operational_capacity(text,jsonb)','EXECUTE'),'browser cannot forge provider accounting');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.operational_capacity('status')#>>'{modal,available}','false','fresh migration fails closed before verification');
select is(public.operational_capacity('status')#>>'{groq,available}','true','unconfigured Modal does not shut off unrelated provider');
select throws_ok($$select public.operational_capacity('set_paused','{"actorId":"87000000-0000-4000-8000-000000000002","service":"groq","paused":true}')$$,'P0001','administrator required','non-admin cannot toggle workloads');
select is(public.operational_capacity('set_paused','{"actorId":"87000000-0000-4000-8000-000000000001","service":"groq","paused":true}')#>>'{groq,available}','false','admin can pause Groq independently');
select is(public.operational_capacity('set_paused','{"actorId":"87000000-0000-4000-8000-000000000001","service":"groq","paused":false}')#>>'{groq,available}','true','admin can remove operator pause');
select throws_ok(format($$select public.operational_capacity('verify_modal', %L::jsonb)$$,
 jsonb_build_object('actorId','87000000-0000-4000-8000-000000000001','cycleStart',date_trunc('month',now()),'cycleEnd',date_trunc('month',now())+interval '1 month','creditMicrousd',30000000,'grossLimitMicrousd',42500000,'netLimitMicrousd',0)::text),
 'P0001','free-only financial controls not verified','gross cap above free credits is rejected');
select lives_ok(format($$select public.operational_capacity('verify_modal', %L::jsonb)$$,
 jsonb_build_object('actorId','87000000-0000-4000-8000-000000000001','cycleStart',date_trunc('month',now()),'cycleEnd',date_trunc('month',now())+interval '1 month','creditMicrousd',30000000,'grossLimitMicrousd',30000000,'netLimitMicrousd',0,'workloadLimitMicrousd',1000000)::text),'smoke can use lower internal allowance without lying about native caps');
select is(public.operational_capacity('observe_modal',jsonb_build_object('cycleStart',date_trunc('month',now()),'cycleEnd',date_trunc('month',now())+interval '1 month','usageMicrousd',0))#>>'{modal,available}','true','smoke allowance starts available after measured observation');
select is(public.operational_capacity('reserve_modal','{"id":"88000000-0000-4000-8000-000000000003","estimateMicrousd":250000}')->>'allowed','true','smoke reserves first bounded workload');
select is(public.operational_capacity('reserve_modal','{"id":"88000000-0000-4000-8000-000000000004","estimateMicrousd":800000}')->>'allowed','false','smoke cannot reserve more than one dollar even with thirty free credits');
select throws_ok(format($$select public.operational_capacity('verify_modal', %L::jsonb)$$,
 jsonb_build_object('actorId','87000000-0000-4000-8000-000000000001','cycleStart',date_trunc('month',now()),'cycleEnd',date_trunc('month',now())+interval '1 month','creditMicrousd',30000000,'grossLimitMicrousd',30000000,'netLimitMicrousd',0,'workloadLimitMicrousd',31000000)::text),
 'P0001','free-only financial controls not verified','internal allowance cannot expand free capacity');
select lives_ok(format($$select public.operational_capacity('verify_modal', %L::jsonb)$$,
 jsonb_build_object('actorId','87000000-0000-4000-8000-000000000001','cycleStart',date_trunc('month',now()),'cycleEnd',date_trunc('month',now())+interval '1 month','creditMicrousd',30000000,'grossLimitMicrousd',30000000,'netLimitMicrousd',0)::text),'accept operator financial attestation');
select is(public.operational_capacity('status')#>>'{modal,available}','false','attestation alone is not a current usage reading');
select is(public.operational_capacity('observe_modal',jsonb_build_object('cycleStart',date_trunc('month',now()),'cycleEnd',date_trunc('month',now())+interval '1 month','usageMicrousd',20000000))#>>'{modal,available}','true','fresh matching-cycle usage enables admission');
select is(public.operational_capacity('reserve_modal','{"id":"88000000-0000-4000-8000-000000000001","estimateMicrousd":6000000}')->>'allowed','true','first work fits free headroom');
select is(public.operational_capacity('reserve_modal','{"id":"88000000-0000-4000-8000-000000000001","estimateMicrousd":6000000}')->>'allowed','true','reservation replay is idempotent');
select is(public.operational_capacity('reserve_modal','{"id":"88000000-0000-4000-8000-000000000002","estimateMicrousd":6000000}')->>'allowed','false','observed external usage plus outstanding work cannot oversubscribe credits');
select is(public.operational_capacity('finish_modal','{"id":"88000000-0000-4000-8000-000000000001"}'),'true'::jsonb,'completion can be recorded');
select is(public.operational_capacity('reserve_modal','{"id":"88000000-0000-4000-8000-000000000002","estimateMicrousd":6000000}')->>'allowed','false','unknown final cost is not incorrectly refunded');
reset role;
update private.modal_budget set observed_at=clock_timestamp()-interval '16 minutes';
set local role service_role;
select is(public.operational_capacity('status')#>>'{modal,available}','false','stale billing observation blocks new remote work');
reset role;
update private.modal_budget set verified_until=clock_timestamp()-interval '1 second';
set local role service_role;
select is(public.operational_capacity('status')#>>'{modal,available}','false','renewed cycle requires verifying native financial controls');
select throws_ok($$select public.operational_capacity('observe_modal','{"cycleStart":"2000-01-01T00:00:00Z","cycleEnd":"2000-02-01T00:00:00Z","usageMicrousd":0}')$$,'P0001','unverified billing cycle','cannot forge a free new cycle from an old report');
reset role;
insert into private.groq_capacity(id,created_at,tokens,settled) values('88000000-0000-4000-8000-000000000005',clock_timestamp()-interval '2 hours',200000,true);
set local role service_role;
select is(public.operational_capacity('status')#>>'{groq,available}','false','known token exhaustion blocks heavy worker before a new provider call');
reset role;
delete from private.groq_capacity where id='88000000-0000-4000-8000-000000000005';
set local role service_role;
select is(public.operational_capacity('status')#>>'{groq,available}','true','availability recovers when the rolling-window limit no longer applies');
select * from finish();
rollback;
