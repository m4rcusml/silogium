-- Preserve the existing RPC's named arguments: PostgREST callers send projection.
-- Qualify arguments so PL/pgSQL never confuses them with table columns (42702).
create or replace function public.store_practice_projection(requested_user uuid, projection jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed' using errcode = '42501'; end if;
  if store_practice_projection.projection->>'userId' is distinct from store_practice_projection.requested_user::text
    or store_practice_projection.projection->>'historyComplete' is distinct from 'true' then raise exception 'incomplete projection'; end if;
  -- A user lock prevents concurrent projection writes from interleaving milestones.
  perform pg_advisory_xact_lock(hashtextextended(store_practice_projection.requested_user::text, 402));
  if exists(select 1 from public.practice_projections p where p.user_id=store_practice_projection.requested_user
    and coalesce((p.projection->>'sourceExecutionCount')::integer,0) > coalesce((store_practice_projection.projection->>'sourceExecutionCount')::integer,0)) then return; end if;
  insert into public.practice_projections(user_id,projection) values(store_practice_projection.requested_user,store_practice_projection.projection)
    on conflict(user_id) do update set projection=excluded.projection,updated_at=now();
  for item in select value from jsonb_array_elements(store_practice_projection.projection->'milestones') loop
    insert into public.practice_milestones as existing_milestone(user_id,canonical_problem_id,runtime,kind,unit_id,evidence)
      values(store_practice_projection.requested_user,item->>'canonicalProblemId',item->>'runtime',item->>'kind',coalesce(item->>'unitId',''),item)
      on conflict(user_id,canonical_problem_id,runtime,kind,unit_id) do update set evidence=excluded.evidence
      where (excluded.evidence->>'occurredAt')::timestamptz < (existing_milestone.evidence->>'occurredAt')::timestamptz;
  end loop;
  for item in select value from jsonb_array_elements(store_practice_projection.projection->'completions') loop
    insert into public.problem_completions(user_id,problem_id,problem_version,runtime,evidence)
      values(store_practice_projection.requested_user,(item->>'problemId')::uuid,(item->>'problemVersion')::integer,item->>'runtime',item)
      on conflict(user_id,problem_id,problem_version,runtime) do nothing;
  end loop;
  for item in select value from jsonb_array_elements(store_practice_projection.projection->'achievements') loop
    insert into public.user_achievements(user_id,achievement_id,awarded_at,definition) values(store_practice_projection.requested_user,item->>'id',(item->>'awardedAt')::timestamptz,item)
      on conflict(user_id,achievement_id) do nothing;
  end loop;
end;
$$;

revoke all on function public.store_practice_projection(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.store_practice_projection(uuid,jsonb) to service_role;
