begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1400000-0000-4000-8000-000000000001','beta-member@silogium.test','{"user_name":"beta-member","role":"admin","provider_id":"12345"}'),
 ('a1400000-0000-4000-8000-000000000002','beta-admin@silogium.test','{"user_name":"beta-admin"}'),
 ('a1400000-0000-4000-8000-000000000003','beta-invited@silogium.test','{"user_name":"beta-invited"}');
update public.profiles set role='admin' where id='a1400000-0000-4000-8000-000000000002';
select is((select state from private.beta_participants where user_id='a1400000-0000-4000-8000-000000000001'),'pending','signup starts pending despite mutable metadata');
select ok(not has_table_privilege('authenticated','private.beta_participants','SELECT'),'waitlist is not readable directly');
select ok(not has_table_privilege('authenticated','private.creation_reservations','UPDATE'),'user cannot reset allowance');
select ok(not has_function_privilege('authenticated','public.beta_access(text,uuid,jsonb)','EXECUTE'),'user cannot forge trusted actor for beta RPC');
select ok(not has_function_privilege('authenticated','public.authoring_queue(text,jsonb)','EXECUTE'),'user cannot lease a job');
select ok(not has_function_privilege('service_role','public.authoring_queue_v2(text,jsonb)','EXECUTE'),'old queue cannot bypass new guard');
select ok(not has_function_privilege('service_role','public.consume_quota_for_v1(uuid,text)','EXECUTE'),'old quota cannot bypass new guard');
select ok(not has_function_privilege('authenticated','public.consume_quota(text)','EXECUTE'),'legacy own-quota RPC cannot bypass beta');

create temporary table beta_fixture(name text primary key,value jsonb);
grant all on beta_fixture to service_role;
create function pg_temp.beta_enqueue(identifier uuid,owner_id uuid,kind text default 'create') returns jsonb language sql as $$
 select public.authoring_queue('enqueue',jsonb_build_object('actorId',owner_id,'job',jsonb_build_object('id',identifier,'actorId',owner_id,
   'status','running','createdAt',clock_timestamp(),'request',jsonb_build_object('mode',kind,'prompt','Beta exercise','runtime','typescript','format','classic','visibility','private'))));
$$;
create function pg_temp.beta_outcome(identifier uuid,owner_id uuid,problem uuid) returns jsonb language sql as $$
 select jsonb_build_object('job',jsonb_build_object('id',identifier,'actorId',owner_id,'status','completed','result',jsonb_build_object('kind','create')),
 'effects',jsonb_build_object('package',jsonb_build_object(
 'problem',jsonb_build_object('id',problem,'version',1,'slug','beta-'||problem,'title','Beta fixture','summary','Fixture','origin','native','visibility','private','status','validated','difficulty','easy','format','classic','runtimes','[{"language":"typescript"}]'::jsonb,'tags','[]'::jsonb,'provenance',jsonb_build_object('kind','native','createdBy',owner_id),'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()),
 'bundle',jsonb_build_object('schemaVersion',1,'problemId',problem,'problemVersion',1,'visibleCases','[]'::jsonb,'hiddenCases','[]'::jsonb,'referenceSolutions','{"typescript":"PRIVATE_BETA_REFERENCE"}'::jsonb),
 'validation','{"valid":true}'::jsonb,'fingerprint','beta-'||problem,'checksum',repeat('a',64))));
$$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'state','pending','status does not trust metadata');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000002')->>'state','approved','database admin is automatically approved');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000002')->'dailyLimit','null'::jsonb,'admin alone has no daily creation allowance');
select throws_ok($$select public.beta_access('list','a1400000-0000-4000-8000-000000000001')$$,'P0001','admin required','ordinary user cannot see other waitlist entries');
select throws_ok($$select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001')$$,'P0001','beta access required','pending user cannot enqueue');
select is(public.consume_quota_for('a1400000-0000-4000-8000-000000000001','remote_execution')->>'reason','beta_access','pending CLI execution fails at quota seam too');
select is(public.authoring_queue('ready','{}'),'false'::jsonb,'empty queue does not wake Node worker');

select is(public.beta_access('invite','a1400000-0000-4000-8000-000000000002','{"githubId":"12345","githubHandle":"beta-member"}'),'true'::jsonb,'admin can preinvite immutable GitHub id');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'state','pending','matching handle and forged metadata never satisfy invitation');
reset role;
insert into auth.identities(id,user_id,provider_id,provider,identity_data) values
 ('c1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000003','12345','github','{"sub":"12345","user_name":"renamed-user"}'),
 ('c1400000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001','98765','github','{"sub":"98765","user_name":"beta-member"}');
set local role service_role;
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000003')->>'state','approved','verified immutable id grants invite even after handle rename');
select is(public.beta_access('approve','a1400000-0000-4000-8000-000000000002','{"userId":"a1400000-0000-4000-8000-000000000001"}'),'true'::jsonb,'admin approves waitlist member');
select throws_ok($$select public.beta_access('revoke','a1400000-0000-4000-8000-000000000002','{"userId":"a1400000-0000-4000-8000-000000000002"}')$$,'P0001','participant not found or is administrator','beta moderation cannot demote or revoke administrator');

select is(pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001'),'true'::jsonb,'approved creation is admitted');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'reservedToday','0','enqueue and duplicate discovery reserve nothing');
select is(public.authoring_queue('ready','{}'),'true'::jsonb,'eligible job wakes worker');
insert into beta_fixture values('lease',public.authoring_queue('claim','{"workerId":"beta-test","leaseSeconds":120}'));
insert into beta_fixture values('fence',(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease'));
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'true'::jsonb,'actual creation reserves allowance');
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'true'::jsonb,'reservation is idempotent across AI phases');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'reservedToday','1','one held slot');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'createdToday','0','reservation is not claimed as validated creation');
select is(public.authoring_queue('checkpoint',(select value||'{"key":"definition","value":{"private":"BETA_CHECKPOINT"}}'::jsonb from beta_fixture where name='fence')),'true'::jsonb,'checkpoint retained before quota deferral');
update private.authoring_tasks set admitted_at=clock_timestamp()-interval '2 days' where job_id='b1400000-0000-4000-8000-000000000001';
select is(public.authoring_queue('retry',(select value||'{"error":"quota","permanent":false,"deferMs":86400000}'::jsonb from beta_fixture where name='fence')),'true'::jsonb,'quota deferral survives age over 24 hours');
select is((select checkpoints#>>'{definition,private}' from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000001'),'BETA_CHECKPOINT','capacity wait keeps private checkpoint');
select is((select attempts from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000001'),0,'capacity wait is not a failed attempt');
select is(public.authoring_queue('ready','{}'),'false'::jsonb,'future capacity wait does not wake worker');
select is(public.beta_access('revoke','a1400000-0000-4000-8000-000000000002','{"userId":"a1400000-0000-4000-8000-000000000001"}'),'true'::jsonb,'admin revokes access');
select is((select state from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000001'),'paused','revoke pauses queued work');
select is((select checkpoints#>>'{definition,private}' from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000001'),'BETA_CHECKPOINT','revocation preserves checkpoint');
select is(public.beta_access('resume_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000001"}'),'false'::jsonb,'revoked user cannot resume');
select is(public.beta_access('approve','a1400000-0000-4000-8000-000000000002','{"userId":"a1400000-0000-4000-8000-000000000001"}'),'true'::jsonb,'approval resumes access-paused work');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-test","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select is(public.authoring_queue('finish',(select value||jsonb_build_object('outcome',pg_temp.beta_outcome('b1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001')) from beta_fixture where name='fence')),'true'::jsonb,'validated native package and consumed allowance commit together');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'createdToday','1','validated creation consumes one slot');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'reservedToday','0','successful reservation no longer held');

-- Search, refinement and import are not new-question creations.
select is(pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001','search'),'true'::jsonb,'search admitted independently of creation allowance');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-test","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'true'::jsonb,'search AI requires access but no creation slot');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'remaining','1','search does not change allowance');
select is(public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000003','{"jobId":"b1400000-0000-4000-8000-000000000002"}'),'false'::jsonb,'other member cannot cancel someone else job');
select is(public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000002"}'),'true'::jsonb,'owner cancels own job');

select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000001');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-test","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'true'::jsonb,'second slot reserved');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'remaining','0','consumed plus held counts against two');
select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000004','a1400000-0000-4000-8000-000000000001');
insert into beta_fixture values('otherlease',public.authoring_queue('claim','{"workerId":"beta-other","leaseSeconds":120}'));
select is(public.authoring_queue('reserve_ai',(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='otherlease')),'false'::jsonb,'third simultaneous creation cannot oversubscribe allowance');
select is((select progress->>'reason' from public.ai_jobs where id='b1400000-0000-4000-8000-000000000004'),'quota','third job waits for correct daily renewal');
update private.authoring_tasks set checkpoints='{"discovery":{"value":"KEPT_WHILE_QUOTA_WAITING"}}' where job_id='b1400000-0000-4000-8000-000000000004';
insert into beta_fixture values('quota-wake',(select to_jsonb(available_at) from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000004'));
select is(public.beta_access('resume_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000004"}'),'false'::jsonb,'manual resume cannot wake work while both daily slots are consumed or reserved');
select is((select to_jsonb(available_at) from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000004'),(select value from beta_fixture where name='quota-wake'),'denied resume preserves the scheduled renewal');
select is((select checkpoints#>>'{discovery,value}' from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000004'),'KEPT_WHILE_QUOTA_WAITING','denied resume preserves private checkpoint');
select is((select count(*) from private.creation_reservations where job_id='b1400000-0000-4000-8000-000000000004'),0::bigint,'denied resume creates no reservation');
select is(public.authoring_queue('retry',(select value||'{"permanent":true,"refund":false,"error":"invalid output"}'::jsonb from beta_fixture where name='fence')),'true'::jsonb,'terminal validation failure finishes attempt');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'remaining','1','failed validation releases slot even when legacy refund flag false');
select is(public.beta_access('resume_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000004"}'),'true'::jsonb,'manual resume can reserve the slot released by another failed generation');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'reservedToday','1','resumed job holds the released slot before waking the worker');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'remaining','0','resumption does not oversubscribe the daily allowance');
select is(public.beta_access('resume_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000004"}'),'true'::jsonb,'repeated resume is safe after its slot was reserved');
select is((select count(*) from private.creation_reservations where job_id='b1400000-0000-4000-8000-000000000004' and state='reserved'),1::bigint,'resumption replay never reserves twice');
select is(public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000004"}'),'true'::jsonb,'queued daily-quota wait can be cancelled');

-- Reservation day does not migrate when a delayed result is resumed tomorrow.
select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000005','a1400000-0000-4000-8000-000000000001');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-test","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence'));
update private.creation_reservations set quota_day=(clock_timestamp() at time zone 'America/Sao_Paulo')::date-1 where job_id='b1400000-0000-4000-8000-000000000005';
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'true'::jsonb,'resuming old reservation is idempotent');
select is((select quota_day from private.creation_reservations where job_id='b1400000-0000-4000-8000-000000000005'),(clock_timestamp() at time zone 'America/Sao_Paulo')::date-1,'original Brasilia day preserved');
select public.authoring_queue('retry',(select value||'{"permanent":false,"deferMs":1000}'::jsonb from beta_fixture where name='fence'));
update public.ai_jobs set progress=jsonb_set(progress,'{reason}','"quota"') where id='b1400000-0000-4000-8000-000000000005';
select is(public.beta_access('resume_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000005"}'),'true'::jsonb,'manual resume reuses a reservation from an earlier day');
select is((select quota_day from private.creation_reservations where job_id='b1400000-0000-4000-8000-000000000005'),(clock_timestamp() at time zone 'America/Sao_Paulo')::date-1,'manual resume never moves a held reservation to the current day');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'remaining','1','old-day resumption does not charge current-day allowance');
select is(public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000001','{"jobId":"b1400000-0000-4000-8000-000000000005"}'),'true'::jsonb,'cancelling old reservation refunds original day');
select is((select state from private.creation_reservations where job_id='b1400000-0000-4000-8000-000000000005'),'released','cancel marks reservation released');

select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000006','a1400000-0000-4000-8000-000000000002');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-test","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'true'::jsonb,'admin still follows queue but bypasses daily creation quota');
select is((select count(*) from private.creation_reservations where user_id='a1400000-0000-4000-8000-000000000002'),0::bigint,'admin has no daily reservation');
select is(public.consume_quota_for('a1400000-0000-4000-8000-000000000002','remote_execution')->>'remaining','49','admin retains remote execution technical limits');
select is(((public.beta_access('status','a1400000-0000-4000-8000-000000000001')->>'resetsAt')::timestamptz at time zone 'America/Sao_Paulo')::time,'00:00:00'::time,'renewal is midnight Brasilia');

-- Initial recommendations do not reserve. Explicit confirmation does, atomically.
select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000007','a1400000-0000-4000-8000-000000000003');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-confirm","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select is(public.authoring_queue('finish',(select value||'{"outcome":{"job":{"id":"b1400000-0000-4000-8000-000000000007","actorId":"a1400000-0000-4000-8000-000000000003","status":"needs_confirmation","result":{"kind":"recommendations","candidates":[]}},"effects":{}}}'::jsonb from beta_fixture where name='fence')),'true'::jsonb,'recommendations wait for user confirmation');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000003')->>'reservedToday','0','recommendations charge no reservation');
select is(public.authoring_queue('confirm','{"jobId":"b1400000-0000-4000-8000-000000000007","actorId":"a1400000-0000-4000-8000-000000000003"}'),'true'::jsonb,'explicit confirmation resumes and reserves');
select is(public.authoring_queue('confirm','{"jobId":"b1400000-0000-4000-8000-000000000007","actorId":"a1400000-0000-4000-8000-000000000003"}'),'true'::jsonb,'confirmation replay is idempotent');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000003')->>'reservedToday','1','confirmed generation holds one original-day slot');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-confirm","leaseSeconds":120}') where name='lease';
update beta_fixture set value=(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease') where name='fence';
select public.authoring_queue('checkpoint',(select value||'{"key":"contract","value":{"id":"PRIVATE_CONFIRMED"}}'::jsonb from beta_fixture where name='fence'));
update private.beta_participants set state='revoked' where user_id='a1400000-0000-4000-8000-000000000003';
select is(public.authoring_queue('reserve_ai',(select value from beta_fixture where name='fence')),'false'::jsonb,'beforeAi checks current access even after lease was granted');
select is((select state from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000007'),'paused','beforeAi revocation pauses instead of failing content');
select is((select checkpoints#>>'{contract,id}' from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000007'),'PRIVATE_CONFIRMED','revocation during lease preserves completed checkpoint');
select is(public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000003','{"jobId":"b1400000-0000-4000-8000-000000000007"}'),'true'::jsonb,'revoked owner may cancel and release their reservation');
select is((select progress->>'reason' from public.ai_jobs where id='b1400000-0000-4000-8000-000000000007'),'cancelled','cancellation has stable public reason');
select is((select checkpoints from private.authoring_tasks where job_id='b1400000-0000-4000-8000-000000000007'),'{}'::jsonb,'only explicit cancellation clears paused checkpoint');
select is(public.beta_access('approve','a1400000-0000-4000-8000-000000000002','{"userId":"a1400000-0000-4000-8000-000000000003"}'),'true'::jsonb,'verified invited participant can be reapproved');

select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000008','a1400000-0000-4000-8000-000000000003','refine');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-refine","leaseSeconds":120}') where name='lease';
select is(public.authoring_queue('reserve_ai',(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease')),'true'::jsonb,'refinement passes access without reserving new creation');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000003')->>'reservedToday','0','refinement does not reserve daily allowance');
select public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000003','{"jobId":"b1400000-0000-4000-8000-000000000008"}');
select pg_temp.beta_enqueue('b1400000-0000-4000-8000-000000000009','a1400000-0000-4000-8000-000000000003','import');
update beta_fixture set value=public.authoring_queue('claim','{"workerId":"beta-import","leaseSeconds":120}') where name='lease';
select is(public.authoring_queue('reserve_ai',(select jsonb_build_object('jobId',value#>>'{job,id}','token',value->>'token') from beta_fixture where name='lease')),'true'::jsonb,'licensed import passes access without reserving new creation');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000003')->>'reservedToday','0','import does not reserve daily allowance');
select public.beta_access('cancel_job','a1400000-0000-4000-8000-000000000003','{"jobId":"b1400000-0000-4000-8000-000000000009"}');

select is((select participant->>'githubId' from jsonb_array_elements(public.beta_access('list','a1400000-0000-4000-8000-000000000002')->'participants') participant where participant->>'userId'='a1400000-0000-4000-8000-000000000003'),'12345','moderator sees immutable identity separately from display handle');
select is(public.beta_access('revoke_invite','a1400000-0000-4000-8000-000000000002','{"githubId":"12345"}'),'true'::jsonb,'admin can revoke an immutable preinvitation');
select is(public.beta_access('status','a1400000-0000-4000-8000-000000000003')->>'state','approved','revoking preinvitation alone does not revoke active participation');
select public.beta_access('invite','a1400000-0000-4000-8000-000000000002','{"githubId":"12345","githubHandle":"renamed-user"}');
select public.beta_access('revoke','a1400000-0000-4000-8000-000000000002','{"userId":"a1400000-0000-4000-8000-000000000003"}');
select is((select count(*) from private.beta_invitations where github_id='12345'),0::bigint,'revocation removes stale invitation so account recreation cannot autoapprove');
reset role;
select * from finish();
rollback;
