-- No API credentials, prompts or model outputs belong in the capacity ledger.
create table private.groq_capacity (
  id uuid primary key, created_at timestamptz not null default clock_timestamp(),
  tokens bigint not null check(tokens >= 0), inflight_until timestamptz,
  settled boolean not null default false
);
create index groq_capacity_time_idx on private.groq_capacity(created_at);
create table private.groq_cooldown (singleton boolean primary key default true check(singleton), until_at timestamptz not null);
insert into private.groq_cooldown values(true, '-infinity');
alter table private.groq_capacity enable row level security;
alter table private.groq_cooldown enable row level security;
revoke all on private.groq_capacity, private.groq_cooldown from public, anon, authenticated;

-- Conservative rolling limits for this integration, not an assertion of account entitlement.
create function public.groq_capacity(p_action text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  instant timestamptz := clock_timestamp();
  request_id uuid := (p_payload->>'id')::uuid;
  requested bigint := (p_payload->>'tokens')::bigint;
  wait_until timestamptz;
  amount bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if request_id is null then raise exception 'request id required'; end if;
  -- One lock serializes all workers, including empty windows and settlements.
  select until_at into wait_until from private.groq_cooldown where singleton for update;
  delete from private.groq_capacity where created_at <= instant - interval '24 hours';
  if p_action = 'settle' then
    amount := (p_payload->>'actualTokens')::bigint;
    if amount is not null and (amount < 0 or amount > 10000000) then raise exception 'invalid usage'; end if;
    update private.groq_capacity set tokens = coalesce(amount, tokens), inflight_until = null, settled = true
      where id = request_id and not settled;
    update private.groq_cooldown set until_at = greatest(until_at, instant + make_interval(secs => least(86400000, greatest(0, coalesce((p_payload->>'cooldownMs')::integer, 0))) / 1000.0)) where singleton;
    return 'true'::jsonb;
  end if;
  if p_action <> 'reserve' or requested is null or requested < 1 or requested > 8000 then raise exception 'invalid capacity reservation'; end if;
  if exists(select 1 from private.groq_capacity where id = request_id) then return '{"allowed":true}'::jsonb; end if;
  select greatest(wait_until, max(inflight_until)) into wait_until from private.groq_capacity;
  if (select count(*) >= 30 or coalesce(sum(tokens), 0) + requested > 8000 from private.groq_capacity where created_at > instant - interval '1 minute') then
    select greatest(wait_until, min(created_at) + interval '1 minute') into wait_until from private.groq_capacity where created_at > instant - interval '1 minute';
  end if;
  if (select count(*) >= 1000 or coalesce(sum(tokens), 0) + requested > 200000 from private.groq_capacity) then
    select greatest(wait_until, min(created_at) + interval '24 hours') into wait_until from private.groq_capacity;
  end if;
  if wait_until > instant then return jsonb_build_object('allowed', false, 'retryAfterMs', greatest(1000, ceil(extract(epoch from wait_until - instant) * 1000))); end if;
  insert into private.groq_capacity(id, tokens, inflight_until) values(request_id, requested, instant + interval '120 seconds');
  return '{"allowed":true}'::jsonb;
end;
$$;
revoke all on function public.groq_capacity(text, jsonb) from public, anon, authenticated;
grant execute on function public.groq_capacity(text, jsonb) to service_role;

alter table public.ai_jobs add column progress jsonb check (
  progress is null or (jsonb_typeof(progress) = 'object' and octet_length(progress::text) < 512
  and progress->>'phase' in ('definition', 'code', 'cases', 'search', 'validation', 'repair', 'waiting'))
);
alter table private.authoring_tasks add column ai_quota_day date;
alter table private.authoring_tasks add column ai_refunded boolean not null default false;

create function private.refund_authoring_quota(requested_id uuid) returns void
language plpgsql set search_path = '' as $$
declare task private.authoring_tasks; owner_id uuid;
begin
  select * into task from private.authoring_tasks where job_id = requested_id for update;
  if not found or not task.ai_reserved or task.ai_refunded or task.ai_quota_day is null then return; end if;
  select user_id into owner_id from public.ai_jobs where id = requested_id;
  -- Refund the reservation's original UTC database day, never an unrelated operation tomorrow.
  update private.usage_counters set daily_count = greatest(0, daily_count - 1)
    where user_id = owner_id and kind = 'ai' and day = task.ai_quota_day;
  update private.authoring_tasks set ai_refunded = true where job_id = requested_id;
end;
$$;
revoke all on function private.refund_authoring_quota(uuid) from public, anon, authenticated, service_role;

-- Preserve the transactional content writer from 010; extend only the queue-control seam.
alter function public.authoring_queue(text, jsonb) rename to authoring_queue_v1;
revoke all on function public.authoring_queue_v1(text, jsonb) from public, anon, authenticated, service_role;
create function public.authoring_queue(p_action text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  task private.authoring_tasks; result jsonb; expired_id uuid;
  final_leases uuid[] := '{}';
  requested_id uuid := (p_payload->>'jobId')::uuid;
  token uuid := (p_payload->>'token')::uuid;
  milliseconds integer := (p_payload->>'deferMs')::integer;
  wake_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_action in ('progress', 'retry', 'reserve_ai') then
    select * into task from private.authoring_tasks where job_id = requested_id for update;
    if not found or task.state <> 'leased' or task.lease_token is distinct from token or task.lease_until <= clock_timestamp() then return 'false'::jsonb; end if;
  end if;
  if p_action = 'progress' then
    if p_payload->>'phase' is null or p_payload->>'phase' not in ('definition', 'code', 'cases', 'search', 'validation', 'repair', 'waiting') then raise exception 'invalid phase'; end if;
    update public.ai_jobs set progress = jsonb_build_object('phase', p_payload->>'phase', 'updatedAt', clock_timestamp()) where id = requested_id;
    return 'true'::jsonb;
  end if;
  if p_action = 'retry' and milliseconds is not null and not coalesce((p_payload->>'permanent')::boolean, false) then
    if task.admitted_at > clock_timestamp() - interval '24 hours' then
      wake_at := clock_timestamp() + make_interval(secs => least(86400000, greatest(1000, milliseconds)) / 1000.0);
      update private.authoring_tasks set state = 'queued', attempts = greatest(0, attempts - 1), available_at = wake_at,
        lease_token = null, lease_until = null, updated_at = now() where job_id = requested_id;
      update public.ai_jobs set error = 'A capacidade compartilhada da IA está ocupada. O pedido será retomado automaticamente.',
        progress = jsonb_build_object('phase', 'waiting', 'updatedAt', clock_timestamp(), 'retryAt', wake_at) where id = requested_id;
      return 'true'::jsonb;
    end if;
    p_payload := p_payload || '{"permanent":true,"refund":true}'::jsonb;
  end if;
  if p_action = 'claim' then
    -- Remember the previous state under lock: only worker-death transitions may
    -- be refunded by claim. Include still-valid final leases so expiry between
    -- these queries is handled without sweeping explicit business failures.
    for expired_id in select job_id from private.authoring_tasks
      where state = 'leased' and attempts >= 3 for update skip locked loop
      final_leases := array_append(final_leases, expired_id);
    end loop;
  end if;
  result := public.authoring_queue_v1(p_action, p_payload);
  if p_action = 'reserve_ai' and result = 'true'::jsonb and not task.ai_reserved then
    update private.authoring_tasks set ai_quota_day = current_date where job_id = requested_id;
  elsif p_action = 'retry' and result = 'true'::jsonb and coalesce((p_payload->>'refund')::boolean, false)
    and exists(select 1 from private.authoring_tasks where job_id = requested_id and state = 'failed') then
    perform private.refund_authoring_quota(requested_id);
  elsif p_action = 'claim' then
    -- The failure and refund commit together. Already-failed jobs retain the
    -- refund decision supplied by retry, including refund=false on attempt 3.
    for expired_id in select job_id from private.authoring_tasks
      where job_id = any(final_leases) and state = 'failed' loop
      perform private.refund_authoring_quota(expired_id);
    end loop;
  end if;
  return result;
end;
$$;
revoke all on function public.authoring_queue(text, jsonb) from public, anon, authenticated;
grant execute on function public.authoring_queue(text, jsonb) to service_role;
