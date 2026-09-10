-- Durable history, server-only evidence, transactional outbox and private practice.
-- Old records deliberately retain NULL evidence; accepted does not imply official.
alter table public.submissions add column if not exists max_stage integer check (max_stage between 1 and 4);
alter table public.submissions add column if not exists practice_evidence jsonb;
alter table public.submissions add column if not exists source_available boolean generated always as (length(source) > 0) stored;
create index if not exists submissions_user_cursor_idx on public.submissions(user_id, created_at desc, id desc);
drop policy if exists "users create own submissions" on public.submissions;
drop policy if exists "users read own submissions" on public.submissions;
create policy "users read own submissions" on public.submissions for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.submissions from anon, authenticated;

create table public.practice_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.practice_projections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  updated_at timestamptz not null default now()
);
create table private.practice_outbox (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  evidence jsonb,
  created_at timestamptz not null default now()
);
create table public.practice_milestones (
  user_id uuid not null references public.profiles(id) on delete cascade,
  canonical_problem_id text not null,
  runtime text not null check (runtime in ('typescript','python')),
  kind text not null check (kind in ('problem_completed','stage_completed')),
  unit_id text not null default '',
  evidence jsonb not null,
  primary key(user_id, canonical_problem_id, runtime, kind, unit_id)
);
create table public.problem_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id uuid not null,
  problem_version integer not null,
  runtime text not null check (runtime in ('typescript','python')),
  evidence jsonb not null,
  primary key(user_id, problem_id, problem_version, runtime)
);
create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null check (achievement_id in ('first_solution','step_by_step','two_languages','five_catalog_problems')),
  awarded_at timestamptz not null,
  definition jsonb not null,
  primary key(user_id, achievement_id)
);

alter table public.practice_settings enable row level security;
alter table public.practice_projections enable row level security;
alter table public.practice_milestones enable row level security;
alter table public.problem_completions enable row level security;
alter table public.user_achievements enable row level security;
create policy "own practice settings" on public.practice_settings for select to authenticated using (user_id = auth.uid());
create policy "own practice projection" on public.practice_projections for select to authenticated using (user_id = auth.uid());
create policy "own practice milestones" on public.practice_milestones for select to authenticated using (user_id = auth.uid());
create policy "own problem completions" on public.problem_completions for select to authenticated using (user_id = auth.uid());
create policy "own achievements" on public.user_achievements for select to authenticated using (user_id = auth.uid());
revoke all on public.practice_settings, public.practice_projections, public.practice_milestones, public.problem_completions, public.user_achievements from anon, authenticated;
grant select on public.practice_settings, public.practice_projections, public.practice_milestones, public.problem_completions, public.user_achievements to authenticated;
grant all on public.practice_settings, public.practice_projections, public.practice_milestones, public.problem_completions, public.user_achievements to service_role;
revoke all on private.practice_outbox from public, anon, authenticated;

create function public.finalize_practice_submission(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare existing public.submissions; requested_id uuid := (payload->>'id')::uuid; inserted_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if payload->'practice_evidence' is not null and payload->'practice_evidence' <> 'null'::jsonb and (
    payload#>>'{practice_evidence,userId}' is distinct from payload->>'user_id'
    or payload#>>'{practice_evidence,submissionId}' is distinct from payload->>'id'
    or payload#>>'{practice_evidence,problemId}' is distinct from payload->>'problem_id'
    or payload#>>'{practice_evidence,problemVersion}' is distinct from payload->>'problem_version'
    or payload#>>'{practice_evidence,runtime}' is distinct from payload->>'runtime'
    or payload#>>'{practice_evidence,kind}' is distinct from payload->>'kind'
    or payload#>>'{practice_evidence,verdict}' is distinct from payload->>'verdict'
  ) then raise exception 'evidence mismatch'; end if;
  insert into public.submissions(id,user_id,problem_id,problem_version,runtime,kind,source,max_stage,verdict,score,max_score,duration_ms,result,practice_evidence,created_at,completed_at)
  values (requested_id,(payload->>'user_id')::uuid,(payload->>'problem_id')::uuid,(payload->>'problem_version')::integer,payload->>'runtime',payload->>'kind',payload->>'source',
    (payload->>'max_stage')::integer,(payload->>'verdict')::public.execution_verdict,(payload->>'score')::integer,(payload->>'max_score')::integer,(payload->>'duration_ms')::integer,
    payload->'result',nullif(payload->'practice_evidence','null'::jsonb),(payload->>'created_at')::timestamptz,now())
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select * into existing from public.submissions where id=requested_id;
    if existing.user_id is distinct from (payload->>'user_id')::uuid or existing.problem_id is distinct from (payload->>'problem_id')::uuid
      or existing.problem_version is distinct from (payload->>'problem_version')::integer or existing.source is distinct from payload->>'source'
      or existing.runtime is distinct from payload->>'runtime' or existing.kind is distinct from payload->>'kind'
      or existing.max_stage is distinct from (payload->>'max_stage')::integer or existing.result is distinct from payload->'result'
      or existing.practice_evidence is distinct from nullif(payload->'practice_evidence','null'::jsonb)
    then raise exception 'submission id reused'; end if;
  end if;
  if payload->>'kind' = 'submission' then
    insert into private.practice_outbox(submission_id,user_id,evidence) values(requested_id,(payload->>'user_id')::uuid,nullif(payload->'practice_evidence','null'::jsonb)) on conflict do nothing;
  end if;
  return requested_id;
end;
$$;

create function public.save_practice_settings(requested_user uuid, expected_revision integer, new_settings jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if expected_revision=0 then
    insert into public.practice_settings(user_id,revision,settings) values(requested_user,1,new_settings) on conflict do nothing;
  else
    update public.practice_settings set settings=new_settings,revision=revision+1,updated_at=now() where user_id=requested_user and revision=expected_revision;
  end if;
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;

create function public.store_practice_projection(requested_user uuid, projection jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if projection->>'userId' is distinct from requested_user::text or projection->>'historyComplete' is distinct from 'true' then raise exception 'incomplete projection'; end if;
  -- A user lock prevents concurrent projection writes from interleaving milestones.
  perform pg_advisory_xact_lock(hashtextextended(requested_user::text, 402));
  if exists(select 1 from public.practice_projections p where p.user_id=requested_user
    and coalesce((p.projection->>'sourceExecutionCount')::integer,0) > coalesce((projection->>'sourceExecutionCount')::integer,0)) then return; end if;
  insert into public.practice_projections(user_id,projection) values(requested_user,projection)
    on conflict(user_id) do update set projection=excluded.projection,updated_at=now();
  for item in select value from jsonb_array_elements(projection->'milestones') loop
    insert into public.practice_milestones as existing_milestone(user_id,canonical_problem_id,runtime,kind,unit_id,evidence)
      values(requested_user,item->>'canonicalProblemId',item->>'runtime',item->>'kind',coalesce(item->>'unitId',''),item)
      on conflict(user_id,canonical_problem_id,runtime,kind,unit_id) do update set evidence=excluded.evidence
      where (excluded.evidence->>'occurredAt')::timestamptz < (existing_milestone.evidence->>'occurredAt')::timestamptz;
  end loop;
  for item in select value from jsonb_array_elements(projection->'completions') loop
    insert into public.problem_completions(user_id,problem_id,problem_version,runtime,evidence)
      values(requested_user,(item->>'problemId')::uuid,(item->>'problemVersion')::integer,item->>'runtime',item)
      on conflict(user_id,problem_id,problem_version,runtime) do nothing;
  end loop;
  for item in select value from jsonb_array_elements(projection->'achievements') loop
    insert into public.user_achievements(user_id,achievement_id,awarded_at,definition) values(requested_user,item->>'id',(item->>'awardedAt')::timestamptz,item)
      on conflict(user_id,achievement_id) do nothing;
  end loop;
end;
$$;
revoke all on function public.finalize_practice_submission(jsonb), public.save_practice_settings(uuid,integer,jsonb), public.store_practice_projection(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.finalize_practice_submission(jsonb), public.save_practice_settings(uuid,integer,jsonb), public.store_practice_projection(uuid,jsonb) to service_role;
