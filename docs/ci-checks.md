# Verificações de CI

Workflow: `.github/workflows/checks.yml`.

**Estado em 10/09/2026:** o [CI `34542160203`](https://github.com/m4rcusml/silogium/actions/runs/34542160203), do commit exato `bd2ea46e47dd65706c731c390f0788416b5177a0`, concluiu com sucesso os três jobs, incluindo as alterações do [beta](./beta-closed.md). Aprovação desse SHA não se estende automaticamente a commits posteriores nem comprova que a web correspondente já esteja publicada; veja [DEPLOYMENT](./DEPLOYMENT.md).

## Resultado confirmado desta rodada

- Aplicação: **634 testes Vitest em 57 arquivos**, **21 testes Python do judge** e **20 do worker**, tipos, build e proteção de produção aprovados.
- Banco: **400 verificações pgTAP em 15 suítes**, com as 15 migrações aplicadas em um PostgreSQL 15 descartável do runner.
- Navegador: **211 cenários aprovados e um skip esperado** em Chromium desktop/mobile, em 8,1 minutos. O skip é um cenário exclusivo de layout móvel no projeto desktop.

O CI não usa contas cloud. Separadamente, na operação controlada de 10/09, foram aplicadas as **15 migrações no Supabase hospedado**, publicado o worker no Modal e validada uma criação privada clássica TypeScript com Groq e judge remoto, consumindo uma criação diária. Essa é evidência de um fluxo real, não de qualidade geral ou disponibilidade do novo deploy web.

A disponibilidade foi verificada posteriormente, fora do CI: deploy Vercel
`dpl_dRobAyXFBV13kLGHC9RcT7gTyveg` em **READY**, com o mesmo SHA acima e o alias
[silogium.vercel.app](https://silogium.vercel.app). Os probes de acesso aprovado,
pendente e revogado passaram (**7 + 10 + 10 verificações**): recursos assistidos
disponíveis para o aprovado e bloqueados, inclusive com POST 403, para os demais.
A autoria está habilitada somente para o beta aprovado e administradores;
capacidade financeira e demais limites continuam descritos em [DEPLOYMENT](./DEPLOYMENT.md).

O histórico local permanece distinto: sem Docker neste ambiente de desenvolvimento, os testes SQL do beta foram inicialmente executados contra PostgreSQL hospedado em transações com rollback. Esses testes não aplicaram permanentemente as migrações; a aplicação real posterior foi uma operação separada. A rodada completa local de navegador havia encontrado corte no filtro em 1024 px; após a correção e o recorte de layout aprovado, o CI acima passou pela suíte inteira.

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

- IA fica em simulador ou doubles de teste: nenhuma geração Groq/OpenAI/Codex real, credencial ou sessão pessoal é usada no CI.
- As suítes Python são `npm run test:judge:controller` e `npm run test:worker:controller`. Verificam controller e worker com APIs simuladas, sem provisionar Modal.
- Um smoke adicional instala os SDKs fixados e importa as definições Modal com rede bloqueada; não constrói imagens nem acessa contas. Depois do build, um servidor Next de produção temporário, em porta loopback livre, comprova que requisições anônimas/Bearer/criação são recusadas sem configuração Supabase. Esse smoke não autentica ninguém nem escreve no banco.
- O navegador usa desenvolvimento local isolado; não comprova OAuth real, configuração da Vercel ou funcionamento de provedores cloud.
- Nenhuma execução com referências/testes privados externos do desenvolvedor é exigida no CI público. Os testes existentes criam seus próprios dados sintéticos ou consomem os fixtures públicos do repo.
- Nem o CI nem o smoke privado de uma criação constituem benchmark cego de 40 prompts, prova de OOM, ensaio de morte de container Modal ou homologação completa de isolamento/carga/custo. Permanecem verificações separadas.

## Auditoria de permissões preparada

`202609090011_explicit_access.sql` corrige dois pressupostos inseguros das migrations iniciais:

1. Catálogo, versões e atribuições anônimos têm policies separadas, sem chamar `private.is_admin()`, cujo acesso anônimo permanece proibido.
2. As tabelas da aplicação recebem grants explícitos por papel. RLS continua filtrando linhas; clientes têm leitura limitada e somente o update de `handle`/`avatar_url` já previsto para perfis. Escritas editoriais, tokens, submissões e os demais fluxos protegidos continuam no servidor. Jobs brutos não ficam legíveis por clientes.

O teste `supabase/tests/database/explicit-access.test.sql` inclui leituras reais sob `anon` e `authenticated` e INSERT/UPDATE/SELECT/DELETE sob `service_role`, além de verificar negativas de privilégio. A evidência da versão publicada está no guia de deploy; qualquer alteração nova precisa de nova execução.

Essa explicitação é importante porque versões atuais da CLI desativam os grants automáticos para novos objetos em `public`. Não habilitamos exposição automática para mascarar falhas. As versões, SHAs e o comportamento foram investigados nas [notas com fontes primárias](./ci-primary-sources.md).
