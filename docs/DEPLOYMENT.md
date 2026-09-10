# Silogium — preparação e deploy

Atualizado em 10/09/2026. **Preparado localmente, ainda não publicado.** Contas,
credenciais e escolha do provedor de IA serão fornecidas pelo proprietário depois.
Este guia substitui a proposta antiga: Ollama, OpenRouter, Gemini e judge Docker
local não são integrações implementadas neste repositório.

## Contrato atual

| Parte | Desenvolvimento | Hospedagem |
| --- | --- | --- |
| Web | Next.js na porta 3000 | Vercel, workspace apps/web |
| Persistência/Auth | Demo em memória ou Supabase explícito | Supabase obrigatório + GitHub OAuth |
| Autoria | Codex pessoal ou simulador, preservados | Worker durável separado; provedor ainda a escolher |
| Judge | Subprocesso local, somente código confiável | Controlador Modal v2 + sandbox nova por caso |
| Fila | Integrada por padrão; worker opcional com banco | Tabela transacional privada no Supabase |
| Progresso oficial | Demo não concede marcos oficiais | Evidência persistida + bundles privados + política auditada |

Nenhuma assinatura pessoal Codex/ChatGPT é colocada no backend público.
A fila é independente do provedor de IA. Um novo provedor gratuito exige um
adapter; não é habilitado apenas por trocar o nome de uma variável.

## O que já foi preparado

- Produção e previews falham fechados se Supabase estiver incompleto: sem administrador
  demo, tokens de memória ou persistência volátil acidental.
- Autoria hospedada é opt-in: `SILOGIUM_AUTHORING_ENABLED=true` somente após validar
  worker e provedor. A web não precisa da chave de IA; sem opt-in, o Studio explica
  a indisponibilidade e mantém catálogo/histórico acessíveis.
- Fila com lease, heartbeat, retries limitados, checkpoints privados, cota por job
  e gravação transacional dos efeitos. Veja [worker](./authoring-worker.md).
- Judge separa candidato e comparação; respostas esperadas, referências e o conjunto
  completo de testes nunca entram no filesystem candidato. A solução recebe somente
  a entrada do caso atual. Veja [modelo de confiança](../infra/modal/SECURITY.md).
- Seeds privados novos para as três clássicas, mantendo os três progressivos.
  Veja [preparação dos bundles](./private-seed-preparation.md).
- Permissões explícitas/RLS e testes SQL nas migrações 010/011.
- CI sem secrets/deploy para aplicação, controlador, navegador e PostgreSQL local.
  Veja [CI](./ci-checks.md). A execução do workflow no GitHub ainda está pendente.

## Verificações locais, sem contas nem IA paga

Execute na raiz do repositório:

```powershell
npm run typecheck
npm test -- --maxWorkers=2
npm run test:judge:controller
npm run test:private-bundles
npx playwright test --workers=1
```

Playwright usa seu próprio servidor na porta 3100, simulador local e `.next-e2e`.
Não reutiliza nem encerra o servidor de desenvolvimento da porta 3000.
Execute essa suíte sem builds concorrentes ou alterações nas fontes: recompilações
Fast Refresh podem estourar as esperas curtas de navegação do servidor de testes.

Build separado do desenvolvimento:

```powershell
$env:NEXT_DIST_DIR='.next-build'
npm run build
```

Depois desse build, `npm run test:production-guard` inicia e encerra somente um
servidor temporário em porta loopback livre e testa a recusa de requisições sem
configuração. Não precisa de contas e não altera o servidor do usuário.

O build sem contas pode compilar; isso não autoriza servir produção sem configuração.
Nunca adicionar bypass de segurança baseado apenas em `NEXT_PHASE`.

O diagnóstico offline lê variáveis do processo (ou um arquivo explicitamente indicado):

```powershell
npm run deploy:check
npm run deploy:check -- --env-file .env.production.local
npm run deploy:check -- --worker --env-file .env.worker.local
npm run worker:check
```

Valores/chaves não são impressos. Falta de configuração retorna exit code 1.
Itens `MANUAL` sempre exigem evidência externa: um diagnóstico verde não testa
a conexão, a validade das credenciais, a atividade do worker ou o isolamento real.
Os comandos não carregam automaticamente o `apps/web/.env.local` pessoal.

## Configuração por ambiente

Use `.env.production.example` como lista, não como arquivo de credenciais.
Configure separadamente Preview/staging e Production.

**Web:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`MODAL_JUDGE_ENDPOINT`, `MODAL_JUDGE_TOKEN`,
`SILOGIUM_ALLOW_LOCAL_EXECUTION=false` e a flag de autoria.

**Worker:** configuração Supabase, endpoint/token do judge e variáveis do provedor
escolhido. Não injete essas chaves no browser nem nas sandboxes candidatas.
`NODE_ENV=production` é imposto pelo entrypoint, exceto no opt-in local
`--development`. Web local com fila usa `SILOGIUM_AUTHORING_MODE=worker`.

**GitHub OAuth:** Client ID/Client Secret são configurados no Supabase; callback
e URLs de redirecionamento precisam corresponder ao ambiente. Uma conta será
promovida a administradora por operação administrativa explícita, nunca por
metadados editáveis do login.

**Judge confiável:** `SILOGIUM_VERIFIED_JUDGE_POLICY` fica vazio até a homologação.
Não preencher apenas para fazer conquistas aparecerem.

**Seed:** `SILOGIUM_PRIVATE_BUNDLES_DIR` só no ambiente administrativo, apontando
para diretório privado externo ao checkout. Arquivos privados não entram no build,
CI público nem deploy da web.

## Sequência quando as contas estiverem disponíveis

1. Identificar projetos/contas, administrador, orçamento e escopo de acesso inicial.
   Preferir homologação separada antes de abrir cadastro público.
2. Obter backup do banco existente, se houver, e conferir alvo e histórico das
   migrações. Rodar `supabase db push --dry-run` apenas após vincular o projeto
   correto. Aplicar migrations revisadas; não executar reset remoto.
3. Rodar pgTAP em banco descartável. Nesta máquina Docker/PostgreSQL não está
   disponível; o job de CI faz `supabase db start` e `supabase test db --local`
   em runner novo, sem projeto cloud vinculado.
4. Validar todos os bundles/referências e executar `npm run db:seed` explicitamente.
   O seed recusa versões divergentes, mas não é uma transação única para as seis
   questões. Inspecionar falhas parciais antes de repetir. Nunca substituir histórico.
5. Preparar SDKs pelo arquivo `infra/modal/requirements-deploy.txt`, autenticar
   Modal e configurar o secret `silogium-judge-token` com `AUTH_TOKEN` forte.
   Publicar com `modal deploy -m infra.modal.app`. Nunca expor o runner local.
6. Configurar Vercel a partir do repositório e conferir o build de monorepo em
   `vercel.json`. Nenhum script de build deve fazer seed, migration ou deploy Modal.
   As variáveis `NEXT_PUBLIC_*` precisam estar corretas no build do ambiente.
7. Homologar OAuth com duas contas, privacidade, tokens CLI, catálogo, execução,
   submissão e comportamento de falhas de infraestrutura.
8. Quando a IA for escolhida: testar adapter, preparar secret
   `silogium-authoring-worker`, publicar `modal deploy -m infra.worker.app`,
   comprovar retomada após morte do worker e então habilitar a flag de autoria.
   A função agenda uma consulta por minuto, com capacidade limitada; medir filas/custo.
9. Homologar limites/segurança do judge real e somente então ativar a política
   oficial. Confirmar marcos de progresso com uma submissão nova e válida.
10. Promover o commit aprovado e observar erros, consumo e filas. Não promover
    um build apenas porque a compilação local passou.

## Checklist obrigatório de homologação

- Duas contas: outra conta não acessa privados/rascunhos; unlisted exige acesso autorizado.
- Revisão administrativa, versões imutáveis, fontes/licenças e histórico preservados.
- CLI: token válido, expiração/revogação, download, teste local e submissão remota.
- Judge: referências TS/Python, solução errada, compilação, timeout, memória, rede,
  descendentes, flood de saída e tentativas de ler testes/respostas.
- Nenhum teste oculto, fonte submetida, prompt completo ou segredo aparece em logs.
- Custo/cold start com bundles completos; falhas de infraestrutura reembolsam cota.
- Worker: retries, reserva de cota única, lease expirado, commit com resposta perdida
  e retomada sem duplicar conteúdo. A chamada ao provedor pode repetir em falha entre
  resposta e checkpoint; não há garantia de cobrança exatamente uma vez.
- Backup e ensaio de restauração, retenção de código/prompts e responsável por moderação.
- Observabilidade: jobs antigos em running, tentativas esgotadas, falhas do runner,
  crescimento das filas, latência e consumo por ambiente.

## Secrets, dados e rollback

Não colar segredos em chat, terminal gravado, URL ou repositório. Use os painéis
ou ferramentas autenticadas; chaves devem ser distintas por ambiente. A chave
de servidor do Supabase não recebe prefixo `NEXT_PUBLIC_`.

A configuração inicial pode manter IA desabilitada na hospedagem enquanto seu
provedor é decidido, sem retirar a integração local. Não é necessário contratar
Redis, serviço de e-mail ou cobrança para os fluxos atuais.

Em regressão, desabilitar novos pedidos de autoria, pausar o agendamento se necessário
e reverter a aplicação a uma versão compatível com o schema. Não usar rollback
destrutivo de banco como resposta automática. Versões, submissões e bundles publicados
permanecem imutáveis. Restaurar backup somente com alvo e autorização explícitos.

Documentação de apoio: [GitHub OAuth](https://supabase.com/docs/guides/auth/social-login/auth-github),
[testes de banco em CI](https://supabase.com/docs/guides/deployment/ci/testing),
[processamento no Modal](https://modal.com/docs/guide/job-queue).
