begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Regression: an unqualified gin_trgm_ops made migration 001 fail on fresh CI
-- before pgTAP could run when Supabase installed pg_trgm in extensions.
select has_index('public', 'problems', 'problems_title_trgm_idx', 'índice textual existe após aplicar as migrations');
select ok((select indisvalid from pg_catalog.pg_index where indexrelid = 'public.problems_title_trgm_idx'::regclass), 'índice textual foi construído e está válido');
select is((select am.amname from pg_catalog.pg_class index_class join pg_catalog.pg_am am on am.oid = index_class.relam
  where index_class.oid = 'public.problems_title_trgm_idx'::regclass), 'gin', 'índice continua usando GIN');
select is((select attribute.attname::text from pg_catalog.pg_index index_definition
  join pg_catalog.pg_attribute attribute on attribute.attrelid = index_definition.indrelid and attribute.attnum = index_definition.indkey[0]
  where index_definition.indexrelid = 'public.problems_title_trgm_idx'::regclass), 'title', 'índice continua cobrindo o título');
select is((select operator_class.opcname::text from pg_catalog.pg_index index_definition
  join pg_catalog.pg_opclass operator_class on operator_class.oid = index_definition.indclass[0]
  where index_definition.indexrelid = 'public.problems_title_trgm_idx'::regclass), 'gin_trgm_ops', 'índice usa a classe de trigramas');
select is((select operator_class.opcnamespace from pg_catalog.pg_index index_definition
  join pg_catalog.pg_opclass operator_class on operator_class.oid = index_definition.indclass[0]
  where index_definition.indexrelid = 'public.problems_title_trgm_idx'::regclass),
  (select extnamespace from pg_catalog.pg_extension where extname = 'pg_trgm'),
  'classe de operadores usa o schema real da extensão, sem depender de search_path');

select * from finish();
rollback;
