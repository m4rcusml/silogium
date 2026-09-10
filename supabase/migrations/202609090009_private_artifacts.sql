-- The private schema must not be exposed through PostgREST or GraphQL.
-- Public RPC names are discoverable, but only the server service role can execute them.
create function public.read_private_editorial_record(p_problem_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare value jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_problem_id is null then raise exception 'invalid problem'; end if;
  select record into value from private.editorial_records where problem_id = p_problem_id;
  return value;
end;
$$;

create function public.read_private_judge_bundle(p_problem_id uuid, p_problem_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare value jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_problem_id is null or p_problem_version is null or p_problem_version < 1 then raise exception 'invalid problem version'; end if;
  select jsonb_build_object('bundle', bundle, 'validation', validation, 'checksum', checksum)
  into value from private.judge_bundles where problem_id = p_problem_id and problem_version = p_problem_version;
  return value;
end;
$$;

create function public.insert_private_judge_bundle(p_problem_id uuid, p_problem_version integer, p_bundle jsonb, p_checksum text, p_validation jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_problem_id is null or p_problem_version is null or p_problem_version < 1
    or p_bundle is null or jsonb_typeof(p_bundle) is distinct from 'object'
    or octet_length(p_bundle::text) > 8388608
    or p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$'
    or (p_validation is not null and (jsonb_typeof(p_validation) is distinct from 'object' or octet_length(p_validation::text) > 1048576))
    then raise exception 'invalid private bundle'; end if;
  if (p_bundle->>'problemId')::uuid is distinct from p_problem_id
    or (p_bundle->>'problemVersion')::integer is distinct from p_problem_version
    or (p_bundle->>'schemaVersion')::integer is distinct from 1
    then raise exception 'bundle identity mismatch'; end if;
  -- Deliberately INSERT, never UPSERT: the judge for an existing version is immutable.
  insert into private.judge_bundles(problem_id, problem_version, bundle, checksum, validation)
  values(p_problem_id, p_problem_version, p_bundle, p_checksum, p_validation);
end;
$$;

revoke all on function public.read_private_editorial_record(uuid) from public, anon, authenticated;
revoke all on function public.read_private_judge_bundle(uuid, integer) from public, anon, authenticated;
revoke all on function public.insert_private_judge_bundle(uuid, integer, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.read_private_editorial_record(uuid) to service_role;
grant execute on function public.read_private_judge_bundle(uuid, integer) to service_role;
grant execute on function public.insert_private_judge_bundle(uuid, integer, jsonb, text, jsonb) to service_role;
