alter table public.ai_jobs drop constraint if exists ai_jobs_mode_check;
alter table public.ai_jobs add constraint ai_jobs_mode_check check (mode in ('search', 'create', 'import', 'refine'));
-- Jobs store judge bundles for internal recovery. Browser access must use the owner-only,
-- sanitized /api/v1/jobs endpoint, never table/GraphQL reads of raw result JSON.
drop policy if exists "users read own ai jobs" on public.ai_jobs;
revoke select on public.ai_jobs from anon, authenticated;
grant all on public.ai_jobs to service_role;

create table public.authoring_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, user_id)
);
create table public.authoring_conversation_turns (
  id uuid primary key,
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null unique references public.ai_jobs(id) on delete cascade,
  mode text not null check (mode in ('search', 'create', 'import', 'refine')),
  user_text text not null check (length(user_text) <= 2000),
  assistant_text text not null default '' check (length(assistant_text) <= 700),
  status public.job_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key(conversation_id, user_id) references public.authoring_conversations(id, user_id) on delete cascade
);
create index authoring_conversations_history_idx on public.authoring_conversations(user_id, updated_at desc, id desc);
create index authoring_turns_history_idx on public.authoring_conversation_turns(conversation_id, user_id, created_at desc, id desc);

create function private.touch_authoring_conversation() returns trigger language plpgsql set search_path = '' as $$
begin
  update public.authoring_conversations set updated_at = greatest(updated_at, new.updated_at)
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end;
$$;
create trigger touch_authoring_conversation after insert or update on public.authoring_conversation_turns
for each row execute function private.touch_authoring_conversation();

alter table public.authoring_conversations enable row level security;
alter table public.authoring_conversation_turns enable row level security;
create policy "conversation history belongs only to its owner" on public.authoring_conversations for select to authenticated using (user_id = auth.uid());
create policy "conversation turns belong only to their owner" on public.authoring_conversation_turns for select to authenticated using (user_id = auth.uid());
revoke all on public.authoring_conversations, public.authoring_conversation_turns from anon, authenticated;
grant select on public.authoring_conversations, public.authoring_conversation_turns to authenticated;
grant all on public.authoring_conversations, public.authoring_conversation_turns to service_role;
comment on table public.authoring_conversation_turns is 'Owner-only bounded prompts and safe status summaries. Never persist reference solutions, source snapshots, hidden fixtures, or full job results here. Deleting a conversation does not delete questions or cancel jobs.';
