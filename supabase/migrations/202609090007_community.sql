create table public.community_posts (
  id uuid primary key,
  problem_id uuid not null,
  problem_version integer not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','approved','rejected','removed')),
  content jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key(problem_id, problem_version) references public.problem_versions(problem_id, version)
);
create index community_by_problem on public.community_posts(problem_id, problem_version, created_at desc);
alter table public.community_posts enable row level security;
-- Public reads go through a DTO: raw content contains private author IDs/review reasons.
create policy "authors and admins read contributions" on public.community_posts for select using (author_id = auth.uid() or private.is_admin());
revoke insert,update,delete on public.community_posts from anon,authenticated;
create table public.community_reports (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check(length(reason) between 5 and 1000),
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
alter table public.community_reports enable row level security;
create policy "admins read reports" on public.community_reports for select using (private.is_admin());
revoke insert,update,delete on public.community_reports from anon,authenticated;

create table private.community_write_windows (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  events timestamptz[] not null default '{}'
);
revoke all on private.community_write_windows from public,anon,authenticated;

create function public.save_community_post_for(requested_user uuid, post jsonb, expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_post public.community_posts; admin_actor boolean; recent timestamptz[];
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if octet_length(post::text) > 100000 then raise exception 'post too large'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_user::text, 7291));
  select exists(select 1 from public.profiles where id=requested_user and role='admin') into admin_actor;
  select * into current_post from public.community_posts where id=(post->>'id')::uuid for update;
  if current_post.id is not null then
    if current_post.status = 'removed' then raise exception 'removed post is immutable'; end if;
    if current_post.author_id <> requested_user and not admin_actor then raise exception 'not allowed'; end if;
    if expected_updated_at is null or current_post.updated_at <> expected_updated_at then return false; end if;
    if current_post.problem_id <> (post->>'problemId')::uuid or current_post.problem_version <> (post->>'problemVersion')::integer or current_post.author_id <> (post->>'authorId')::uuid then raise exception 'identity is immutable'; end if;
  elsif (post->>'authorId')::uuid <> requested_user then raise exception 'invalid author'; end if;
  if not admin_actor and post->>'status' not in ('pending','removed') then raise exception 'review required'; end if;
  if not admin_actor then
    select coalesce(array_agg(event), '{}') into recent from private.community_write_windows w, unnest(w.events) event
      where w.user_id=requested_user and event > now()-interval '1 minute';
    if cardinality(recent) >= 5 then raise exception 'rate limit'; end if;
    insert into private.community_write_windows(user_id,events) values(requested_user,array_append(recent,now()))
      on conflict(user_id) do update set events=excluded.events;
  end if;
  insert into public.community_posts(id,problem_id,problem_version,author_id,status,content,created_at,updated_at)
  values((post->>'id')::uuid,(post->>'problemId')::uuid,(post->>'problemVersion')::integer,(post->>'authorId')::uuid,post->>'status',post,(post->>'createdAt')::timestamptz,(post->>'updatedAt')::timestamptz)
  on conflict(id) do update set status=excluded.status,content=excluded.content,updated_at=excluded.updated_at;
  if post->>'status' <> 'pending' then delete from public.community_reports where post_id=(post->>'id')::uuid; end if;
  return true;
end;
$$;
revoke all on function public.save_community_post_for(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_community_post_for(uuid,jsonb,timestamptz) to service_role;
