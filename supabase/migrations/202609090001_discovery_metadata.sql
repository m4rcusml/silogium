-- Problem metadata stays versioned inside problem_versions.definition. No backfill
-- writes are required: older definitions are enriched from their public fields on read.
alter type public.job_status add value if not exists 'needs_confirmation';

-- Confirmations trust a server-created request snapshot. Allowing clients to
-- insert arbitrary jobs would bypass request validation and publication consent.
drop policy if exists "users create own ai jobs" on public.ai_jobs;
revoke insert, update, delete on public.ai_jobs from anon, authenticated;
grant select on public.ai_jobs to authenticated;
grant all on public.ai_jobs to service_role;

-- A discovery result is personal history, not a publicly licensed problem. Only
-- the server's source adapters can write it; users cannot self-assert a license.
create table public.external_problem_candidates (
  user_id uuid not null references public.profiles(id) on delete cascade,
  canonical_url text not null check (length(canonical_url) between 10 and 2048 and canonical_url ~ '^https?://'),
  runtime text not null check (runtime in ('typescript', 'python')),
  candidate jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, canonical_url, runtime),
  constraint external_candidate_shape check ((
    jsonb_typeof(candidate) = 'object'
    and candidate ?& array['id', 'kind', 'title', 'summary', 'url', 'sourceName', 'runtime', 'importable']
    and jsonb_typeof(candidate->'id') = 'string'
    and jsonb_typeof(candidate->'title') = 'string'
    and jsonb_typeof(candidate->'summary') = 'string'
    and jsonb_typeof(candidate->'sourceName') = 'string'
    and jsonb_typeof(candidate->'importable') = 'boolean'
    and length(candidate->>'id') between 1 and 200
    and length(candidate->>'title') between 1 and 300
    and length(candidate->>'summary') between 1 and 1200
    and length(candidate->>'sourceName') between 1 and 120
    and candidate->>'url' = canonical_url
    and candidate->>'runtime' = runtime
    and (not candidate ? 'metadata' or jsonb_typeof(candidate->'metadata') = 'object')
    and pg_column_size(candidate) <= 65536
  ) is true),
  constraint external_candidate_license check ((
    (candidate->>'kind' = 'external_link' and candidate->'importable' = 'false'::jsonb and not candidate ? 'licenseSpdx')
    or (
      candidate->>'kind' = 'licensed_import'
      and candidate->'importable' = 'true'::jsonb
      and candidate->>'sourceName' = 'Exercism'
      and candidate->>'licenseSpdx' = 'MIT'
      and canonical_url ~ ('^https://github\.com/exercism/' || runtime || '/tree/main/exercises/practice/[a-z0-9-]+/?(\?.*)?$')
    )
  ) is true)
);

create index external_candidates_user_updated_idx on public.external_problem_candidates(user_id, updated_at desc);
alter table public.external_problem_candidates enable row level security;
create policy "users read only their discovered links" on public.external_problem_candidates
  for select to authenticated using (user_id = auth.uid());

revoke all on public.external_problem_candidates from anon, authenticated;
grant select on public.external_problem_candidates to authenticated;
grant all on public.external_problem_candidates to service_role;

comment on table public.external_problem_candidates is
  'Owner-scoped summaries and discovery metadata. External links never enter the catalog, and storing a URL does not grant reproduction rights.';
