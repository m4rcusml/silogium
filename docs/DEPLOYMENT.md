# Silogium — Guia de deploy

> **Estado em 09/09/2026: não usar este documento como runbook de produção já validado.** As seções originais abaixo são uma proposta de infraestrutura e contêm opções ainda não implementadas. O inventário atual e os bloqueios estão em `platform-completion-plan.md`.

## Contrato que existe no repositório hoje

- Variáveis efetivas: `.env.example`. Os providers de autoria disponíveis são `local`, `codex` e `openai`; Ollama foi retirado e OpenRouter/Gemini não são adapters deste código.
- O modo demo funciona sem Supabase, com estado em memória e judge local por subprocessos, **não um container Docker isolado**. Não expor na internet com código de terceiros.
- Preparação local usual, sem reset: `npm ci`, `npm run typecheck`, `npm test`, `npm run dev`. Use `SILOGIUM_AI_PROVIDER=local` para os testes determinísticos, sem consumo de IA real. Refinamento semântico requer provedor real.
- E2E: `npx playwright test --workers=1`, em servidor próprio na porta 3100, provider local e diretório `.next-e2e`; não substitui um servidor do usuário na porta 3000.
- Build separado: PowerShell `$env:NEXT_DIST_DIR='.next-build'` e `npm run build`.
- Migrações novas ficam em `supabase/migrations`; pgTAP em `supabase/tests/database`. Não foram aplicadas nesta etapa; `npm run test:db` requer ambiente Supabase configurado.
- Schema `private` continua fora dos schemas expostos. Artefatos do judge/editor são acessados por funções restritas ao servidor, nunca expondo `private` ao PostgREST público.
- O arquivo Modal efetivo é `infra/modal/app.py`, não `infra/modal/judge.py`. O deploy e o isolamento reais ainda precisam de validação.
- `SILOGIUM_VERIFIED_JUDGE_POLICY` deve ficar vazio até a auditoria de executor e bundles oficiais. Não usar a flag apenas para fazer conquistas aparecerem.
- Jobs acompanháveis não significam fila durável: worker com recuperação/idempotência continua pendente. Não publicar a implementação atual como serviço serverless de produção antes disso.
- Nenhuma criação de recurso, execução de reset, cobrança, push ou deploy foi realizada nesta conclusão funcional.

## Proposta original de infraestrutura (requer revisão antes de executar)

Este documento define como executar e promover o Silogium entre desenvolvimento local, ambiente de teste e produção. Ele deve ser revisado quando os nomes finais dos scripts, variáveis ou provedores forem consolidados no repositório.

## Objetivos

- Permitir desenvolvimento local sem custos obrigatórios.
- Manter staging e produção completamente separados.
- Nunca executar código não confiável dentro do processo do Next.js.
- Aplicar migrações de banco de forma reproduzível e auditável.
- Impedir que chaves, testes ocultos e soluções de referência entrem no repositório público.
- Possibilitar rollback da aplicação sem exigir rollback destrutivo do banco.

## Ambientes

### Local

Usado para desenvolvimento diário e testes automatizados.

- Next.js executado localmente.
- Supabase local via Docker.
- IA com adapter `mock` ou Ollama.
- Judge local em container Docker, aceitando somente código do próprio desenvolvedor.
- Dados descartáveis criados por `supabase/seed.sql`.

### Staging

Usado para testes integrados antes de produção.

- Vercel Preview.
- Projeto Supabase exclusivo de staging.
- Ambiente Modal `dev` ou `staging` separado.
- GitHub OAuth App exclusiva de staging.
- OpenRouter/Gemini gratuito, OpenAI com orçamento pequeno ou adapter `mock`.
- Questões, usuários, filas e submissões descartáveis.

A Vercel oferece `Local`, `Preview` e `Production` por padrão. Ambientes customizados são associados aos planos pagos; portanto, o staging gratuito deve usar `Preview`. Consulte a [documentação de ambientes da Vercel](https://vercel.com/docs/deployments/environments).

### Produção

Usado exclusivamente por usuários reais.

- Deploy Vercel de produção e domínio oficial.
- Projeto Supabase exclusivo de produção.
- Ambiente Modal `prod`.
- GitHub OAuth App exclusiva de produção.
- Projeto e chave de produção do provedor de IA.
- Backups, quotas, monitoramento e logs habilitados.

## Matriz de provedores

| Capacidade | Local gratuito | Staging econômico | Produção |
|---|---|---|---|
| Frontend e backend | Next.js local | Vercel Preview | Vercel Production |
| Banco e Auth | Supabase local | Supabase staging | Supabase production |
| Criação por IA | Simulador ou Codex | OpenRouter/Gemini free ou OpenAI limitado | OpenAI |
| Pesquisa interna | PostgreSQL local | Supabase staging | Supabase production |
| Pesquisa licenciada | Exercism/GitHub | Exercism/GitHub | Exercism/GitHub |
| Pesquisa web por IA | Codex Web Search | Opcional | OpenAI Web Search |
| Judge | Docker local | Modal staging | Modal production |
| Fila | Supabase local | Supabase staging | Supabase production |

O desenvolvimento local usa o [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) com a sessão do ChatGPT já autenticada. Essa opção consome a franquia do plano e não deve expor a conta pessoal em ambientes públicos.

## Variáveis de ambiente

Os nomes abaixo são o contrato proposto. Ajuste este documento caso o repositório adote nomes diferentes.

### Públicas

Podem ser enviadas ao navegador:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

### Somente servidor

Nunca use prefixo `NEXT_PUBLIC_` nestas variáveis:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=

SILOGIUM_AI_PROVIDER=local
OPENAI_API_KEY=
OPENAI_DISCOVERY_MODEL=gpt-5.6-luna
OPENAI_AUTHORING_MODEL=gpt-5.6-terra

CODEX_AUTHORING_MODEL=gpt-5.6-terra
CODEX_DISCOVERY_MODEL=gpt-5.6-luna
CODEX_TIMEOUT_MS=600000

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

GEMINI_API_KEY=
GEMINI_MODEL=

JUDGE_PROVIDER=local-docker
MODAL_JUDGE_ENDPOINT=
MODAL_JUDGE_TOKEN=
SILOGIUM_ALLOW_LOCAL_EXECUTION=true

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### Regras de secrets

- `.env`, `.env.local`, credenciais da CLI e bundles privados devem estar no `.gitignore`.
- Armazene secrets de staging e produção nos painéis da Vercel, Supabase e Modal.
- Use chaves diferentes em cada ambiente.
- A chave `SUPABASE_SERVICE_ROLE_KEY` existe somente no servidor e em jobs administrativos.
- Não registre prompts completos, código submetido, tokens ou chaves em logs.
- Rotacione imediatamente qualquer segredo que tenha aparecido no Git, console ou captura de tela.
- Crie uma chave de IA exclusiva para a aplicação de produção, em vez de reutilizar uma chave pessoal. A documentação oficial recomenda armazenar a chave em variável de ambiente. Consulte o [quickstart da OpenAI](https://platform.openai.com/docs/quickstart/make-your-first-api-request).

## Desenvolvimento local gratuito

### Pré-requisitos

- Node.js 22.
- npm.
- Python 3.13.
- Docker com suporte a containers Linux.
- Supabase CLI.
- Ollama somente quando for necessário testar IA local real.

### Preparação

```powershell
npm ci
npx supabase start
npx supabase db reset
npm run typecheck
npm test
npm run dev
```

`supabase db reset` destrói apenas o banco local, reaplica todas as migrações e executa o seed. Esse fluxo é o recomendado para confirmar que o schema é reproduzível. Consulte o [workflow local do Supabase](https://supabase.com/docs/guides/local-development/cli-workflows).

### Modos de IA

#### Mock

```dotenv
SILOGIUM_AI_PROVIDER=local
```

Use para frontend, testes automatizados, estados de loading, erros, quotas e publicação. As respostas devem ser determinísticas.

#### Codex

```powershell
codex login
codex login status
```

```dotenv
SILOGIUM_AI_PROVIDER=codex
CODEX_AUTHORING_MODEL=gpt-5.6-terra
CODEX_DISCOVERY_MODEL=gpt-5.6-luna
CODEX_TIMEOUT_MS=600000
```

O SDK exige JSON compatível com o schema e executa o agente em sandbox somente leitura. Toda resposta continua passando pela validação determinística do Silogium.

#### OpenRouter gratuito

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_MODEL=openrouter/free
```

O plano gratuito é indicado somente para protótipos: o modelo e a disponibilidade podem variar, e os limites são baixos. Consulte o [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router).

### Judge local

```dotenv
JUDGE_PROVIDER=local-docker
SILOGIUM_ALLOW_LOCAL_EXECUTION=true
```

Requisitos mínimos do container:

- rede desabilitada;
- filesystem temporário;
- processo sem privilégios;
- 256 MiB de memória;
- limite de CPU e tempo;
- saída limitada a 64 KiB;
- diretório destruído ao terminar.

O adapter local é exclusivamente de desenvolvimento. Nunca configure `SILOGIUM_ALLOW_LOCAL_EXECUTION=true` em um deploy público.

## Preparação do staging

### 1. Criar recursos separados

Crie:

1. um projeto Supabase chamado `silogium-staging`;
2. uma GitHub OAuth App com callback exclusivo de staging;
3. um ambiente Modal separado;
4. um projeto Vercel ligado ao repositório;
5. chaves de IA de teste com limites pequenos.

Não reutilize o banco, OAuth App, chaves ou endpoint do judge de produção.

### 2. Validar migrações

```powershell
npx supabase login
npx supabase link --project-ref <STAGING_PROJECT_REF>
npx supabase db push --dry-run
npx supabase db push --include-seed
```

O seed remoto só deve ser usado em staging. Não copie usuários, submissões ou código de produção para esse ambiente.

### 3. Preparar Modal

```powershell
modal environment create dev
modal deploy --env=dev infra/modal/judge.py
```

Configure os secrets do judge no ambiente `dev`. Ambientes Modal isolam aplicações, secrets e armazenamento. Consulte a [documentação de ambientes Modal](https://modal.com/docs/guide/environments) e de [secrets Modal](https://modal.com/docs/guide/secrets).

O endpoint deve rejeitar requisições sem token, bloquear rede da sandbox e nunca injetar secrets no container que executa o código do usuário.

### 4. Configurar Vercel Preview

```powershell
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
vercel env add MODAL_JUDGE_ENDPOINT preview
vercel env add MODAL_JUDGE_TOKEN preview
vercel env add AI_PROVIDER preview
vercel deploy
```

Adicione também a chave específica do provedor de IA escolhido. A Vercel permite variáveis separadas para Preview e Production. Consulte a [documentação de variáveis da Vercel](https://vercel.com/docs/environment-variables).

### 5. Smoke tests de staging

- Abrir home e catálogo sem autenticação.
- Entrar e sair com GitHub.
- Confirmar que outro usuário não acessa questão privada.
- Criar uma questão privada com IA.
- Confirmar que `Criar` não chama pesquisa web.
- Pesquisar uma questão interna.
- Pesquisar uma fonte licenciada e conferir atribuição.
- Confirmar que fonte sem licença gera apenas link externo.
- Solicitar publicação e confirmar que ela não é automática.
- Aprovar como administrador e verificar o catálogo público.
- Executar solução correta, errada, com erro de compilação e timeout.
- Confirmar bloqueio de acesso à rede dentro do judge.
- Autenticar a CLI, baixar, testar localmente e submeter remotamente.
- Confirmar que código e testes ocultos não aparecem em respostas ou logs.

## Deploy de produção

### Pré-condições

- CI verde no commit exato que será promovido.
- Smoke tests de staging aprovados.
- Migrações revisadas e compatíveis com a versão anterior da aplicação.
- Backup do banco confirmado.
- Quotas de IA e execução configuradas.
- Domínio, callbacks OAuth e URLs permitidas revisados.
- Nenhum adapter `mock`, Ollama ou judge local habilitado.

### 1. Banco

Confirme visualmente o projeto antes de qualquer comando:

```powershell
npx supabase projects list
npx supabase link --project-ref <PRODUCTION_PROJECT_REF>
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Nunca execute em produção:

```text
supabase db reset --linked
supabase db push --include-seed
```

O reset remoto apaga objetos e dados do projeto vinculado. Ele é aceitável somente em ambientes descartáveis de desenvolvimento ou staging.

### 2. Judge

```powershell
modal environment create prod
modal deploy --env=prod infra/modal/judge.py
```

Antes de configurar a aplicação, teste diretamente:

- autenticação do endpoint;
- TypeScript e Python;
- timeout;
- memória;
- limite de saída;
- rede bloqueada;
- remoção da sandbox após execução.

### 3. IA

```dotenv
SILOGIUM_AI_PROVIDER=openai
SILOGIUM_ALLOW_LOCAL_EXECUTION=false
```

- Use projeto e chave exclusivos de produção.
- Configure limites por usuário no Silogium e limites no provedor.
- Mantenha modelos em variáveis de ambiente para permitir troca controlada.
- Fixe snapshots de modelo quando reprodutibilidade for mais importante que atualização automática.
- Envie `store: false` quando o fluxo não precisar de armazenamento pelo provedor.
- Não envie testes ocultos, soluções de referência ou secrets nos prompts.

### 4. Vercel

```powershell
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add OPENAI_API_KEY production
vercel env add MODAL_JUDGE_ENDPOINT production
vercel env add MODAL_JUDGE_TOKEN production
vercel deploy --prod
```

Confirme o deploy e inspecione erros recentes:

```powershell
vercel curl / --deployment <PRODUCTION_URL>
vercel logs --environment production --level error --since 5m
```

O fluxo de link, preview e produção está descrito no [guia de deploy da Vercel](https://vercel.com/docs/projects/deploy-from-cli).

## CI/CD proposto

### Pull request

1. `npm ci`.
2. Geração de conteúdo.
3. Typecheck.
4. Testes unitários e de integração local.
5. Inicialização do Supabase local e testes de RLS.
6. Build do Next.js.
7. Testes dos harnesses TypeScript e Python.
8. Vercel Preview.

Não execute OpenAI ou Modal reais em todo pull request. Use mocks por padrão e um job manual para integrações externas.

### Promoção para produção

1. Merge em `main` após revisão.
2. Job de migração executa `supabase db push --dry-run`.
3. Aprovação manual no GitHub Environment `production`.
4. Aplicação das migrações.
5. Deploy do Modal.
6. Deploy Vercel de produção.
7. Smoke tests automatizados.
8. Interromper a promoção e iniciar rollback se qualquer smoke test falhar.

## Migrações e rollback

### Estratégia de banco

- Migrações de produção são progressivas e versionadas.
- Primeiro adicione campos/tabelas compatíveis; remova estruturas antigas somente em uma versão posterior.
- Alterações de schema e aplicação precisam funcionar durante o intervalo entre os deploys.
- Faça backfills em jobs separados, idempotentes e observáveis.
- Use uma migração corretiva para reverter schema; não edite uma migração já aplicada.

### Rollback da aplicação

1. Pausar novos jobs de autoria e submissão.
2. Promover novamente o último deploy saudável da Vercel.
3. Restaurar o endpoint Modal anterior, se o problema estiver no judge.
4. Manter a migração se ela for retrocompatível.
5. Aplicar migração corretiva somente quando necessário.
6. Reprocessar apenas jobs idempotentes e marcados como `system_error`.

Submissões afetadas por falha de infraestrutura não devem consumir cota nem receber `wrong_answer`.

## Segurança de execução

- Browser e CLI nunca recebem testes ocultos ou soluções de referência.
- A aplicação envia para a sandbox somente código, harness, fixtures e limites necessários.
- A sandbox não recebe `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `MODAL_JUDGE_TOKEN`.
- Use uma sandbox efêmera por execução.
- Bloqueie rede de entrada e saída.
- Monte o filesystem como temporário e sem volumes compartilhados.
- Não permita processos filhos ilimitados.
- Limite tempo, CPU, memória, tamanho de arquivos e stdout/stderr.
- Normalize mensagens de erro antes de mostrá-las ao usuário.
- Não exponha caminhos internos, comandos do worker ou nomes de testes ocultos.

## Observabilidade

Todos os logs devem carregar identificadores, nunca conteúdo sensível:

- `requestId`;
- `userId` anonimizado;
- `jobId`;
- `submissionId`;
- `problemId` e versão;
- provider e modelo;
- duração;
- veredito ou categoria de falha;
- quantidade de tokens e custo estimado.

Métricas mínimas:

- taxa de erro por provider;
- latência p50/p95 da IA e judge;
- sandboxes ativas;
- jobs presos em `queued` ou `running`;
- submissões com `system_error`;
- uso diário por cota;
- gastos por provider;
- falhas de login OAuth.

Crie `/api/health` para dependências essenciais e `/api/ready` para confirmar banco, fila e configuração. Esses endpoints não devem revelar secrets ou detalhes da infraestrutura.

## Dados e backups

- Staging usa apenas seed sintético.
- Código submetido é privado por padrão.
- Defina retenção para prompts, código, logs e resultados.
- Bundles ocultos ficam em schema ou bucket privado, sem grants para `anon` ou `authenticated`.
- Valide restauração de backup antes do lançamento público.
- Ao despublicar uma questão, preserve versões e submissões existentes, mas remova-a das novas buscas.

## Controle de custos

Valores iniciais recomendados:

- 5 operações de IA por usuário por dia;
- 50 execuções remotas por usuário por dia;
- 10 execuções remotas por minuto;
- testes locais ilimitados;
- administradores auditados mesmo quando isentos.

Ambiente local pode operar sem custo com mock/Ollama, Supabase local e Docker. Staging hospedado pode aproveitar tiers gratuitos, mas execução remota segura e produção pública não devem ser consideradas garantidamente gratuitas. Configure alertas e um kill switch por provider.

## Checklist de liberação

### Staging pronto

- [ ] Banco separado e reproduzível por migrações.
- [ ] OAuth de staging funcionando.
- [ ] Secrets ausentes do repositório e dos logs.
- [ ] IA mock e pelo menos um provider real testados.
- [ ] Judge remoto bloqueia rede e respeita limites.
- [ ] RLS testada com visitante, proprietário, terceiro e administrador.
- [ ] CLI funciona de ponta a ponta.
- [ ] Publicação exige aprovação administrativa.
- [ ] Importações exibem fonte e licença.

### Produção pronta

- [ ] Todos os itens de staging aprovados.
- [ ] Backup e procedimento de restauração verificados.
- [ ] OpenAI e Modal usam projetos/ambientes próprios de produção.
- [ ] `SILOGIUM_ALLOW_LOCAL_EXECUTION=false`.
- [ ] Quotas e alertas configurados.
- [ ] Domínio e callbacks OAuth corretos.
- [ ] Smoke tests executados após o deploy.
- [ ] Rollback testado e documentado.

## Decisões pendentes para a primeira publicação

Preencher quando o repositório estiver pronto:

- domínio de produção;
- região dos projetos Supabase;
- política de retenção de código e prompts;
- modelo local recomendado por faixa de memória;
- modelo OpenAI fixado para produção;
- responsável por aprovar migrações;
- responsável por moderar questões públicas;
- orçamento mensal e limites de alerta;
- tempo máximo aceitável para autoria e submissão;
- plano de indisponibilidade para OpenAI, Supabase e Modal.
