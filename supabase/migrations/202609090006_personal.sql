-- Private user workspace. Writes only through the authenticated application server.
create table public.personal_workspaces (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  revision integer not null check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.personal_workspaces enable row level security;
create policy "owner reads personal workspace" on public.personal_workspaces for select using (user_id = auth.uid());
revoke insert, update, delete on public.personal_workspaces from anon, authenticated;

create function public.save_personal_workspace_for(requested_user uuid, expected_revision integer, next_state jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if requested_user is null or expected_revision is null or expected_revision < 0 or next_state is null or jsonb_typeof(next_state) is distinct from 'object' or octet_length(next_state::text) > 1000000 then raise exception 'invalid workspace'; end if;
  if (next_state->>'revision')::integer is distinct from expected_revision + 1 then raise exception 'invalid revision'; end if;
  if expected_revision = 0 then
    insert into public.personal_workspaces(user_id, revision, state) values(requested_user, 1, next_state) on conflict do nothing;
  else
    update public.personal_workspaces set revision = expected_revision + 1, state = next_state, updated_at = now()
    where user_id = requested_user and revision = expected_revision;
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.save_personal_workspace_for(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_personal_workspace_for(uuid, integer, jsonb) to service_role;
