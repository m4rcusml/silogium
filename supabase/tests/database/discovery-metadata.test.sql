begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('31000000-0000-4000-8000-000000000001', 'discovery-owner@silogium.test', '{"user_name":"discovery-owner"}'),
  ('31000000-0000-4000-8000-000000000002', 'discovery-other@silogium.test', '{"user_name":"discovery-other"}'),
  ('31000000-0000-4000-8000-000000000003', 'discovery-admin@silogium.test', '{"user_name":"discovery-admin"}');
update public.profiles set role = 'admin' where id = '31000000-0000-4000-8000-000000000003';

insert into public.external_problem_candidates(user_id, canonical_url, runtime, candidate)
select owner_id::uuid, 'https://example.org/questions/arrays', language, jsonb_build_object(
  'id', 'arrays', 'kind', 'external_link', 'title', 'Arrays', 'summary', 'Prática externa de arrays.',
  'url', 'https://example.org/questions/arrays', 'sourceName', 'Example', 'runtime', language, 'importable', false
)
from (values
  ('31000000-0000-4000-8000-000000000001', 'typescript'),
  ('31000000-0000-4000-8000-000000000001', 'python'),
  ('31000000-0000-4000-8000-000000000002', 'typescript'),
  ('31000000-0000-4000-8000-000000000003', 'python')
) as rows(owner_id, language);

insert into public.ai_jobs(id, user_id, mode, status, request, result)
values ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'create', 'needs_confirmation',
  '{"mode":"create","prompt":"uma questão sobre arrays","runtime":"typescript"}', '{"kind":"recommendations","candidates":[]}');

select ok((select relrowsecurity from pg_class where oid = 'public.external_problem_candidates'::regclass), 'RLS ativa nos metadados externos');
select ok(exists(select 1 from pg_enum where enumtypid = 'public.job_status'::regtype and enumlabel = 'needs_confirmation'), 'estado de confirmação disponível');
select is((select count(*) from public.external_problem_candidates where user_id = '31000000-0000-4000-8000-000000000001'), 2::bigint, 'uma URL preserva metadados das duas linguagens');
select throws_ok($$update public.external_problem_candidates set candidate = jsonb_set(candidate, '{importable}', 'true')$$, '23514', null, 'link sem licença não pode virar importável');
select throws_ok($$update public.external_problem_candidates set candidate = jsonb_set(candidate, '{url}', '"https://outro.test/"')$$, '23514', null, 'URL do JSON deve corresponder à chave canônica');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.external_problem_candidates$$, '42501', null, 'links descobertos não são acessíveis anonimamente');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"31000000-0000-4000-8000-000000000001"}', true);
select is((select count(*) from public.external_problem_candidates), 2::bigint, 'proprietário enxerga apenas seus resultados');
select throws_ok($$insert into public.ai_jobs(id, user_id, mode, status, request) values ('32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001', 'create', 'needs_confirmation', '{"mode":"create","prompt":"pedido forjado","visibility":"public"}')$$, '42501', null, 'cliente não forja um job aguardando confirmação');
select throws_ok($$update public.ai_jobs set request = '{"mode":"create","prompt":"pedido modificado","visibility":"public"}', status = 'needs_confirmation' where id = '32000000-0000-4000-8000-000000000001'$$, '42501', null, 'cliente não altera o snapshot ou reabre confirmação');
select throws_ok($$insert into public.external_problem_candidates(user_id, canonical_url, runtime, candidate) values ('31000000-0000-4000-8000-000000000001', 'https://example.org/forged', 'python', '{}')$$, '42501', null, 'cliente não declara metadados ou licenças');
select throws_ok($$update public.external_problem_candidates set updated_at = now()$$, '42501', null, 'cliente não altera fontes persistidas');
select throws_ok($$delete from public.external_problem_candidates$$, '42501', null, 'cliente não elimina fontes persistidas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"31000000-0000-4000-8000-000000000002"}', true);
select is((select count(*) from public.external_problem_candidates), 1::bigint, 'outro usuário não recebe os interesses do proprietário');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"31000000-0000-4000-8000-000000000003"}', true);
select is((select count(*) from public.external_problem_candidates), 1::bigint, 'administrador também só enxerga seu histórico de descoberta');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
with claimed as (
  update public.ai_jobs set status = 'running'
  where id = '32000000-0000-4000-8000-000000000001' and user_id = '31000000-0000-4000-8000-000000000002' and status = 'needs_confirmation'
  returning id
) select is((select count(*) from claimed), 0::bigint, 'confirmação exige o proprietário exato');
with claimed as (
  update public.ai_jobs set status = 'running'
  where id = '32000000-0000-4000-8000-000000000001' and user_id = '31000000-0000-4000-8000-000000000001' and status = 'needs_confirmation'
  returning id
) select is((select count(*) from claimed), 1::bigint, 'primeira confirmação reivindica o job');
with claimed as (
  update public.ai_jobs set status = 'running'
  where id = '32000000-0000-4000-8000-000000000001' and user_id = '31000000-0000-4000-8000-000000000001' and status = 'needs_confirmation'
  returning id
) select is((select count(*) from claimed), 0::bigint, 'confirmação repetida não dispara criação novamente');
reset role;

select * from finish();
rollback;
