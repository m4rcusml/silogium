# Silogium — preparação local antes do deploy

Data: 10/09/2026. Escopo: resolver os bloqueios locais enquanto o usuário escolhe a IA e prepara contas Vercel, Supabase, Modal e GitHub. **Não é uma declaração de prontidão para produção.**

Nenhum serviço foi provisionado, nenhum banco foi alterado e não houve push/deploy ou chamada de IA paga nesta rodada. A integração pessoal com Codex e o fluxo de desenvolvimento local foram preservados; não se escolheu um fornecedor de IA hospedado em nome do usuário.

## Implementado

### Autoria fora da requisição web

- Fila transacional no PostgreSQL, worker separado, lease/heartbeat, checkpoints privados, três tentativas e proteção contra gravação por um worker que perdeu o lease.
- Geração, importação e refinamento assíncronos. Persistência conjunta de conteúdo, versão, resultado e turno; confirmação idempotente e erro recuperável para pedidos legados sem tarefa.
- Limites por usuário: três tarefas ativas e dez admissões/minuto. Recusas não deixam conversas órfãs. Recomendações aguardando confirmação não ocupam vagas ativas.
- A web hospedada não instancia a IA nem exige sua chave. A autoria só é habilitada explicitamente depois da configuração do worker. Sem ela, o Studio informa a indisponibilidade e preserva acesso ao histórico/catálogo.
- Worker CLI e definição de função agendada no Modal, sem novo fornecedor de infraestrutura. A fila recebe um adapter de IA; uma alternativa remota futura não exige refazer o processamento dos jobs.

Detalhes, comandos, limites e recuperação: [authoring-worker.md](authoring-worker.md). APIs externas são processadas com semântica *at least once*: uma interrupção depois da resposta e antes do checkpoint pode repetir uma chamada ao provedor. Não há promessa de custo externo exactly-once.

### Judge e fronteira de confiança

- Comparação e pontuação ficam no controlador confiável, fora da sandbox. A solução recebe apenas seu código e a entrada do caso atual, nunca as respostas esperadas, referências ou as demais fixtures.
- Sandbox nova por caso, rede bloqueada, sem secrets/volumes, limites de tempo/memória/saída e encerramento explícito. O stdout da solução não pode declarar seu próprio veredito.
- Protocolo v2 com correlação da requisição e verificação dos casos/pontos retornados; endpoints antigos ou respostas inconsistentes falham fechados. Falhas privadas não revelam entradas/saídas em mensagens.
- Contratos adversariais exercitam vazamento, falsificação de veredito, limites, interrupções e isolamento do payload. O SDK real carrega as definições com conexões de rede bloqueadas.

Isso é evidência local, **não comprova a configuração nem a resistência de uma sandbox real no Modal**. Auditoria e limitações: [infra/modal/SECURITY.md](../infra/modal/SECURITY.md).

### Produção, banco e publicação

- Ausência/configuração inválida do Supabase não permite cair no usuário administrador demo em produção ou preview. Tokens inválidos não viram sessão demo.
- Chaves privilegiadas na configuração pública são recusadas antes do build; a validação completa de credenciais de servidor ocorre nas requisições, permitindo build offline sem secrets.
- Migrações 010/011 e pgTAP preparados: fila service-only, permissões explícitas e separação das políticas anônimas/autenticadas. **SQL ainda não executado** nesta rodada.
- CI preparado para testes, tipos, build, SDK offline, smoke de produção, pgTAP em banco descartável e Playwright. Actions fixadas por SHA; sem deploy, secrets ou ligação com banco remoto. O workflow ainda não rodou no GitHub.
- `.env.production.example`, verificador `npm run deploy:check` e [runbook de deploy](DEPLOYMENT.md). O verificador é offline e não afirma que credenciais, worker ou políticas estão saudáveis.

### Banco inicial e materiais privados

- Seis questões mantidas, com enunciados/starters normalizados para LF ao gerar o catálogo em Windows/Linux, sem reescrever arquivos de solução do usuário.
- Nove casos novos para cada clássica, gerados com aleatoriedade criptográfica e oráculos independentes; artefatos concretos fora do Git em `C:\Users\Inteli\Documents\Anotações\silogium-private-bundles`.
- Materiais privados das três progressivas preservados. Conteúdo antes publicado continua visível; referências clássicas públicas continuam disponíveis para estudo.
- Seed exige os seis pacotes privados, cobertura por estágio e referências nas duas linguagens; rejeita duplicatas de entradas visíveis e valida tudo antes de acessar o banco. Não sobrescreve versões divergentes. A carga das seis questões não é uma única transação.

Preparação, backup e comandos: [private-seed-preparation.md](private-seed-preparation.md).

## Evidências desta rodada

| Verificação | Resultado |
| --- | --- |
| `npm test -- --maxWorkers=2` | 497 testes aprovados em 43 arquivos, após as últimas correções da fila. |
| `npm run typecheck` | Todos os workspaces aprovados. |
| `npm run test:judge:controller` | 19 testes Python aprovados, incluindo executor Modal simulado. |
| `npm run test:private-bundles` | As seis referências passam em TypeScript e Python: 12 avaliações completas. Progressivas 600/600 e clássicas 100/100. |
| SDK Modal real | Importação das duas aplicações e verificação de assinaturas aprovadas com conexões/DNS bloqueados. Não construiu imagens nem executou sandboxes. |
| Workflow CI | YAML carregado/validado localmente, três jobs. Execução no GitHub pendente. |
| Dependências npm | `npm audit --omit=dev --json` e `npm audit --json`: zero vulnerabilidades conhecidas reportadas, incluindo dependências de desenvolvimento. Não substitui auditoria do código ou dos serviços. |
| CLI | `npm run cli -- --help` funciona; autenticação/submissão remota continuam dependentes da homologação. |
| Build final e smoke de produção | Next.js e CLI compilados em `.next-build`; três requisições reais ao servidor de produção recusadas sem Supabase e sem fallback demo. Status legados das rotas: 401/401/400; não foi uma autenticação real. |
| Playwright desktop/mobile | Rodada completa: 190 aprovados, uma falha de espera na navegação e um caso exclusivo de mobile ignorado no desktop. O cenário que falhou passou nas três repetições isoladas, sem edição de código/teste. Total: 191 cenários distintos aprovados ao menos uma vez; não foi uma única rodada inteira verde. |

Ambiente verificado: Windows, Node 22.22.0 e Python 3.13.11. O ambiente isolado do SDK ficou em `.sessions/modal-sdk-20260910` (ignorado pelo Git), com versões em `infra/modal/requirements-deploy.txt`. Não alterou a instalação global de Python. O smoke de produção usa uma porta livre e encerra somente o servidor que ele próprio iniciou. Os E2E usam a porta 3100 e `.next-e2e`; build separado usa `.next-build`.

A falha inicial do navegador ocorreu em `submission-completion.spec.ts:265`: os asserts de layout em 320 px passaram e o clique iniciou a navegação, mas `/explorar` estava sendo recompilado. O trace registrou resposta de 4,70 segundos e um chunk ainda carregando no limite de cinco segundos do assert. A repetição abaixo passou três vezes sem builds concorrentes, sem alterar a interface e sem aumentar o timeout:

```text
npx playwright test tests/e2e/submission-completion.spec.ts --grep "confirmação cabe em 320 pixels" --project=chromium --workers=1 --repeat-each=3 --output=.sessions/e2e-navigation-recheck
```

O trace da falha original foi preservado em `test-results`; a repetição usa outro diretório. `git diff --check` passou e não há bundles privados/arquivos de credenciais entre os arquivos rastreados verificados. Os servidores temporários dos testes foram encerrados pelos próprios scripts; o servidor de desenvolvimento do usuário foi preservado.

## Ainda depende das contas ou de decisão do usuário

1. **Supabase:** ambiente de staging, migrações/pgTAP realmente executados, RLS com dois usuários e acesso anônimo, concorrência/rollback dos RPCs, OAuth GitHub, seed privado e ensaio de restauração. Não há Docker/PostgreSQL local disponível nesta inspeção; testes de adapters não substituem esse ensaio.
2. **Modal:** construir imagens e executar TS/Python reais; medir inicialização, custo, paralelismo e limites. Testar rede, arquivos, processos, timeout e memória; simular morte de worker e resposta perdida; só então habilitar a política de judge oficial.
3. **Vercel/GitHub:** autorizar acesso aos projetos/repositório, configurar ambientes e secrets de servidor, executar CI, preview/staging e callbacks OAuth. Nenhuma credencial deve ir ao chat, ao Git ou a `NEXT_PUBLIC_*` quando for secreta.
4. **IA:** selecionar um provedor remoto utilizável no servidor e confirmar limites/termos/orçamento. A preferência local Codex continua intacta. Não habilitar autoria hospedada enquanto não houver adapter configurado e worker homologado.
5. **Operação:** definir retenção de prompts/código/logs, moderação, domínio, orçamento/alertas e backup. A validação editorial manual ainda é síncrona; seu orçamento de execução precisa ser conferido no ambiente de hospedagem antes da liberação. Não há cancelamento/reprocessamento administrativo automático de jobs finais.

O primeiro passo depois das contas é **staging e homologação**, não ligar progresso oficial diretamente. `accepted` por si só não prova que a submissão recebeu validação oficial: a política de confiança do judge só deve ser configurada após auditoria.

## Decisões de implementação

A skill `codebase-design` orientou a separação entre interface editorial, fila durável, adapter de IA e controlador confiável do judge. Isso permite testar responsabilidades isoladamente e trocar o provedor sem misturar credenciais, execução não confiável e regras de publicação.
