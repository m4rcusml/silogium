# Silogium — deploy e operação

Atualizado em 10/09/2026. **Publicado em [silogium.vercel.app](https://silogium.vercel.app).**
Catálogo, login e execução remota estão configurados; autoria pública por IA e
reconhecimento oficial de progresso continuam desativados. Groq foi escolhido;
a integração e os limites estão descritos em [Groq](./groq-integration.md).
Este guia substitui a proposta antiga: Ollama, OpenRouter, Gemini e judge Docker
local não são integrações implementadas neste repositório.

## Estado publicado e evidências

**Beta preparado localmente, ainda não publicado:** lista de espera, duas criações
validadas por dia, convites administrativos, pausas preservando checkpoints e
worker sob demanda. As migrações 014/015 foram exercitadas em transações revertidas;
a tabela abaixo continua descrevendo a produção anterior. As travas nativas do
Modal foram conferidas após ajuste: US$ 30 de limite bruto e créditos, resultando
em US$ 0 líquido pelo padrão documentado. A ativação operacional ainda precisa
ser verificada. Procedimento, regras e limite interno de US$ 1 para o smoke em
[beta fechado](./beta-closed.md).

| Componente | Estado verificado em 10/09/2026 |
| --- | --- |
| Vercel | Production READY, commit `624489f1744189b59156e711165085627afd2c7a`; deployment `dpl_HEwWNacuR4f1NizwPT48hgCFpjJP` |
| Supabase | Projeto `wvomqkbnwenathgdqlwk`, região `sa-east-1`; 13 migrações aplicadas, até `202609100013_practice_projection_arguments.sql` |
| Catálogo | 6 questões publicadas: 3 progressivas e 3 clássicas, com TypeScript e Python; versões e bundles privados persistidos |
| GitHub OAuth | Login validado; conta `@m4rcusml` promovida explicitamente a administradora |
| Modal | Controlador/judge v2 publicado, endpoint autenticado configurado na Vercel; execução isolada por caso |
| Autoria por IA | `SILOGIUM_AUTHORING_ENABLED=false`; publicação/validação operacional do worker e liberação pública ainda pendentes |
| Progresso oficial | `SILOGIUM_VERIFIED_JUDGE_POLICY` vazio; execução remota não é, sozinha, certificação para recompensas oficiais |

A migração `202609100013_practice_projection_arguments.sql` corrigiu a ambiguidade
SQL da projeção de prática/perfil. A regressão foi validada transacionalmente,
com rollback dos dados de teste; depois do dry-run restrito à 013, a migração foi
aplicada por CLI com TLS `verify-full`. A inspeção confirmou 13 migrações e as
6 questões/versões preservadas. O perfil foi retestado no navegador, sem o alerta
de erro, exibindo o progresso e a permissão administrativa normalmente. Essa
correção somente de banco não mudou o SHA da web publicado acima.

Evidências já obtidas, com escopo delimitado:

- CI do commit publicado: **555 testes Vitest, 21 Python, 255 pgTAP e 193 Playwright
  aprovados; 1 Playwright ignorado**. Veja a [execução aprovada](https://github.com/m4rcusml/silogium/actions/runs/34510859534)
  e o [guia de CI](./ci-checks.md).
- Os **26 testes pgTAP adicionais** da migração 013 passaram em uma transação
  revertida no banco hospedado, incluindo primeiro acesso, atualização, replay,
  snapshot obsoleto e isolamento entre usuários.
- **23 verificações de acesso em produção** com duas contas técnicas: isolamento
  entre usuários, privados/não listados, JWT, tokens CLI e acesso anônimo.
- **Uma submissão real Vercel → Modal → Supabase**: referência TypeScript da
  questão `rede-de-armarios`, versão 1, bundle completo de 8 casos; resultado
  `accepted`, **600/600**, 8/8 casos, 4.899 ms no judge. Histórico e reabertura
  do código na versão original foram conferidos. Não houve chamada de IA nem retry.
- Contas, tokens, fixtures e submissão desses smokes foram removidos somente pelos
  IDs técnicos criados para os testes. Ausência final dos registros públicos e das
  dependências privadas foi confirmada; a conta real não foi alterada.

Com a política oficial vazia, a submissão técnica foi persistida como
`verification: local`, mesmo tendo execução remota. Os smokes comprovam esses
fluxos, mas **não substituem a homologação integral de segurança, carga e custos**
do judge/worker descrita abaixo.

### Build e publicação da web

O projeto Vercel usa `apps/web` como raiz, Node `22.x` e acesso a fontes fora da
raiz habilitado. [apps/web/vercel.json](../apps/web/vercel.json) define:

```text
Install: cd ../.. && npm ci
Build:   cd ../.. && npm run content:generate && npm run build -w @silogium/web
Output:  .next
```

A integração Git do projeto retornava `link: null` na publicação inicial. O deploy
foi solicitado manualmente pela API da Vercel, usando a origem Git e o SHA exato
acima, sem upload do workspace local. **Não assumir deploy automático após um
push**: conferir/vincular a integração Git antes de depender desse fluxo, ou
continuar promovendo explicitamente um commit aprovado. Secrets e bundles privados
não integram o artefato enviado.

## Contrato atual

| Parte | Desenvolvimento | Hospedagem |
| --- | --- | --- |
| Web | Next.js na porta 3000 | Vercel, workspace apps/web |
| Persistência/Auth | Demo em memória ou Supabase explícito | Supabase obrigatório + GitHub OAuth |
| Autoria | Groq ou simulador determinístico | Worker durável separado, Groq 120b |
| Judge | Subprocesso local, somente código confiável | Controlador Modal v2 + sandbox nova por caso |
| Fila | Integrada somente sem banco; com Supabase exige worker | Tabela transacional privada no Supabase |
| Progresso oficial | Demo não concede marcos oficiais | Evidência persistida + bundles privados + política auditada |

Nenhuma assinatura pessoal Codex/ChatGPT é colocada no backend público.
A fila é independente do provedor de IA. Somente Groq é habilitado como provedor
real; não há troca automática para outro serviço/modelo. A migração 012 já foi aplicada.

## Controles implementados

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
  O workflow do commit publicado passou; veja as contagens e o escopo acima.

## Pendências antes de ampliar a liberação

- Publicar e configurar o worker durável no Modal, com secrets próprios e limites
  Groq; comprovar consumo da fila, recuperação após morte/lease expirado, retries,
  checkpoints e cotas antes de habilitar pedidos públicos de IA. O judge publicado
  não comprova que o worker de autoria está operacional.
- Executar o **benchmark cego de 40 prompts**: 10 para cada combinação de
  clássica/progressiva × TypeScript/Python. As metas propostas de 80% de aprovação
  inicial e 90% após correção não são resultados alcançados. Avaliar também clareza,
  originalidade e revisão editorial; pesquisa web permanece experimental/opt-in.
- Completar homologação real de isolamento, limites e carga do judge, incluindo
  **OOM comprovado**. Exit code 137/SIGKILL não distingue falta de memória de outro
  encerramento e não basta como evidência. Medir bundles completos, cold starts,
  concorrência, custo e tratamento de falhas de infraestrutura.
- Ensaiar restauração de backup, definir retenção/moderação e acompanhar erros,
  filas e consumo. Só então avaliar a liberação da política de progresso oficial.

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

**GitHub OAuth:** Client ID/Client Secret são configurados no Supabase. Em produção,
o callback do provedor é `https://wvomqkbnwenathgdqlwk.supabase.co/auth/v1/callback`;
a URL do app é `https://silogium.vercel.app`, com `/auth/callback` autorizado para
redirecionamento. Outros ambientes precisam de URLs próprias. A promoção de
`@m4rcusml` já foi feita por operação administrativa explícita, nunca por metadados
editáveis do login.

**Judge confiável:** `SILOGIUM_VERIFIED_JUDGE_POLICY` fica vazio até a homologação.
Não preencher apenas para fazer conquistas aparecerem.

**Seed:** `SILOGIUM_PRIVATE_BUNDLES_DIR` só no ambiente administrativo, apontando
para diretório privado externo ao checkout. Arquivos privados não entram no build,
CI público nem deploy da web.

## Runbook para atualizações e novos ambientes

O estado da publicação atual está registrado acima; os passos abaixo continuam
válidos para mudanças posteriores e não significam que todos precisem ser repetidos.

1. Conferir projetos/contas, administrador, orçamento e escopo da mudança.
   Preferir homologação separada antes de ampliar o acesso público.
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
   `apps/web/vercel.json`, a raiz e a integração Git. Nenhum script de build deve
   fazer seed, migration ou deploy Modal.
   As variáveis `NEXT_PUBLIC_*` precisam estar corretas no build do ambiente.
7. Homologar OAuth com duas contas, privacidade, tokens CLI, catálogo, execução,
   submissão e comportamento de falhas de infraestrutura.
8. Para liberar a IA Groq: testar adapter, preparar secret
   `silogium-authoring-worker`, publicar `modal deploy -m infra.worker.app`,
   comprovar retomada após morte do worker e então habilitar a flag de autoria.
   A função agenda uma consulta por minuto, com capacidade limitada; medir filas/custo.
9. Homologar limites/segurança do judge real e somente então ativar a política
   oficial. Confirmar marcos de progresso com uma submissão nova e válida.
10. Promover o commit aprovado e observar erros, consumo e filas. Não promover
    um build apenas porque a compilação local passou.

## Checklist obrigatório de homologação

Os testes de produção listados no início cobrem apenas parte deste checklist.
Os testes automatizados não substituem probes no ambiente real.

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

As credenciais administrativas locais ficam **fora do Git**, no diretório
`C:/Users/Inteli/Documents/Anotações/secrets/`. O armazenamento atual é um arquivo
JSON em texto simples protegido por ACL do Windows: **não é um cofre criptografado
nem KMS**. Restringir acesso e backups desse diretório; migrar para um gerenciador
de segredos conforme a operação crescer. Não copiar valores para este documento.
Na Vercel, secrets de servidor usam variáveis sensíveis; no Modal, secrets são
injetados somente nos controladores/workers, nunca nas sandboxes candidatas.
`.sessions/`, `.vercel/` e arquivos locais de ambiente ficam ignorados; bundles
privados permanecem externos ao checkout. Os registros operacionais dos smokes
ficam em `.sessions/deploy-20260910/`, sem senhas, tokens ou código submetido.

A IA permanece desabilitada na hospedagem enquanto o worker e o provedor escolhido
são homologados, sem retirar a integração local. Não é necessário contratar
Redis, serviço de e-mail ou cobrança para os fluxos atuais.

Em regressão, desabilitar novos pedidos de autoria, pausar o agendamento se necessário
e reverter a aplicação a uma versão compatível com o schema. Não usar rollback
destrutivo de banco como resposta automática. Versões, submissões e bundles publicados
permanecem imutáveis. Restaurar backup somente com alvo e autorização explícitos.

Documentação de apoio: [GitHub OAuth](https://supabase.com/docs/guides/auth/social-login/auth-github),
[testes de banco em CI](https://supabase.com/docs/guides/deployment/ci/testing),
[processamento no Modal](https://modal.com/docs/guide/job-queue).
