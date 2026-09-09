create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists pgmq;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create type public.user_role as enum ('user', 'admin');
create type public.problem_origin as enum ('native', 'licensed_import');
create type public.problem_visibility as enum ('private', 'unlisted', 'public');
create type public.problem_status as enum ('draft', 'validating', 'validated', 'pending_review', 'published', 'rejected');
create type public.job_status as enum ('queued', 'running', 'completed', 'failed', 'needs_clarification');
create type public.execution_verdict as enum ('accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'output_limit', 'system_error');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  avatar_url text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, handle, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'user_name', split_part(coalesce(new.email, new.id::text), '@', 1)), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure private.handle_new_user();

create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_id uuid references public.profiles(id) on delete set null,
  origin public.problem_origin not null,
  visibility public.problem_visibility not null default 'private',
  status public.problem_status not null default 'draft',
  current_version integer not null default 1 check (current_version > 0),
  latest_version integer not null default 1 check (latest_version >= current_version),
  title text not null,
  summary text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  format text not null check (format in ('classic', 'progressive')),
  runtimes text[] not null check (cardinality(runtimes) > 0),
  tags text[] not null default '{}',
  source_url text,
  fingerprint text not null,
  unlisted_access_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint)
);
create unique index problems_source_url_unique on public.problems(source_url) where source_url is not null;
create index problems_catalog_idx on public.problems(status, visibility, updated_at desc);
create index problems_title_trgm_idx on public.problems using gin(title gin_trgm_ops);
create index problems_tags_idx on public.problems using gin(tags);

create table public.problem_versions (
  problem_id uuid not null references public.problems(id) on delete cascade,
  version integer not null check (version > 0),
  definition jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (problem_id, version)
);

create table public.problem_sources (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  license_spdx text not null,
  authors text[] not null default '{}',
  commit_sha text,
  retrieved_at timestamptz not null,
  metadata jsonb not null default '{}',
  unique(source_url)
);

create table private.judge_bundles (
  problem_id uuid not null,
  problem_version integer not null,
  bundle jsonb not null,
  checksum text not null,
  created_at timestamptz not null default now(),
  primary key(problem_id, problem_version),
  foreign key(problem_id, problem_version) references public.problem_versions(problem_id, version) on delete cascade
);
revoke all on private.judge_bundles from anon, authenticated;

create table public.publication_reviews (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete cascade,
  problem_version integer not null,
  requested_by uuid not null references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key(problem_id, problem_version) references public.problem_versions(problem_id, version)
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('search', 'create', 'import')),
  status public.job_status not null default 'queued',
  request jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id uuid not null,
  problem_version integer not null,
  runtime text not null check (runtime in ('typescript', 'python')),
  kind text not null check (kind in ('run', 'submission')),
  source text not null,
  verdict public.execution_verdict,
  score integer not null default 0,
  max_score integer not null default 0,
  duration_ms integer,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(problem_id, problem_version) references public.problem_versions(problem_id, version)
);
create index submissions_user_created_idx on public.submissions(user_id, created_at desc);

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  prefix text not null,
  scopes text[] not null default array['problems:read', 'submissions:create', 'submissions:read'],
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table private.usage_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('ai', 'remote_execution')),
  day date not null,
  daily_count integer not null default 0,
  minute_start timestamptz not null default date_trunc('minute', now()),
  minute_count integer not null default 0,
  primary key(user_id, kind, day)
);

create function public.consume_quota(requested_kind text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  daily_limit integer := case when requested_kind = 'ai' then 5 else 50 end;
  minute_limit integer := case when requested_kind = 'remote_execution' then 10 else null end;
  current_row private.usage_counters;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into private.usage_counters(user_id, kind, day, daily_count, minute_start, minute_count)
  values(auth.uid(), requested_kind, current_date, 0, date_trunc('minute', now()), 0)
  on conflict(user_id, kind, day) do nothing;
  select * into current_row from private.usage_counters where user_id = auth.uid() and kind = requested_kind and day = current_date for update;
  if current_row.daily_count >= daily_limit then return jsonb_build_object('allowed', false, 'reason', 'daily'); end if;
  if current_row.minute_start = date_trunc('minute', now()) and minute_limit is not null and current_row.minute_count >= minute_limit then return jsonb_build_object('allowed', false, 'reason', 'minute'); end if;
  update private.usage_counters set
    daily_count = daily_count + 1,
    minute_start = date_trunc('minute', now()),
    minute_count = case when minute_start = date_trunc('minute', now()) then minute_count + 1 else 1 end
  where user_id = auth.uid() and kind = requested_kind and day = current_date;
  return jsonb_build_object('allowed', true, 'remaining', daily_limit - current_row.daily_count - 1);
end;
$$;

create function public.consume_quota_for(requested_user uuid, requested_kind text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  daily_limit integer := case when requested_kind = 'ai' then 5 else 50 end;
  minute_limit integer := case when requested_kind = 'remote_execution' then 10 else null end;
  current_row private.usage_counters;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if requested_kind not in ('ai', 'remote_execution') then raise exception 'invalid quota kind'; end if;
  insert into private.usage_counters(user_id, kind, day, daily_count, minute_start, minute_count)
  values(requested_user, requested_kind, current_date, 0, date_trunc('minute', now()), 0)
  on conflict(user_id, kind, day) do nothing;
  select * into current_row from private.usage_counters where user_id = requested_user and kind = requested_kind and day = current_date for update;
  if current_row.daily_count >= daily_limit then return jsonb_build_object('allowed', false, 'reason', 'daily'); end if;
  if current_row.minute_start = date_trunc('minute', now()) and minute_limit is not null and current_row.minute_count >= minute_limit then return jsonb_build_object('allowed', false, 'reason', 'minute'); end if;
  update private.usage_counters set
    daily_count = daily_count + 1,
    minute_start = date_trunc('minute', now()),
    minute_count = case when minute_start = date_trunc('minute', now()) then minute_count + 1 else 1 end
  where user_id = requested_user and kind = requested_kind and day = current_date;
  return jsonb_build_object('allowed', true, 'remaining', daily_limit - current_row.daily_count - 1);
end;
$$;

create function public.refund_quota_for(requested_user uuid, requested_kind text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  update private.usage_counters
  set daily_count = greatest(0, daily_count - 1),
      minute_count = greatest(0, minute_count - 1)
  where user_id = requested_user and kind = requested_kind and day = current_date;
end;
$$;

create function public.request_problem_publication(requested_problem uuid) returns void language plpgsql security definer set search_path = '' as $$
declare selected public.problems;
begin
  select * into selected from public.problems where id = requested_problem for update;
  if selected.owner_id <> auth.uid() and not private.is_admin() then raise exception 'not allowed'; end if;
  if selected.status <> 'validated' and not (selected.status = 'published' and selected.latest_version > selected.current_version) then
    raise exception 'problem must have a validated working version';
  end if;
  update public.problems
  set status = case when selected.status = 'published' then 'published' else 'pending_review' end,
      updated_at = now()
  where id = requested_problem;
  update public.problem_versions
  set definition = jsonb_set(
    jsonb_set(definition, '{status}', '"pending_review"'::jsonb),
    '{updatedAt}', to_jsonb(now()::text)
  )
  where problem_id = selected.id and version = selected.latest_version;
  insert into public.publication_reviews(problem_id, problem_version, requested_by) values(selected.id, selected.latest_version, auth.uid());
end;
$$;

alter table public.profiles enable row level security;
alter table public.problems enable row level security;
alter table public.problem_versions enable row level security;
alter table public.problem_sources enable row level security;
alter table public.publication_reviews enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.submissions enable row level security;
alter table public.api_tokens enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "catalog or owner reads problems" on public.problems for select using ((status = 'published' and visibility = 'public') or owner_id = auth.uid() or private.is_admin());
create policy "owners create problems" on public.problems for insert with check (owner_id = auth.uid());
create policy "owners edit unpublished problems" on public.problems for update using ((owner_id = auth.uid() and status <> 'published') or private.is_admin());
create policy "read visible problem versions" on public.problem_versions for select using (exists(select 1 from public.problems p where p.id = problem_id and ((p.status = 'published' and p.visibility = 'public') or p.owner_id = auth.uid() or private.is_admin())));
create policy "owners create problem versions" on public.problem_versions for insert with check (exists(select 1 from public.problems p where p.id = problem_id and (p.owner_id = auth.uid() or private.is_admin())));
create policy "read sources with problem" on public.problem_sources for select using (exists(select 1 from public.problems p where p.id = problem_id and ((p.status = 'published' and p.visibility = 'public') or p.owner_id = auth.uid() or private.is_admin())));
create policy "admins manage sources" on public.problem_sources for all using (private.is_admin()) with check (private.is_admin());
create policy "authors and admins read reviews" on public.publication_reviews for select using (requested_by = auth.uid() or private.is_admin());
create policy "admins update reviews" on public.publication_reviews for update using (private.is_admin()) with check (private.is_admin());
create policy "users read own ai jobs" on public.ai_jobs for select using (user_id = auth.uid() or private.is_admin());
create policy "users create own ai jobs" on public.ai_jobs for insert with check (user_id = auth.uid());
create policy "users read own submissions" on public.submissions for select using (user_id = auth.uid() or private.is_admin());
create policy "users create own submissions" on public.submissions for insert with check (user_id = auth.uid());
create policy "users read own tokens" on public.api_tokens for select using (user_id = auth.uid());
create policy "users create own tokens" on public.api_tokens for insert with check (user_id = auth.uid());
create policy "users revoke own tokens" on public.api_tokens for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Perfis são editáveis, mas o papel administrativo nunca pode ser elevado pelo cliente.
revoke update on public.profiles from authenticated;
grant update(handle, avatar_url) on public.profiles to authenticated;

revoke all on function public.consume_quota(text) from anon;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function public.consume_quota(text) to authenticated;
revoke all on function public.consume_quota_for(uuid, text) from public;
grant execute on function public.consume_quota_for(uuid, text) to service_role;
revoke all on function public.refund_quota_for(uuid, text) from public;
grant execute on function public.refund_quota_for(uuid, text) to service_role;
revoke all on function public.request_problem_publication(uuid) from anon;
grant execute on function public.request_problem_publication(uuid) to authenticated;

do $$ begin perform pgmq.create('authoring_jobs'); exception when others then null; end $$;
do $$ begin perform pgmq.create('grading_jobs'); exception when others then null; end $$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('problem-assets', 'problem-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'text/plain'])
on conflict (id) do nothing;

create policy "owners upload problem assets" on storage.objects for insert to authenticated
with check (bucket_id = 'problem-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners read problem assets" on storage.objects for select to authenticated
using (bucket_id = 'problem-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners update problem assets" on storage.objects for update to authenticated
using (bucket_id = 'problem-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'problem-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete problem assets" on storage.objects for delete to authenticated
using (bucket_id = 'problem-assets' and (storage.foldername(name))[1] = auth.uid()::text);
