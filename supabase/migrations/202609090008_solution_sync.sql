create table public.solution_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id uuid not null,
  problem_version integer not null,
  runtime text not null check(runtime in ('typescript','python')),
  revision integer not null check(revision > 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,problem_id,problem_version,runtime),
  foreign key(problem_id,problem_version) references public.problem_versions(problem_id,version)
);
alter table public.solution_drafts enable row level security;
create policy "owner reads solution drafts" on public.solution_drafts for select using(user_id=auth.uid());
revoke insert,update,delete on public.solution_drafts from anon,authenticated;
create function public.save_solution_draft_for(requested_user uuid,requested_problem uuid,requested_version integer,requested_runtime text,expected_revision integer,requested_snapshot jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if requested_user is null or requested_problem is null or requested_version is null or requested_version < 1 or requested_runtime is null or requested_runtime not in ('typescript','python') or expected_revision is null or expected_revision < 0 or requested_snapshot is null or jsonb_typeof(requested_snapshot) is distinct from 'object' or octet_length(requested_snapshot::text) > 3000000 then raise exception 'invalid draft'; end if;
  if expected_revision = 0 then
    insert into public.solution_drafts(user_id,problem_id,problem_version,runtime,revision,snapshot)
    values(requested_user,requested_problem,requested_version,requested_runtime,1,requested_snapshot) on conflict do nothing;
  else
    update public.solution_drafts set revision=expected_revision+1,snapshot=requested_snapshot,updated_at=now()
    where user_id=requested_user and problem_id=requested_problem and problem_version=requested_version and runtime=requested_runtime and revision=expected_revision;
  end if;
  get diagnostics changed = row_count; return changed = 1;
end;
$$;
revoke all on function public.save_solution_draft_for(uuid,uuid,integer,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_solution_draft_for(uuid,uuid,integer,text,integer,jsonb) to service_role;
