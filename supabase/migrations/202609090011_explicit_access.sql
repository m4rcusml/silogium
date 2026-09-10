-- Do not depend on historical Supabase defaults that auto-exposed new tables.
-- Grants allow an operation; RLS still determines which rows a browser may read.
grant usage on schema public to anon, authenticated, service_role;

revoke all on table
  public.profiles, public.problems, public.problem_versions, public.problem_sources,
  public.publication_reviews, public.ai_jobs, public.submissions, public.api_tokens,
  public.external_problem_candidates, public.authoring_conversations, public.authoring_conversation_turns,
  public.practice_settings, public.practice_projections, public.practice_milestones,
  public.problem_completions, public.user_achievements, public.personal_workspaces,
  public.community_posts, public.community_reports, public.solution_drafts
from public, anon, authenticated, service_role;

grant select on table public.profiles, public.problems, public.problem_versions, public.problem_sources to anon;
grant select on table
  public.profiles, public.problems, public.problem_versions, public.problem_sources,
  public.publication_reviews, public.submissions, public.api_tokens,
  public.external_problem_candidates, public.authoring_conversations, public.authoring_conversation_turns,
  public.practice_settings, public.practice_projections, public.practice_milestones,
  public.problem_completions, public.user_achievements, public.personal_workspaces,
  public.community_posts, public.community_reports, public.solution_drafts
to authenticated;
-- This is the only direct client write kept from the initial platform contract.
-- Revoking table privileges does not revoke existing column privileges.
revoke update(id, role, created_at) on public.profiles from public, anon, authenticated;
grant update(handle, avatar_url) on public.profiles to authenticated;

-- Server adapters need CRUD, not TRUNCATE, schema CREATE, or blanket privileges
-- on unrelated/future tables. Raw ai_jobs deliberately remains server-only.
grant select, insert, update, delete on table
  public.profiles, public.problems, public.problem_versions, public.problem_sources,
  public.publication_reviews, public.ai_jobs, public.submissions, public.api_tokens,
  public.external_problem_candidates, public.authoring_conversations, public.authoring_conversation_turns,
  public.practice_settings, public.practice_projections, public.practice_milestones,
  public.problem_completions, public.user_achievements, public.personal_workspaces,
  public.community_posts, public.community_reports, public.solution_drafts
to service_role;

-- Anonymous catalog access must not evaluate an authenticated-only helper.
-- Keep private.is_admin() inaccessible to anon; no private schema is exposed.
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
drop policy if exists "catalog or owner reads problems" on public.problems;
create policy "anonymous reads published catalog" on public.problems for select to anon
using (status = 'published' and visibility = 'public');
create policy "authenticated reads catalog or owned problems" on public.problems for select to authenticated
using ((status = 'published' and visibility = 'public') or owner_id = auth.uid() or private.is_admin());

drop policy if exists "read visible problem versions" on public.problem_versions;
create policy "anonymous reads published versions" on public.problem_versions for select to anon using (
  definition->>'status' = 'published' and exists (
    select 1 from public.problems p where p.id = problem_id and p.status = 'published' and p.visibility = 'public'
  )
);
create policy "authenticated reads permitted versions" on public.problem_versions for select to authenticated using (
  exists (select 1 from public.problems p where p.id = problem_id and (
    p.owner_id = auth.uid() or private.is_admin() or
    (p.status = 'published' and p.visibility = 'public' and definition->>'status' = 'published')
  ))
);

drop policy if exists "read sources with problem" on public.problem_sources;
create policy "anonymous reads published source attribution" on public.problem_sources for select to anon using (
  exists (select 1 from public.problems p where p.id = problem_id and p.status = 'published' and p.visibility = 'public')
);
create policy "authenticated reads permitted source attribution" on public.problem_sources for select to authenticated using (
  exists (select 1 from public.problems p where p.id = problem_id and (
    (p.status = 'published' and p.visibility = 'public') or p.owner_id = auth.uid() or private.is_admin()
  ))
);
-- ALL policies also apply to SELECT, even if no write grant exists. Narrow this
-- old management policy so an anonymous source read never invokes is_admin().
alter policy "admins manage sources" on public.problem_sources to authenticated;
alter policy "authors and admins read reviews" on public.publication_reviews to authenticated;
alter policy "authors and admins read contributions" on public.community_posts to authenticated;
alter policy "admins read reports" on public.community_reports to authenticated;
alter policy "owner reads personal workspace" on public.personal_workspaces to authenticated;
alter policy "owner reads solution drafts" on public.solution_drafts to authenticated;

-- Anonymous users have no quota identity; retain the authenticated RPC and the
-- separately granted service-only quota RPCs without inherited PUBLIC execution.
revoke all on function public.consume_quota(text) from public, anon;
grant execute on function public.consume_quota(text) to authenticated;
