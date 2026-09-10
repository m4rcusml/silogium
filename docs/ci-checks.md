# Verificações de CI

Workflow: `.github/workflows/checks.yml`.

**Estado:** a versão anteriormente publicada teve CI aprovado, documentado em [DEPLOYMENT](./DEPLOYMENT.md). As alterações novas do [beta](./beta-closed.md) ainda exigem sua própria execução no GitHub; aprovação de um commit anterior não vale para elas. Este ambiente local não dispõe de Docker. Os testes SQL do beta foram executados no PostgreSQL hospedado em transações com rollback, sem aplicar permanentemente as migrações nem alterar os dados existentes.

## Jobs independentes

| Job | Verificações | Limite |
| --- | --- | --- |
| `application` | `npm ci`, toda a suite Vitest, referências no judge local TS/Python, testes Python offline, typecheck e build sem secrets | 30 min |
| `database` | PostgreSQL 15 descartável, migrations do repositório e todos os testes SQL/pgTAP | 20 min |
| `browser` | Chromium desktop e Pixel 7 emulado, Next dev próprio na porta 3100 | 30 min |

O workflow roda em pull requests, pushes para `main` e execução manual. Usa `contents: read`, não persiste credenciais Git e cancela execuções anteriores da mesma PR/ref. Não usa `pull_request_target`, secrets de repositório, tokens cloud, `supabase link`, `db push`, seed remoto ou deploy. Downloads normais de dependências, browsers e imagens continuam necessários no runner.

O gerador usa LF canônico apenas no texto de enunciados/starters, evitando diferenças de catálogo entre checkout Windows e Linux. Fixtures stdio mantêm seus espaços e quebras de linha originais. A comparação imutável do seed não foi relaxada: versões antigas já persistidas com diferenças textuais ainda exigem decisão explícita, nunca overwrite silencioso.

O `next.config.ts` permite build sem configuração, mas rejeita valores públicos presentes que sejam inseguros: chave `sb_secret_`, JWT legado com `service_role`, chave igual à credencial de serviço ou URL inválida. A verificação ocorre antes de produzir o bundle, pois apenas bloquear o runtime não retiraria um secret já incorporado a `NEXT_PUBLIC_*`. A configuração completa continua sendo obrigatória no runtime de produção.

As actions estão fixadas por SHA, com suas versões em comentários. Node **22.22.0**, Python **3.13.11** e Supabase CLI **2.117.0** são explícitos. Os comandos `supabase db start` e `supabase test db --local` seguem o fluxo oficial de testes com banco local; a CLI e o runner Docker não se conectam a um projeto Supabase hospedado. [Documentação oficial do Supabase](https://supabase.com/docs/guides/deployment/ci/testing), [referência `test db`](https://supabase.com/docs/reference/cli/supabase-test-db).

O job de banco lê `supabase/config.toml` sem alterá-lo. O comando `db start` inicializa o banco novo e aplica as migrations; o `stop --no-backup` limpa somente os containers/volumes desse runner descartável, mesmo depois de falha. Não exportamos as chaves locais geradas pela CLI para outros jobs ou artefatos.

## O que os testes não comprovam

- IA fica em simulador ou doubles de teste: nenhuma geração OpenAI/Codex real, credencial ou sessão pessoal é usada.
- As suítes Python são `npm run test:judge:controller` e `npm run test:worker:controller`. Verificam controller e worker com APIs simuladas, sem provisionar Modal.
- Um smoke adicional instala os SDKs fixados e importa as definições Modal com rede bloqueada; não constrói imagens nem acessa contas. Depois do build, um servidor Next de produção temporário, em porta loopback livre, comprova que requisições anônimas/Bearer/criação são recusadas sem configuração Supabase. Esse smoke não autentica ninguém nem escreve no banco.
- O navegador usa desenvolvimento local isolado; não comprova OAuth real, configuração da Vercel ou funcionamento de provedores cloud.
- Nenhuma execução com referências/testes privados externos do desenvolvedor é exigida no CI público. Os testes existentes criam seus próprios dados sintéticos ou consomem os fixtures públicos do repo.

## Auditoria de permissões preparada

`202609090011_explicit_access.sql` corrige dois pressupostos inseguros das migrations iniciais:

1. Catálogo, versões e atribuições anônimos têm policies separadas, sem chamar `private.is_admin()`, cujo acesso anônimo permanece proibido.
2. As tabelas da aplicação recebem grants explícitos por papel. RLS continua filtrando linhas; clientes têm leitura limitada e somente o update de `handle`/`avatar_url` já previsto para perfis. Escritas editoriais, tokens, submissões e os demais fluxos protegidos continuam no servidor. Jobs brutos não ficam legíveis por clientes.

O teste `supabase/tests/database/explicit-access.test.sql` inclui leituras reais sob `anon` e `authenticated` e INSERT/UPDATE/SELECT/DELETE sob `service_role`, além de verificar negativas de privilégio. A evidência da versão publicada está no guia de deploy; qualquer alteração nova precisa de nova execução.

Essa explicitação é importante porque versões atuais da CLI desativam os grants automáticos para novos objetos em `public`. Não habilitamos exposição automática para mascarar falhas. As versões, SHAs e o comportamento foram investigados nas [notas com fontes primárias](./ci-primary-sources.md).
