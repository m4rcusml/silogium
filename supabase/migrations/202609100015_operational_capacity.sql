-- Shared operational controls; no provider credentials or content in these tables.
create table private.service_controls (
  service text primary key check(service in ('groq', 'modal')),
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.service_controls(service) values('groq'),('modal');
create table private.modal_budget (
  singleton boolean primary key default true check(singleton),
  verified_until timestamptz,
  cycle_start timestamptz,
  cycle_end timestamptz,
  credit_microusd bigint not null default 0 check(credit_microusd between 0 and 30000000),
  observed_usage_microusd bigint not null default 0 check(observed_usage_microusd >= 0),
  observed_at timestamptz
);
insert into private.modal_budget(singleton) values(true);
create table private.modal_reservations (
  id uuid primary key,
  created_at timestamptz not null default clock_timestamp(),
  estimate_microusd bigint not null check(estimate_microusd > 0),
  finished boolean not null default false
);
create index modal_reservations_time_idx on private.modal_reservations(created_at);
alter table private.service_controls enable row level security;
alter table private.modal_budget enable row level security;
alter table private.modal_reservations enable row level security;
revoke all on private.service_controls, private.modal_budget, private.modal_reservations from public, anon, authenticated;

create function public.operational_capacity(p_action text, p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  instant timestamptz := clock_timestamp();
  budget private.modal_budget;
  output jsonb := '{}'; item text; reason text; retry_at timestamptz;
  estimate bigint; used bigint; request_id uuid; workload_limit bigint;
  cycle_begin timestamptz; cycle_finish timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid payload'; end if;
  select * into budget from private.modal_budget where singleton for update;
  if p_action = 'set_paused' then
    if not exists(select 1 from public.profiles where id = (p_payload->>'actorId')::uuid and role = 'admin') then raise exception 'administrator required'; end if;
    if p_payload->>'service' not in ('groq', 'modal') or jsonb_typeof(p_payload->'paused') <> 'boolean' then raise exception 'invalid service control'; end if;
    update private.service_controls set paused = (p_payload->>'paused')::boolean, updated_at = instant where service = p_payload->>'service';
  elsif p_action = 'verify_modal' then
    -- Operator-only attestation after verifying native Workspace controls. Not exposed by the web UI.
    if not exists(select 1 from public.profiles where id = (p_payload->>'actorId')::uuid and role = 'admin') then raise exception 'administrator required'; end if;
    cycle_begin := (p_payload->>'cycleStart')::timestamptz;
    cycle_finish := (p_payload->>'cycleEnd')::timestamptz;
    estimate := (p_payload->>'creditMicrousd')::bigint;
    workload_limit := coalesce((p_payload->>'workloadLimitMicrousd')::bigint, estimate);
    if cycle_begin is null or cycle_finish is null or cycle_begin > instant or cycle_finish <= instant or cycle_finish > instant + interval '32 days'
      or estimate is null or estimate not between 1 and 30000000
      or (p_payload->>'grossLimitMicrousd')::bigint > estimate
      or (p_payload->>'grossLimitMicrousd')::bigint is null
      or workload_limit is null or workload_limit < 1 or workload_limit > estimate
      or (p_payload->>'netLimitMicrousd')::bigint is distinct from 0 then raise exception 'free-only financial controls not verified'; end if;
    update private.modal_budget set verified_until = cycle_finish, cycle_start = cycle_begin, cycle_end = cycle_finish,
      -- A lower application allowance (e.g. $1 smoke) does not claim native caps changed.
      credit_microusd = least(estimate, (p_payload->>'grossLimitMicrousd')::bigint, workload_limit),
      observed_usage_microusd = case when budget.cycle_start is not distinct from cycle_begin then observed_usage_microusd else 0 end,
      observed_at = null where singleton;
  elsif p_action = 'observe_modal' then
    cycle_begin := (p_payload->>'cycleStart')::timestamptz;
    cycle_finish := (p_payload->>'cycleEnd')::timestamptz;
    estimate := (p_payload->>'usageMicrousd')::bigint;
    if estimate is null or estimate < 0 or cycle_begin is distinct from budget.cycle_start or cycle_finish is distinct from budget.cycle_end then
      raise exception 'unverified billing cycle';
    end if;
    update private.modal_budget set observed_usage_microusd = greatest(observed_usage_microusd, estimate), observed_at = instant where singleton;
  elsif p_action = 'finish_modal' then
    update private.modal_reservations set finished = true where id = (p_payload->>'id')::uuid;
    return 'true'::jsonb;
  elsif p_action not in ('status', 'reserve_modal') then raise exception 'invalid capacity action'; end if;

  select * into budget from private.modal_budget where singleton;
  -- Reservations are conservative ceilings, NOT a provider invoice or exact remaining credit.
  -- Account readings include other workloads and may lag. Add ceilings rather than
  -- subtracting an unproven overlap. This can pause early; it is NOT the free balance.
  select budget.observed_usage_microusd + coalesce(sum(estimate_microusd), 0) into used
    from private.modal_reservations where created_at >= budget.cycle_start;
  foreach item in array array['groq', 'modal'] loop
    reason := null; retry_at := null;
    if (select paused from private.service_controls where service = item) then
      reason := 'Processamento suspenso pelo administrador. O catálogo continua disponível.';
    elsif item = 'groq' then
      select until_at into retry_at from private.groq_cooldown where singleton;
      -- Show known local rolling-window exhaustion before booting the heavy worker.
      -- A retryAt is the next capacity check, not a promised provider renewal.
      select greatest(retry_at, max(inflight_until)) into retry_at from private.groq_capacity
        where created_at > instant - interval '24 hours';
      if (select count(*) >= 30 or coalesce(sum(tokens), 0) >= 8000 from private.groq_capacity where created_at > instant - interval '1 minute') then
        select greatest(retry_at, min(created_at) + interval '1 minute') into retry_at from private.groq_capacity where created_at > instant - interval '1 minute';
      end if;
      if (select count(*) >= 1000 or coalesce(sum(tokens), 0) >= 200000 from private.groq_capacity where created_at > instant - interval '24 hours') then
        select greatest(retry_at, min(created_at) + interval '24 hours') into retry_at from private.groq_capacity where created_at > instant - interval '24 hours';
      end if;
      if retry_at > instant then reason := 'A capacidade compartilhada da IA está ocupada. Seu pedido pode aguardar.';
      else retry_at := null; end if;
    elsif budget.verified_until is null or budget.verified_until <= instant then
      reason := 'A execução remota aguarda a confirmação das proteções financeiras deste ciclo.';
    elsif budget.observed_at is null or budget.observed_at < instant - interval '15 minutes' then
      reason := 'A execução remota aguarda a atualização do consumo gratuito. Nenhum novo trabalho será iniciado.';
    elsif used >= budget.credit_microusd then
      reason := 'A capacidade gratuita de execução está reservada ou esgotada. Seus pedidos serão preservados.';
      -- Next cycle still requires new financial verification: do not promise an automatic renewal.
    end if;
    output := output || jsonb_build_object(item, jsonb_strip_nulls(jsonb_build_object(
      'available', reason is null, 'reason', reason, 'retryAt', retry_at)));
  end loop;
  if p_action = 'reserve_modal' then
    request_id := (p_payload->>'id')::uuid;
    estimate := (p_payload->>'estimateMicrousd')::bigint;
    if request_id is null or estimate is null or estimate not between 1 and 10000000 then raise exception 'invalid reservation'; end if;
    if output#>>'{modal,available}' <> 'true' then return jsonb_build_object('allowed', false, 'availability', output->'modal'); end if;
    if exists(select 1 from private.modal_reservations where id = request_id) then
      if not exists(select 1 from private.modal_reservations where id = request_id and estimate_microusd = estimate and not finished and created_at >= budget.cycle_start) then raise exception 'reservation identity conflict'; end if;
      return '{"allowed":true}'::jsonb;
    end if;
    if used + estimate > budget.credit_microusd then return jsonb_build_object('allowed', false, 'availability',
      jsonb_build_object('available', false, 'reason', 'O saldo gratuito disponível não cobre a reserva deste trabalho.')); end if;
    insert into private.modal_reservations(id, estimate_microusd) values(request_id, estimate);
    return '{"allowed":true}'::jsonb;
  end if;
  return output;
end;
$$;
revoke all on function public.operational_capacity(text,jsonb) from public, anon, authenticated;
grant execute on function public.operational_capacity(text,jsonb) to service_role;
