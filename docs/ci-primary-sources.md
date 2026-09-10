# CI com Supabase: fontes primárias

Consulta em 2026-09-10. Pesquisa documental e leitura de fontes oficiais; nenhum Docker, teste, build, instalação ou comando contra projeto Supabase remoto foi executado.

## Versões recomendadas

Fixar o Supabase CLI em **2.117.0**, publicado em 2026-09-07 e identificado como release estável mais recente na consulta. A versão também está publicada no registro npm, origem usada pela ação atual. A recomendação é documental; a execução do workflow continua sendo a validação de integração. Fontes: [release oficial do CLI](https://github.com/supabase/cli/releases/tag/v2.117.0), [metadados do pacote oficial](https://registry.npmjs.org/supabase/2.117.0).

As versões atuais das ações e os commits correspondentes, conferidos pela API pública dos respectivos repositórios, são:

| Ação | Release | Commit para fixação |
| --- | --- | --- |
| `actions/checkout` | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | [`3d3c42e5aac5ba805825da76410c181273ba90b1`](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) |
| `actions/setup-node` | [v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) | [`820762786026740c76f36085b0efc47a31fe5020`](https://github.com/actions/setup-node/commit/820762786026740c76f36085b0efc47a31fe5020) |
| `actions/setup-python` | [v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0) | [`5fda3b95a4ea91299a34e894583c3862153e4b97`](https://github.com/actions/setup-python/commit/5fda3b95a4ea91299a34e894583c3862153e4b97) |
| `supabase/setup-cli` | [v3.0.0](https://github.com/supabase/setup-cli/releases/tag/v3.0.0) | [`46f7f98c7f948ad727d22c1e67fab04c223a0520`](https://github.com/supabase/setup-cli/commit/46f7f98c7f948ad727d22c1e67fab04c223a0520) |

`supabase/setup-cli` v3 aceita `with.version: "2.117.0"`, instala pelo npm e requer Node.js 20 ou superior. O input `github-token` foi removido na v3. Os três actions do GitHub usam runtime interno Node 24; a versão do Node instalada para o projeto é escolhida separadamente pelo input `node-version`. Fontes: [setup-cli v3](https://github.com/supabase/setup-cli/releases/tag/v3.0.0), [manifesto setup-cli](https://github.com/supabase/setup-cli/blob/v3.0.0/action.yml), manifestos [checkout](https://github.com/actions/checkout/blob/v7.0.1/action.yml), [setup-node](https://github.com/actions/setup-node/blob/v7.0.0/action.yml) e [setup-python](https://github.com/actions/setup-python/blob/v7.0.0/action.yml).

## Comandos e Postgres 15

A sequência oficial para testes de banco no GitHub Actions é `supabase db start`, seguida de `supabase test db`. O exemplo da documentação ainda cita `checkout@v3`, `setup-cli@v1` e CLI `latest`; as releases verificadas acima permitem atualizar e fixar essas dependências. Fonte: [testes automatizados no Supabase](https://supabase.com/docs/guides/deployment/ci/testing).

Para este repositório, executar os comandos na raiz e manter `[db].major_version = 15`, já presente em `supabase/config.toml`. O CLI 2.117.0 aceita explicitamente essa versão e seleciona `supabase/postgres:15.8.1.085`, salvo configuração local de versão previamente gravada em arquivos temporários. Fontes: [referência de configuração](https://supabase.com/docs/guides/local-development/cli/config#dbmajor_version), [seleção e validação no CLI](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/config/config.go), [imagem PG15 fixada](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/config/constants.go).

Em um banco novo, `db start` inicializa os schemas dos serviços habilitados e executa as migrações e seeds do projeto. A inicialização pode executar jobs Docker de Auth, Storage e Realtime; portanto, iniciar apenas o banco ainda pode exigir baixar imagens desses serviços. Se o banco já estiver rodando, o comando retorna sem reaplicar migrações. Para o CI proposto, usar runner Linux descartável e banco novo a cada job. Fonte: [StartDatabase, initSchema15 e SetupLocalDatabase](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/internal/db/start/start.go).

Recomenda-se `supabase test db --local` para tornar o alvo local explícito. Sem caminhos adicionais, a CLI procura recursivamente arquivos `.sql` e `.pg` em `supabase/tests` e usa `pg_prove`. Os testes não precisam vincular um projeto hospedado nem receber credenciais Supabase remotas, conforme o fluxo local oficial. Fontes: [referência de test db](https://supabase.com/docs/reference/cli/supabase-test-db), [construção dos argumentos pg_prove](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-test-db.pg-prove-args.ts), [exemplo de CI local](https://supabase.com/docs/guides/deployment/ci/testing).

## Consequência para a auditoria SQL

Na versão 2.117.0, a inicialização revoga os privilégios padrão de novas entidades de `public` para `anon`, `authenticated` e `service_role` quando `api.auto_expose_new_tables` está ausente ou é `false`. Isso afeta tabelas, sequências e funções criadas depois. A interpretação para este projeto é conferir os `GRANT` explícitos das migrações junto das políticas RLS. Reativar privilégios implícitos não é necessário para o CI e dependeria de uma opção já depreciada. Fonte: [ApplyApiPrivileges e RevokeDefaultDataApiPrivilegesSql](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/internal/db/start/start.go).

O checkout recomenda `permissions: contents: read`. Para um job de testes sem operações Git autenticadas posteriores, `persist-credentials: false` é uma opção documentada. Fonte: [README oficial do checkout v7.0.1](https://github.com/actions/checkout/blob/v7.0.1/README.md).
