-- Beta authorization and successful-creation accounting live behind service-only RPCs.
-- Existing 001-013 migrations remain immutable; the content writer is wrapped below.
create table private.beta_participants (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','approved','rejected','revoked')),
  requested_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references public.profiles(id) on delete set null
);
create table private.beta_invitations (
  github_id text primary key check (github_id ~ '^[1-9][0-9]{0,19}$'),
  github_handle text not null check (length(github_handle) between 1 and 39),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create table private.creation_reservations (
  -- No FK to ai_jobs: deleting history must not reset a consumed allowance.
  job_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  quota_day date not null,
  state text not null check (state in ('reserved','consumed','released')),
  problem_id uuid,
  updated_at timestamptz not null default clock_timestamp()
);
create index creation_reservations_owner_day on private.creation_reservations(user_id, quota_day, state);
alter table private.beta_participants enable row level security;
alter table private.beta_invitations enable row level security;
alter table private.creation_reservations enable row level security;
revoke all on private.beta_participants, private.beta_invitations, private.creation_reservations from public, anon, authenticated;
grant all on private.beta_participants, private.beta_invitations, private.creation_reservations to service_role;

create function private.beta_profile_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.beta_participants(user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger beta_profile_created after insert on public.profiles for each row execute function private.beta_profile_created();
insert into private.beta_participants(user_id) select id from public.profiles on conflict do nothing;

-- provider_id is maintained by Auth for the verified GitHub identity. Neither
-- profiles.handle nor user-editable raw_user_meta_data grants a preinvitation.
create function private.beta_identity_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.provider = 'github' and exists(select 1 from private.beta_invitations i where i.github_id = new.provider_id) then
    update private.beta_participants set state='approved', updated_at=clock_timestamp()
      where user_id=new.user_id and state='pending';
  end if;
  return new;
end;
$$;
create trigger beta_identity_created after insert on auth.identities for each row execute function private.beta_identity_created();

create function private.beta_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p left join private.beta_participants b on b.user_id=p.id
    where p.id=p_user and (p.role='admin' or b.state='approved'));
$$;

alter table private.authoring_tasks drop constraint authoring_tasks_state_check;
alter table private.authoring_tasks add constraint authoring_tasks_state_check check (state in ('queued','leased','done','waiting','failed','paused'));
alter table private.authoring_tasks add column pause_reason text check (pause_reason in ('beta_access','operator'));

create function private.pause_beta_job(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.authoring_tasks set state='paused', pause_reason='beta_access',
    attempts=case when state='leased' then greatest(0,attempts-1) else attempts end,
    lease_token=null, lease_until=null, updated_at=clock_timestamp()
    where job_id=p_job and state in ('queued','leased');
  if found then
    update public.ai_jobs set error='O processamento está pausado enquanto seu acesso ao beta não está ativo.',
      progress=jsonb_build_object('phase','waiting','reason','access','updatedAt',clock_timestamp()) where id=p_job;
  end if;
end;
$$;

create function private.reserve_creation(p_job uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare owner uuid; job_mode text; account_role public.user_role; existing private.creation_reservations;
  day_key date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  select user_id,mode into owner,job_mode from public.ai_jobs where id=p_job;
  if owner is null then return false; end if;
  select role into account_role from public.profiles where id=owner for no key update;
  if not private.beta_allowed(owner) then return false; end if;
  if job_mode <> 'create' or account_role='admin' then return true; end if;
  select * into existing from private.creation_reservations where job_id=p_job for update;
  if found and existing.state in ('reserved','consumed') then return true; end if;
  if (select count(*) from private.creation_reservations where user_id=owner and quota_day=day_key and state in ('reserved','consumed')) >= 2 then return false; end if;
  insert into private.creation_reservations(job_id,user_id,quota_day,state) values(p_job,owner,day_key,'reserved')
    on conflict(job_id) do update set quota_day=excluded.quota_day,state='reserved',updated_at=clock_timestamp();
  return true;
end;
$$;

create function private.defer_creation_quota(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare wake_at timestamptz := (((clock_timestamp() at time zone 'America/Sao_Paulo')::date + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  update private.authoring_tasks set state='queued', available_at=wake_at,
    attempts=case when state='leased' then greatest(0,attempts-1) else attempts end,
    lease_token=null,lease_until=null,updated_at=clock_timestamp() where job_id=p_job;
  update public.ai_jobs set error='Você já criou ou reservou duas questões para hoje. O pedido aguarda a renovação à meia-noite de Brasília.',
    progress=jsonb_build_object('phase','waiting','reason','quota','retryAt',wake_at,'updatedAt',clock_timestamp()) where id=p_job;
end;
$$;

create function public.beta_access(p_action text, p_actor_id uuid, p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare account public.profiles; target uuid; access_state text; used integer; held integer;
  day_key date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  target_job public.ai_jobs; task private.authoring_tasks; chosen uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>2048 then raise exception 'invalid beta payload'; end if;
  select * into account from public.profiles where id=p_actor_id;
  if not found then raise exception 'actor not found'; end if;
  if p_action='status' then
    select case when account.role='admin' then 'approved' else coalesce(b.state,'pending') end into access_state
      from (select 1) singleton left join private.beta_participants b on b.user_id=p_actor_id;
    select count(*) filter(where state='consumed'),count(*) filter(where state='reserved') into used,held
      from private.creation_reservations where user_id=p_actor_id and quota_day=day_key;
    return jsonb_build_object('state',access_state,'isAdmin',account.role='admin',
      'dailyLimit',case when account.role='admin' then null else 2 end,'createdToday',used,'reservedToday',held,
      'remaining',case when account.role='admin' then null else greatest(0,2-used-held) end,
      'resetsAt',((day_key+1)::timestamp at time zone 'America/Sao_Paulo'));
  end if;
  if p_action in ('cancel_job','resume_job') then
    select * into target_job from public.ai_jobs where id=(p_payload->>'jobId')::uuid;
    if not found or (target_job.user_id<>p_actor_id and account.role<>'admin') then return 'false'::jsonb; end if;
    perform 1 from public.profiles where id=target_job.user_id for no key update;
    select * into task from private.authoring_tasks where job_id=target_job.id for update;
    if not found or task.state in ('done','failed') then return 'false'::jsonb; end if;
    if p_action='cancel_job' then
      update private.authoring_tasks set state='failed',pause_reason=null,lease_token=null,lease_until=null,checkpoints='{}',updated_at=clock_timestamp() where job_id=target_job.id;
      update private.creation_reservations set state='released',updated_at=clock_timestamp() where job_id=target_job.id and state='reserved';
      update public.ai_jobs set status='failed',error='Pedido cancelado pelo usuário.',completed_at=clock_timestamp(),
        progress=jsonb_build_object('phase','waiting','reason','cancelled','updatedAt',clock_timestamp()) where id=target_job.id returning * into target_job;
      perform private.authoring_turn(target_job,jsonb_build_object('assistantText','Pedido cancelado pelo usuário.'));
      return 'true'::jsonb;
    end if;
    if not private.beta_allowed(p_actor_id) or not private.beta_allowed(target_job.user_id) or task.state not in ('paused','queued') then return 'false'::jsonb; end if;
    -- A manual retry must not repeatedly wake a billed worker just to rediscover
    -- an exhausted daily allowance. Reuse an original-day reservation or reserve
    -- a newly freed slot while holding the same owner lock; otherwise change nothing.
    if task.state='queued' and target_job.progress->>'reason'='quota' and target_job.mode='create'
      and not private.reserve_creation(target_job.id) then return 'false'::jsonb; end if;
    -- Resuming may wake a capacity-paused job; provider admission is rechecked before work.
    update private.authoring_tasks set state='queued',pause_reason=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where job_id=target_job.id;
    update public.ai_jobs set error=null,progress=jsonb_build_object('phase','waiting','updatedAt',clock_timestamp()) where id=target_job.id;
    return 'true'::jsonb;
  end if;
  if account.role<>'admin' then raise exception 'admin required'; end if;
  if p_action='list' then
    return jsonb_build_object('participants',coalesce((select jsonb_agg(jsonb_build_object('userId',p.id,'handle',p.handle,
      'role',p.role,'state',case when p.role='admin' then 'approved' else b.state end,
      'githubId',identity.provider_id,'githubHandle',coalesce(identity.identity_data->>'user_name',identity.identity_data->>'preferred_username'),
      'requestedAt',b.requested_at,'updatedAt',b.updated_at) order by b.requested_at desc)
      from private.beta_participants b join public.profiles p on p.id=b.user_id
      left join lateral (select provider_id,identity_data from auth.identities where user_id=p.id and provider='github' order by created_at limit 1) identity on true),'[]'::jsonb),
      'invitations',coalesce((select jsonb_agg(jsonb_build_object('githubId',github_id,'githubHandle',github_handle,'createdAt',created_at) order by created_at desc) from private.beta_invitations),'[]'::jsonb));
  elsif p_action='invite' then
    insert into private.beta_invitations(github_id,github_handle,created_by)
      values(p_payload->>'githubId',p_payload->>'githubHandle',p_actor_id)
      on conflict(github_id) do update set github_handle=excluded.github_handle;
    -- Existing verified identities may already be on the waitlist. Revoked/rejected
    -- users require an explicit approval; keeping an old invite cannot undo revocation.
    update private.beta_participants b set state='approved',reviewed_by=p_actor_id,updated_at=clock_timestamp()
      where state='pending' and exists(select 1 from auth.identities i where i.user_id=b.user_id and i.provider='github' and i.provider_id=p_payload->>'githubId');
    return 'true'::jsonb;
  elsif p_action='revoke_invite' then
    if coalesce(p_payload->>'githubId','') !~ '^[1-9][0-9]{0,19}$' then raise exception 'invalid GitHub identity'; end if;
    delete from private.beta_invitations where github_id=p_payload->>'githubId';
    return 'true'::jsonb;
  elsif p_action in ('approve','reject','revoke') then
    target := (p_payload->>'userId')::uuid;
    perform 1 from public.profiles where id=target and role<>'admin' for no key update;
    if not found then raise exception 'participant not found or is administrator'; end if;
    if p_action='approve' and not exists(select 1 from auth.identities where user_id=target and provider='github') then
      raise exception 'verified GitHub identity required';
    end if;
    update private.beta_participants set state=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end,
      reviewed_by=p_actor_id,updated_at=clock_timestamp() where user_id=target;
    if p_action='approve' then
      update public.ai_jobs j set error=null,progress=jsonb_build_object('phase','waiting','updatedAt',clock_timestamp())
        from private.authoring_tasks q where j.id=q.job_id and j.user_id=target and q.state='paused' and q.pause_reason='beta_access';
      update private.authoring_tasks q set state='queued',pause_reason=null,available_at=clock_timestamp(),updated_at=clock_timestamp()
        from public.ai_jobs j where j.id=q.job_id and j.user_id=target and q.state='paused' and q.pause_reason='beta_access';
    else
      delete from private.beta_invitations invitation where exists(select 1 from auth.identities identity
        where identity.user_id=target and identity.provider='github' and identity.provider_id=invitation.github_id);
      for chosen in select q.job_id from private.authoring_tasks q join public.ai_jobs j on j.id=q.job_id
        where j.user_id=target and q.state in ('queued','leased') loop perform private.pause_beta_job(chosen); end loop;
    end if;
    return 'true'::jsonb;
  end if;
  raise exception 'unknown beta action';
end;
$$;
revoke all on function public.beta_access(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.beta_access(text,uuid,jsonb) to service_role;

-- Defense in depth for callers of the legacy quota RPC: AI product allowance is
-- now only reserved by the creation/job transaction. It must not count searches.
alter function public.consume_quota_for(uuid,text) rename to consume_quota_for_v1;
revoke all on function public.consume_quota_for_v1(uuid,text) from public,anon,authenticated,service_role;
create function public.consume_quota_for(requested_user uuid, requested_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if requested_kind not in ('ai','remote_execution') then raise exception 'invalid quota kind'; end if;
  if not private.beta_allowed(requested_user) then return '{"allowed":false,"reason":"beta_access"}'::jsonb; end if;
  if requested_kind='ai' then return '{"allowed":true}'::jsonb; end if;
  return public.consume_quota_for_v1(requested_user,requested_kind);
end;
$$;
revoke all on function public.consume_quota_for(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_quota_for(uuid,text) to service_role;
-- Authenticated callers must not use the original counter endpoint to bypass the module.
revoke all on function public.consume_quota(text) from public,anon,authenticated;

alter function public.authoring_queue(text,jsonb) rename to authoring_queue_v2;
revoke all on function public.authoring_queue_v2(text,jsonb) from public,anon,authenticated,service_role;
create function public.authoring_queue(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare requested_id uuid := (p_payload->>'jobId')::uuid; task private.authoring_tasks; job public.ai_jobs;
  token uuid := (p_payload->>'token')::uuid; result jsonb; owner uuid; milliseconds bigint; wake_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>33554432 then raise exception 'invalid queue payload'; end if;
  if p_action='ready' then
    return to_jsonb(exists(select 1 from private.authoring_tasks q join public.ai_jobs j on j.id=q.job_id
      where private.beta_allowed(j.user_id) and ((q.state='queued' and q.available_at<=clock_timestamp()) or (q.state='leased' and q.lease_until<=clock_timestamp()))));
  end if;
  if p_action='enqueue' then
    owner := (p_payload->>'actorId')::uuid;
    perform 1 from public.profiles where id=owner for no key update;
    if not private.beta_allowed(owner) then raise exception 'beta access required'; end if;
    return public.authoring_queue_v2(p_action,p_payload);
  end if;
  if p_action='claim' then
    -- A revoked identity cannot receive a lease even if it became ineligible after enqueue.
    for requested_id in select q.job_id from private.authoring_tasks q join public.ai_jobs j on j.id=q.job_id
      where q.state in ('queued','leased') and not private.beta_allowed(j.user_id) for update of q skip locked loop
      perform private.pause_beta_job(requested_id);
    end loop;
    result := public.authoring_queue_v2(p_action,p_payload);
    update private.creation_reservations r set state='released',updated_at=clock_timestamp()
      where r.state='reserved' and exists(select 1 from private.authoring_tasks q where q.job_id=r.job_id and q.state='failed');
    if result is not null and not private.beta_allowed((result#>>'{actor,id}')::uuid) then
      perform private.pause_beta_job((result#>>'{job,id}')::uuid); return null;
    end if;
    return result;
  end if;
  select user_id into owner from public.ai_jobs where id=requested_id;
  if owner is null then return 'false'::jsonb; end if;
  -- Admission, approval/revocation and reservations use the same owner lock.
  perform 1 from public.profiles where id=owner for no key update;
  select * into task from private.authoring_tasks where job_id=requested_id for update;
  if not found then return 'false'::jsonb; end if;
  select * into job from public.ai_jobs where id=requested_id;
  if p_action='confirm' then
    if owner is distinct from (p_payload->>'actorId')::uuid then return 'false'::jsonb; end if;
    if not private.beta_allowed(owner) then raise exception 'beta access required'; end if;
    result := public.authoring_queue_v2(p_action,p_payload);
    if result='true'::jsonb and job.mode='create' and task.state='waiting' then
      if not private.reserve_creation(requested_id) then perform private.defer_creation_quota(requested_id); end if;
    end if;
    return result;
  end if;
  if task.state<>'leased' or task.lease_token is distinct from token or task.lease_until<=clock_timestamp() then return 'false'::jsonb; end if;
  if not private.beta_allowed(owner) then perform private.pause_beta_job(requested_id); return 'false'::jsonb; end if;
  if p_action='reserve_ai' then
    -- This is reached after duplicate recommendations, immediately before actual AI.
    if not private.reserve_creation(requested_id) then perform private.defer_creation_quota(requested_id); return 'false'::jsonb; end if;
    return 'true'::jsonb;
  end if;
  if p_action='retry' and p_payload ? 'deferMs' and not coalesce((p_payload->>'permanent')::boolean,false) then
    milliseconds := (p_payload->>'deferMs')::bigint;
    if milliseconds is null or milliseconds<1 then raise exception 'invalid capacity delay'; end if;
    wake_at := clock_timestamp()+make_interval(secs=>least(86400000,milliseconds)/1000.0);
    update private.authoring_tasks set state='queued',attempts=greatest(0,attempts-1),available_at=wake_at,
      lease_token=null,lease_until=null,updated_at=clock_timestamp() where job_id=requested_id;
    update public.ai_jobs set error='A capacidade gratuita compartilhada está temporariamente indisponível. O pedido será retomado automaticamente.',
      progress=jsonb_build_object('phase','waiting','reason','capacity','retryAt',wake_at,'updatedAt',clock_timestamp()) where id=requested_id;
    return 'true'::jsonb; -- No 24-hour expiration; completed checkpoints and original quota day survive.
  end if;
  if p_action='finish' and job.mode='create' and p_payload#>>'{outcome,effects,package,problem,origin}'='native'
    and p_payload#>>'{outcome,effects,package,problem,status}' in ('validated','pending_review')
    and p_payload#>>'{outcome,effects,package,validation,valid}'='true' then
    if not private.reserve_creation(requested_id) then perform private.defer_creation_quota(requested_id); return 'false'::jsonb; end if;
  end if;
  result := public.authoring_queue_v2(p_action,p_payload);
  if result='true'::jsonb and p_action='finish' then
    update private.creation_reservations set state=case when job.mode='create'
      and p_payload#>>'{outcome,effects,package,problem,origin}'='native'
      and p_payload#>>'{outcome,effects,package,problem,status}' in ('validated','pending_review')
      and p_payload#>>'{outcome,effects,package,validation,valid}'='true' then 'consumed' else 'released' end,
      problem_id=(p_payload#>>'{outcome,effects,package,problem,id}')::uuid,updated_at=clock_timestamp()
      where job_id=requested_id and state='reserved';
  elsif result='true'::jsonb and p_action='retry' and exists(select 1 from private.authoring_tasks where job_id=requested_id and state='failed') then
    update private.creation_reservations set state='released',updated_at=clock_timestamp() where job_id=requested_id and state='reserved';
  end if;
  return result;
end;
$$;
revoke all on function public.authoring_queue(text,jsonb) from public,anon,authenticated;
grant execute on function public.authoring_queue(text,jsonb) to service_role;
revoke all on function private.beta_profile_created(), private.beta_identity_created(), private.beta_allowed(uuid),
  private.pause_beta_job(uuid), private.reserve_creation(uuid), private.defer_creation_quota(uuid) from public,anon,authenticated,service_role;
