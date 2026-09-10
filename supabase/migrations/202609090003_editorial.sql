-- Drafts contain private judge materials. Only the server can read/write this table.
create table private.editorial_records (
  problem_id uuid primary key references public.problems(id) on delete cascade,
  revision integer not null check (revision > 0),
  record jsonb not null,
  updated_at timestamptz not null default now()
);
revoke all on private.editorial_records from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.editorial_records to service_role;
grant select, insert, update, delete on private.judge_bundles to service_role;
alter table private.judge_bundles add column if not exists validation jsonb;

-- All content mutations go through authenticated server workflows, never direct client inserts.
revoke insert, update, delete on public.problem_versions from anon, authenticated;
revoke insert, update, delete on public.problems from anon, authenticated;
revoke update on public.publication_reviews from anon, authenticated;
revoke execute on function public.request_problem_publication(uuid) from public, anon, authenticated;
drop policy if exists "read visible problem versions" on public.problem_versions;
create policy "read visible problem versions" on public.problem_versions for select using (
  exists(select 1 from public.problems p where p.id = problem_id and (
    p.owner_id = auth.uid() or exists(select 1 from public.profiles profile where profile.id = auth.uid() and profile.role = 'admin') or
    (p.status = 'published' and p.visibility = 'public' and definition->>'status' = 'published')
  ))
);

create function public.save_editorial_record(p_problem_id uuid, p_expected_revision integer, p_record jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare existing_revision integer;
begin
  -- Lock the parent even before the first draft exists, so competing inserts are a CAS too.
  perform 1 from public.problems where id = p_problem_id for update;
  if not found then raise exception 'problem not found'; end if;
  select revision into existing_revision from private.editorial_records where problem_id = p_problem_id for update;
  if coalesce(existing_revision, 0) <> p_expected_revision then return false; end if;
  if (p_record->>'problemId')::uuid <> p_problem_id or (p_record->>'revision')::integer <> p_expected_revision + 1 then raise exception 'invalid editorial revision'; end if;
  insert into private.editorial_records(problem_id, revision, record)
  values(p_problem_id, p_expected_revision + 1, p_record)
  on conflict(problem_id) do update set revision = excluded.revision, record = excluded.record, updated_at = now();
  return true;
end;
$$;

create function public.commit_editorial_version(p_problem_id uuid, p_expected_revision integer, p_record jsonb, p_actor_id uuid, p_fingerprint text, p_checksum text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected public.problems; existing_revision integer; prior jsonb; definition jsonb; bundle jsonb; report jsonb; next_version integer;
begin
  select * into selected from public.problems where id = p_problem_id for update;
  if not found or not coalesce(selected.owner_id = p_actor_id or exists(select 1 from public.profiles where id = p_actor_id and role = 'admin'), false) then raise exception 'editorial access denied'; end if;
  select revision into existing_revision from private.editorial_records where problem_id = p_problem_id for update;
  if existing_revision is distinct from p_expected_revision or (p_record->>'revision')::integer <> p_expected_revision + 1 or (p_record->>'baseVersion')::integer <> selected.latest_version then raise exception 'editorial revision conflict'; end if;
  definition := p_record#>'{package,problem}'; bundle := p_record#>'{package,bundle}'; report := p_record#>'{package,validation}';
  select pv.definition into prior from public.problem_versions pv where problem_id = p_problem_id and version = selected.latest_version;
  next_version := (definition->>'version')::integer;
  if next_version <> selected.latest_version + 1 or (definition->>'id')::uuid <> p_problem_id or definition->>'slug' <> selected.slug or definition->'provenance' is distinct from prior->'provenance' or definition->>'origin' <> prior->>'origin' or definition->>'status' <> 'validated' or report->>'valid' <> 'true' or (bundle->>'problemId')::uuid <> p_problem_id or (bundle->>'problemVersion')::integer <> next_version then raise exception 'invalid editorial version'; end if;
  if exists(select 1 from public.problems where id <> p_problem_id and fingerprint = p_fingerprint) then raise exception 'potentially duplicate content'; end if;
  insert into public.problem_versions(problem_id, version, definition, created_by) values(p_problem_id, next_version, definition, p_actor_id);
  insert into private.judge_bundles(problem_id, problem_version, bundle, checksum, validation) values(p_problem_id, next_version, bundle, p_checksum, report);
  update public.problems set latest_version = next_version,
    current_version = case when status = 'published' then current_version else next_version end,
    title = case when status = 'published' then title else definition->>'title' end,
    summary = case when status = 'published' then summary else definition->>'summary' end,
    difficulty = case when status = 'published' then difficulty else definition->>'difficulty' end,
    tags = case when status = 'published' then tags else array(select jsonb_array_elements_text(definition->'tags')) end,
    fingerprint = case when status = 'published' then fingerprint else p_fingerprint end,
    status = case when status = 'published' then status else 'validated'::public.problem_status end,
    updated_at = now()
    where id = p_problem_id;
  update private.editorial_records set revision = p_expected_revision + 1, record = p_record, updated_at = now() where problem_id = p_problem_id;
end;
$$;

create function public.request_editorial_publication(p_problem_id uuid, p_actor_id uuid, p_expected_version integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare selected public.problems; definition jsonb; report jsonb;
begin
  select * into selected from public.problems where id = p_problem_id for update;
  if not found or not coalesce(selected.owner_id = p_actor_id or exists(select 1 from public.profiles where id = p_actor_id and role = 'admin'), false) then raise exception 'editorial access denied'; end if;
  if p_expected_version is not null and p_expected_version <> selected.latest_version then raise exception 'editorial version changed'; end if;
  if exists(select 1 from public.publication_reviews where problem_id = p_problem_id and problem_version = selected.latest_version and status = 'pending') then return; end if;
  select pv.definition into definition from public.problem_versions pv where problem_id = p_problem_id and version = selected.latest_version;
  select validation into report from private.judge_bundles where problem_id = p_problem_id and problem_version = selected.latest_version;
  if definition->>'status' <> 'validated' or coalesce(report->>'valid', 'false') <> 'true' then raise exception 'validate the current version before publication'; end if;
  update public.publication_reviews set status = 'rejected', reason = 'Substituída por uma versão mais recente enviada pelo autor.', reviewed_at = now() where problem_id = p_problem_id and status = 'pending';
  update public.problem_versions set definition = jsonb_set(request_editorial_publication.definition, '{status}', '"pending_review"') where problem_id = p_problem_id and version = selected.latest_version;
  update public.problems set status = case when status = 'published' then status else 'pending_review'::public.problem_status end, updated_at = now() where id = p_problem_id;
  insert into public.publication_reviews(problem_id, problem_version, requested_by) values(p_problem_id, selected.latest_version, p_actor_id);
end;
$$;

create function public.moderate_editorial_review(p_review_id uuid, p_actor_id uuid, p_decision text, p_reason text default null, p_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare review public.publication_reviews; selected public.problems; definition jsonb; report jsonb;
begin
  if not exists(select 1 from public.profiles where id = p_actor_id and role = 'admin') then raise exception 'admin required'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid decision'; end if;
  if p_decision = 'reject' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'rejection reason required'; end if;
  if length(coalesce(p_reason, '')) > 2000 then raise exception 'reason too long'; end if;
  -- Parent-first lock ordering matches validation/publication and avoids deadlocks.
  select * into review from public.publication_reviews where id = p_review_id;
  if not found then raise exception 'review not found'; end if;
  select * into selected from public.problems where id = review.problem_id for update;
  select * into review from public.publication_reviews where id = p_review_id for update;
  if review.status <> 'pending' then raise exception 'review already decided'; end if;
  if p_decision = 'approve' and selected.status = 'published' and selected.current_version > review.problem_version then raise exception 'newer version already published'; end if;
  select pv.definition into definition from public.problem_versions pv where problem_id = review.problem_id and version = review.problem_version;
  select validation into report from private.judge_bundles where problem_id = review.problem_id and problem_version = review.problem_version;
  if definition->>'status' <> 'pending_review' then raise exception 'version is not pending review'; end if;
  if p_decision = 'approve' and coalesce(report->>'valid', 'false') <> 'true' then raise exception 'validation report required'; end if;
  definition := jsonb_set(definition, '{status}', to_jsonb(case when p_decision = 'approve' then 'published'::text else 'rejected'::text end));
  if p_decision = 'approve' then
    if p_fingerprint is null then raise exception 'fingerprint required'; end if;
    definition := jsonb_set(definition, '{visibility}', '"public"');
    update public.problems set status = 'published', visibility = 'public', current_version = review.problem_version,
      title = definition->>'title', summary = definition->>'summary', difficulty = definition->>'difficulty',
      tags = array(select jsonb_array_elements_text(definition->'tags')), fingerprint = p_fingerprint, updated_at = now()
      where id = review.problem_id;
  elsif selected.status <> 'published' and selected.latest_version = review.problem_version then
    update public.problems set status = 'rejected', updated_at = now() where id = review.problem_id;
  end if;
  update public.problem_versions pv set definition = moderate_editorial_review.definition where problem_id = review.problem_id and version = review.problem_version;
  update public.publication_reviews set status = case when p_decision = 'approve' then 'approved' else 'rejected' end, reason = nullif(trim(p_reason), ''), reviewer_id = p_actor_id, reviewed_at = now() where id = p_review_id;
  return jsonb_build_object('problemId', review.problem_id, 'problemVersion', review.problem_version);
end;
$$;

revoke all on function public.save_editorial_record(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.commit_editorial_version(uuid, integer, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.request_editorial_publication(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.moderate_editorial_review(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.save_editorial_record(uuid, integer, jsonb) to service_role;
grant execute on function public.commit_editorial_version(uuid, integer, jsonb, uuid, text, text) to service_role;
grant execute on function public.request_editorial_publication(uuid, uuid, integer) to service_role;
grant execute on function public.moderate_editorial_review(uuid, uuid, text, text, text) to service_role;
