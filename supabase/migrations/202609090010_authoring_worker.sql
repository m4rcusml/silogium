-- Transactional queue/outbox. pgmq queues from 001 are intentionally not used:
-- lease, checkpoints, content effects and the job's public result share one commit.
create table private.authoring_tasks (
  job_id uuid primary key references public.ai_jobs(id) on delete cascade,
  state text not null default 'queued' check (state in ('queued', 'leased', 'done', 'waiting', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  worker_id text,
  confirmed boolean not null default false,
  ai_reserved boolean not null default false,
  checkpoints jsonb not null default '{}' check (jsonb_typeof(checkpoints) = 'object' and octet_length(checkpoints::text) <= 33554432),
  admitted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index authoring_tasks_available_idx on private.authoring_tasks(state, available_at, lease_until);
create index ai_jobs_admission_owner_idx on public.ai_jobs(user_id, id);
alter table private.authoring_tasks enable row level security;
revoke all on private.authoring_tasks from public, anon, authenticated;
grant all on private.authoring_tasks to service_role;

create function private.authoring_turn(p_job public.ai_jobs, p_turn jsonb)
returns void language plpgsql set search_path = '' as $$
declare conversation uuid;
begin
  if p_turn is null then return; end if;
  conversation := (p_job.request->>'conversationId')::uuid;
  -- Do not resurrect history deleted while a worker was running.
  perform 1 from public.authoring_conversations where id = conversation and user_id = p_job.user_id for key share;
  if not found then return; end if;
  insert into public.authoring_conversation_turns(id, conversation_id, user_id, job_id, mode, user_text, assistant_text, status, created_at, updated_at)
  values(p_job.id, conversation, p_job.user_id, p_job.id, p_job.mode,
    left(coalesce(p_turn->>'userText', ''), 2000), left(coalesce(p_turn->>'assistantText', ''), 700), p_job.status, p_job.created_at, now())
  on conflict (id) do update set assistant_text = excluded.assistant_text, status = excluded.status, updated_at = excluded.updated_at;
end;
$$;
revoke all on function private.authoring_turn(public.ai_jobs, jsonb) from public, anon, authenticated;

-- One service-only seam. Client-supplied data never determines worker ownership,
-- attempt limits or quota reservations; the web supplies a verified actor id.
create function public.authoring_queue(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  task private.authoring_tasks;
  job public.ai_jobs;
  profile public.profiles;
  requested_job_id uuid := (p_payload->>'jobId')::uuid;
  token uuid := (p_payload->>'token')::uuid;
  seconds integer;
  selected_id uuid;
  value jsonb;
  definition jsonb;
  provenance jsonb;
  record jsonb;
  candidate jsonb;
  outcome jsonb;
  terminal boolean;
  expected integer;
  owner uuid;
  generated_problem_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 33554432 then raise exception 'invalid queue payload'; end if;

  if p_action = 'enqueue' then
    value := p_payload->'job';
    requested_job_id := (value->>'id')::uuid;
    owner := (value->>'actorId')::uuid;
    if requested_job_id is null or owner is null or owner is distinct from (p_payload->>'actorId')::uuid
      or value->>'status' is distinct from 'running' or jsonb_typeof(value->'request') is distinct from 'object'
      or octet_length((value->'request')::text) > 32768 then raise exception 'invalid queued job'; end if;
    -- Serialize admission per user even when their queue is empty; FK reads remain compatible.
    perform 1 from public.profiles where id = owner for no key update;
    if not found then raise exception 'actor not found'; end if;
    select * into job from public.ai_jobs where id = requested_job_id;
    if found then
      if job.user_id <> owner or job.request is distinct from value->'request' then raise exception 'job identity conflict'; end if;
      if exists(select 1 from private.authoring_tasks q where q.job_id = requested_job_id) then return 'true'::jsonb; end if;
      raise exception 'legacy job requires explicit recovery';
    end if;
    if (select count(*) from private.authoring_tasks q join public.ai_jobs j on j.id = q.job_id where j.user_id = owner and q.state in ('queued', 'leased')) >= 3
      then raise exception 'Você já tem três pedidos pendentes. Conclua os anteriores antes de criar outro.'; end if;
    if (select count(*) from private.authoring_tasks q join public.ai_jobs j on j.id = q.job_id where j.user_id = owner and q.admitted_at > clock_timestamp() - interval '1 minute') >= 10
      then raise exception 'Limite de dez pedidos por minuto. Aguarde antes de tentar novamente.'; end if;
    if p_payload ? 'newConversation' and p_payload->'newConversation' <> 'null'::jsonb then
      if (p_payload#>>'{newConversation,actorId}')::uuid is distinct from owner
        or (p_payload#>>'{newConversation,id}')::uuid is distinct from (value#>>'{request,conversationId}')::uuid then raise exception 'invalid conversation'; end if;
      insert into public.authoring_conversations(id, user_id, title)
        values((value#>>'{request,conversationId}')::uuid, owner, left(p_payload#>>'{newConversation,title}', 120));
    end if;
    if value#>>'{request,conversationId}' is not null and not exists(
      select 1 from public.authoring_conversations where id = (value#>>'{request,conversationId}')::uuid and user_id = owner
    ) then raise exception 'conversation not found'; end if;
    insert into public.ai_jobs(id, user_id, mode, status, request, created_at)
      values(requested_job_id, owner, value#>>'{request,mode}', 'running', value->'request', (value->>'createdAt')::timestamptz)
      on conflict (id) do nothing;
    select * into job from public.ai_jobs where id = requested_job_id for update;
    if job.user_id <> owner or job.request is distinct from value->'request' then raise exception 'job identity conflict'; end if;
    insert into private.authoring_tasks(job_id) values(requested_job_id) on conflict do nothing;
    if not found then return 'true'::jsonb; end if;
    perform private.authoring_turn(job, p_payload->'turn');
    return 'true'::jsonb;
  end if;

  if p_action = 'claim' then
    seconds := (p_payload->>'leaseSeconds')::integer;
    if seconds is null or seconds < 30 or seconds > 900 or length(coalesce(p_payload->>'workerId', '')) not between 1 and 200 then raise exception 'invalid lease'; end if;
    -- Death on the last attempt becomes a terminal failure instead of an eternal running job.
    for selected_id in select q.job_id from private.authoring_tasks q where q.state = 'leased' and q.lease_until <= clock_timestamp() and q.attempts >= 3 for update skip locked loop
      update private.authoring_tasks set state = 'failed', lease_token = null, lease_until = null, checkpoints = '{}', updated_at = now() where authoring_tasks.job_id = selected_id;
      update public.ai_jobs set status = 'failed', completed_at = now(), error = 'O worker não concluiu o pedido após três tentativas. Faça um novo pedido para tentar novamente.' where id = selected_id returning * into job;
      perform private.authoring_turn(job, jsonb_build_object('assistantText', 'O pedido não foi concluído após três tentativas.'));
    end loop;
    select q.* into task from private.authoring_tasks q
      where ((q.state = 'queued' and q.available_at <= clock_timestamp()) or (q.state = 'leased' and q.lease_until <= clock_timestamp())) and q.attempts < 3
      order by q.available_at, q.job_id limit 1 for update skip locked;
    if not found then return null; end if;
    select * into job from public.ai_jobs where id = task.job_id;
    select * into profile from public.profiles where id = job.user_id;
    update private.authoring_tasks set state = 'leased', attempts = attempts + 1, lease_token = gen_random_uuid(), lease_until = clock_timestamp() + make_interval(secs => seconds), worker_id = p_payload->>'workerId', updated_at = now()
      where authoring_tasks.job_id = task.job_id returning * into task;
    return jsonb_build_object('job', jsonb_build_object('id', job.id, 'actorId', job.user_id, 'status', job.status, 'request', job.request, 'createdAt', job.created_at),
      'actor', jsonb_build_object('id', profile.id, 'handle', profile.handle, 'role', profile.role),
      'token', task.lease_token, 'attempt', task.attempts, 'confirmed', task.confirmed, 'checkpoints', task.checkpoints);
  end if;

  if p_action = 'confirm' then
    perform 1 from public.profiles p join public.ai_jobs j on j.user_id = p.id
      where j.id = requested_job_id and p.id = (p_payload->>'actorId')::uuid for no key update of p;
  end if;
  select q.* into task from private.authoring_tasks q where q.job_id = requested_job_id for update;
  if not found then return 'false'::jsonb; end if;
  select * into job from public.ai_jobs where id = task.job_id;
  if p_action = 'confirm' then
    if job.user_id is distinct from (p_payload->>'actorId')::uuid then return 'false'::jsonb; end if;
    if task.confirmed then return 'true'::jsonb; end if;
    if task.state <> 'waiting' or job.status <> 'needs_confirmation' or job.mode <> 'create' then return 'false'::jsonb; end if;
    if (select count(*) from private.authoring_tasks q join public.ai_jobs j on j.id = q.job_id where j.user_id = job.user_id and q.state in ('queued', 'leased')) >= 3
      then raise exception 'Você já tem três pedidos pendentes. Conclua os anteriores antes de confirmar outro.'; end if;
    update private.authoring_tasks set state = 'queued', confirmed = true, attempts = 0, available_at = now(), updated_at = now() where authoring_tasks.job_id = requested_job_id;
    update public.ai_jobs set status = 'running', result = null, error = null, completed_at = null where id = requested_job_id returning * into job;
    perform private.authoring_turn(job, jsonb_build_object('assistantText', 'Criação confirmada; aguardando processamento.'));
    return 'true'::jsonb;
  end if;
  if task.state <> 'leased' or task.lease_token is distinct from token or task.lease_until <= clock_timestamp() then return 'false'::jsonb; end if;

  if p_action = 'heartbeat' then
    seconds := (p_payload->>'leaseSeconds')::integer;
    if seconds is null or seconds < 30 or seconds > 900 then raise exception 'invalid lease'; end if;
    update private.authoring_tasks set lease_until = clock_timestamp() + make_interval(secs => seconds), updated_at = now() where authoring_tasks.job_id = requested_job_id;
  elsif p_action = 'checkpoint' then
    if coalesce(p_payload->>'key', '') !~ '^[a-z0-9-]{1,80}$' or not (p_payload ? 'value') then raise exception 'invalid checkpoint'; end if;
    -- First completed attempt wins a step. Retried provider output cannot overwrite it.
    if not (task.checkpoints ? (p_payload->>'key')) then
      update private.authoring_tasks set checkpoints = checkpoints || jsonb_build_object(p_payload->>'key', p_payload->'value'), updated_at = now() where authoring_tasks.job_id = requested_job_id;
    end if;
  elsif p_action = 'reserve_ai' then
    if not task.ai_reserved then
      value := public.consume_quota_for(job.user_id, 'ai');
      if value->>'allowed' <> 'true' then return 'false'::jsonb; end if;
      update private.authoring_tasks set ai_reserved = true where authoring_tasks.job_id = requested_job_id;
    end if;
  elsif p_action = 'retry' then
    terminal := coalesce((p_payload->>'permanent')::boolean, false) or task.attempts >= 3;
    update private.authoring_tasks set state = case when terminal then 'failed' else 'queued' end,
      available_at = clock_timestamp() + make_interval(secs => case when task.attempts = 1 then 10 else 30 end),
      lease_token = null, lease_until = null, checkpoints = case when terminal then '{}'::jsonb else checkpoints end, updated_at = now() where authoring_tasks.job_id = requested_job_id;
    update public.ai_jobs set status = case when terminal then 'failed'::public.job_status else 'running'::public.job_status end,
      error = case when terminal then left(coalesce(p_payload->>'error', 'Falha no processamento.'), 2000) else 'O processamento será retomado automaticamente.' end,
      completed_at = case when terminal then now() else null end where id = requested_job_id returning * into job;
    perform private.authoring_turn(job, jsonb_build_object('assistantText', case when terminal then 'O pedido não foi concluído. Consulte os detalhes.' else 'O processamento será retomado automaticamente.' end));
  elsif p_action = 'finish' then
    outcome := p_payload->'outcome';
    if (outcome#>>'{job,id}')::uuid is distinct from job.id or (outcome#>>'{job,actorId}')::uuid is distinct from job.user_id
      or outcome#>>'{job,status}' not in ('completed', 'needs_confirmation') then raise exception 'invalid job outcome'; end if;
    if jsonb_typeof(outcome->'effects') is distinct from 'object' or (select count(*) from jsonb_object_keys(outcome->'effects')) > 1 then raise exception 'invalid job effects'; end if;
    if outcome#>>'{job,status}' = 'needs_confirmation' and (outcome->'effects') <> '{}'::jsonb then raise exception 'confirmation cannot apply effects'; end if;
    value := outcome#>'{effects,package}';
    if value is not null then
      definition := value->'problem'; provenance := definition->'provenance';
      generated_problem_id := (definition->>'id')::uuid;
      owner := coalesce((provenance->>'createdBy')::uuid, (provenance->>'importedBy')::uuid);
      if owner is distinct from job.user_id or (definition->>'version')::integer <> 1
        or definition->>'status' not in ('validated', 'pending_review', 'rejected')
        or value->>'fingerprint' is null then raise exception 'invalid generated package'; end if;
      insert into public.problems(id, slug, owner_id, origin, visibility, status, current_version, latest_version, title, summary, difficulty, format, runtimes, tags, source_url, fingerprint, unlisted_access_hash, created_at, updated_at)
      values(generated_problem_id, definition->>'slug', owner, (definition->>'origin')::public.problem_origin, (definition->>'visibility')::public.problem_visibility,
        (definition->>'status')::public.problem_status, 1, 1, definition->>'title', definition->>'summary', definition->>'difficulty', definition->>'format',
        array(select jsonb_array_elements(definition->'runtimes')->>'language'), array(select jsonb_array_elements_text(definition->'tags')),
        case when definition->>'origin' = 'licensed_import' then provenance->>'sourceUrl' else null end,
        value->>'fingerprint', value->>'accessHash', (definition->>'createdAt')::timestamptz, (definition->>'updatedAt')::timestamptz);
      insert into public.problem_versions(problem_id, version, definition, created_by) values(generated_problem_id, 1, definition, owner);
      perform public.insert_private_judge_bundle(generated_problem_id, 1, value->'bundle', value->>'checksum', value->'validation');
      if definition->>'origin' = 'licensed_import' then
        insert into public.problem_sources(problem_id, source_name, source_url, license_spdx, authors, commit_sha, retrieved_at, metadata)
        values(generated_problem_id, provenance->>'sourceName', provenance->>'sourceUrl', provenance->>'licenseSpdx', array(select jsonb_array_elements_text(provenance->'authors')),
          provenance->>'commitSha', (provenance->>'retrievedAt')::timestamptz,
          provenance - array['kind', 'sourceName', 'sourceUrl', 'licenseSpdx', 'authors', 'commitSha', 'retrievedAt']);
      end if;
      if definition->>'status' = 'pending_review' then insert into public.publication_reviews(problem_id, problem_version, requested_by) values(generated_problem_id, 1, owner); end if;
    end if;
    value := outcome#>'{effects,editorial}';
    if value is not null then
      record := value->'record'; expected := (value->>'expectedRevision')::integer; generated_problem_id := (record->>'problemId')::uuid;
      if not exists(select 1 from public.problems p where p.id = generated_problem_id and (p.owner_id = job.user_id or exists(select 1 from public.profiles where id = job.user_id and role = 'admin'))) then raise exception 'editorial access denied'; end if;
      if not public.save_editorial_record(generated_problem_id, expected, record) then raise exception 'editorial revision conflict'; end if;
    end if;
    for candidate in select jsonb_array_elements(coalesce(outcome#>'{effects,candidates}', '[]')) loop
      insert into public.external_problem_candidates(user_id, canonical_url, runtime, candidate)
      values(job.user_id, candidate->>'url', candidate->>'runtime', candidate)
      on conflict(user_id, canonical_url, runtime) do update set candidate = excluded.candidate, updated_at = now();
    end loop;
    value := outcome#>'{job,result}';
    if value->>'kind' = 'create' then
      value := jsonb_build_object('kind', 'create', 'package', jsonb_build_object('problem', value#>'{package,problem}', 'validation', value#>'{package,validation}', 'accessKey', value#>'{package,accessKey}'));
    end if;
    update public.ai_jobs set status = (outcome#>>'{job,status}')::public.job_status, result = value, error = outcome#>>'{job,error}',
      completed_at = case when outcome#>>'{job,status}' = 'completed' then now() else null end where id = requested_job_id returning * into job;
    perform private.authoring_turn(job, outcome->'turn');
    update private.authoring_tasks set state = case when job.status = 'needs_confirmation' then 'waiting' else 'done' end,
      checkpoints = case when job.status = 'needs_confirmation' then checkpoints else '{}'::jsonb end,
      lease_token = null, lease_until = null, updated_at = now() where authoring_tasks.job_id = requested_job_id;
  else raise exception 'unknown queue action';
  end if;
  return 'true'::jsonb;
end;
$$;
revoke all on function public.authoring_queue(text, jsonb) from public, anon, authenticated;
grant execute on function public.authoring_queue(text, jsonb) to service_role;
comment on table private.authoring_tasks is 'Durable at-least-once processing with fenced, atomic effects. Checkpoints are private and removed after terminal completion. Legacy jobs without a task are intentionally not replayed.';
