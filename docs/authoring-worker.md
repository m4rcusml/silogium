# Worker durável de autoria

## Estado e arquitetura

O consumo durável existe no código; **este novo worker sob demanda ainda exige publicação e homologação real**. O banco de produção já recebeu as migrações anteriores, mas o beta depende também de `202609100014_beta_access_and_creation_quota.sql` e `202609100015_operational_capacity.sql`, dos respectivos testes e da verificação financeira do ciclo. Conferir o estado publicado em [DEPLOYMENT](./DEPLOYMENT.md), sem inferir prontidão pelo judge já publicado. A configuração de IA é [Groq](./groq-integration.md).

**Proteção financeira confirmada em 10/09/2026 para o ciclo atual:** após ajuste do proprietário, a interface Modal mostrou teto bruto salvo de **US$ 30** e créditos de **US$ 30**. A [documentação de budgets](https://modal.com/docs/guide/budgets) confirma que, sem limite líquido personalizado, o padrão é limite bruto menos créditos: **US$ 0 neste ciclo**. Isso permite registrar a atestação e iniciar a rodada controlada de até US$ 1. Não equivale a homologação operacional do worker nem a garantia sobre armazenamento, outros workloads ou ciclos futuros. Adicionar um cartão, isoladamente, não substitui essa verificação.

Em produção/preview, a web grava o pedido e a tarefa em uma transação e retorna `202`; não inicia IA em uma promise descartada. O worker reivindica a tarefa no PostgreSQL com `FOR UPDATE SKIP LOCKED`, lease de 120 segundos, heartbeat a cada 40 segundos e no máximo três tentativas. Retries aguardam 10 e 30 segundos. O status público continua `running` enquanto aguarda execução; a fila privada distingue espera e processamento.

O worker hospeda-se no **mesmo fornecedor Modal**, mas em outro app/função confiável, com acesso à rede. Não executá-lo dentro da sandbox sem rede que roda soluções de usuários. Não requer Redis, Railway ou outro fornecedor. A fila usa uma tabela transacional no Supabase, não as filas pgmq ainda sem consumidores da migração inicial.

Geração, importação e refinamento usam o mesmo módulo. Checkpoints privados guardam respostas da IA, snapshots licenciados e validações concluídas; falhas de infraestrutura do judge não são confundidas com questões defeituosas. Ao terminar, uma única transação grava a questão/rascunho, fonte/revisão, resultado e turno da conversa. Token de lease impede que um worker antigo sobrescreva o novo. Confirmações são idempotentes e nunca geram antes do consentimento. Refinamento mantém CAS da revisão do rascunho. Resultados públicos não incluem gabaritos/checkpoints. Checkpoints são removidos ao concluir/esgotar retries.

O beta conta criações concluídas e validadas, não cada chamada interna da IA; a política diária dos participantes e a exceção administrativa ficam no banco. Retries não criam uma nova cobrança de criação. A chamada ao provedor é **at least once**: morte depois da resposta e antes do checkpoint pode repetir a chamada e gerar custo adicional no provedor. Não prometemos exactly-once de uma API externa. Uma resposta perdida após commit não duplica a questão. Pausas de acesso ou capacidade preservam o pedido e seus checkpoints; não são falhas editoriais.

A admissão limita cada usuário a três tarefas em fila/processamento e dez pedidos por minuto, sem cobrar IA antecipadamente. Admissão, nova conversa e job são gravados juntos: recusa não cria conversas órfãs. Recomendações aguardando confirmação não ocupam vagas ativas (o usuário pode preferir resolver uma existente); ao confirmar, o limite de três é verificado novamente. Pedidos em espera continuam contando na janela de admissões por minuto.

## Configuração

- Web: trio Supabase completo e `SILOGIUM_AUTHORING_ENABLED=true` somente depois de validar o worker. Ausente/false em hospedagem desabilita novos pedidos **antes de criar conversa/job ou consumir cota**; catálogo e resolução continuam funcionando.
- Web: `SILOGIUM_WORKER_WAKE_URL` aponta somente para o endpoint HTTPS `wake` do Modal; `SILOGIUM_WORKER_WAKE_TOKEN` é um segredo de servidor independente da chave Groq e do token do judge. Nunca usar prefixo `NEXT_PUBLIC_` nesses dois valores.
- Worker: trio Supabase, `SILOGIUM_AUTHORING_ENABLED=true`, provedor IA configurado via `SILOGIUM_AI_PROVIDER` e suas variáveis, `MODAL_JUDGE_ENDPOINT` e `MODAL_JUDGE_TOKEN`.
- `SILOGIUM_WORKER_ID` é opcional, somente diagnóstico de lease. Nunca contém segredo.
- A fila recebe um `AiAuthoringAdapter`. Somente Groq é habilitado como IA real. O simulador local é recusado pelo worker hospedado; OpenAI e Codex são adapters legados inativos.
- Segredos no ambiente do servidor ou Modal Secret `silogium-authoring-worker`, nunca em arquivos versionados. Configure `GROQ_API_KEY`, `SILOGIUM_AI_PROVIDER=groq` e `GROQ_AUTHORING_MODEL=openai/gpt-oss-120b`. A web não instancia nem precisa da chave do provedor.
- O secret separado `silogium-authoring-wakeup` contém somente `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SILOGIUM_AUTHORING_ENABLED`, `SILOGIUM_WORKER_WAKE_TOKEN` e `SILOGIUM_MODAL_WORKSPACE`. O valor de workspace deve coincidir com o contexto nativo da função Modal. Este controlador não recebe Groq, token do judge nem credenciais pessoais Modal.

## Acordar, processar e voltar a zero

1. A web confirma o enqueue/confirm no PostgreSQL antes de enviar uma notificação vazia e autenticada. Aguarda no máximo dois segundos pela notificação; erro não desfaz o commit nem inicia uma promise de IA descartável.
2. O endpoint `wake` autentica antes de consultar a fila e recusa qualquer corpo de pedido. Ele observa o consumo bruto de todo o workspace Modal, registra o ciclo em `operational_capacity` e só continua se houver capacidade atestada e trabalho pronto. Antes do spawn, reserva conservadoramente 30.000 micros de dólar (US$ 0,03) para uma invocação do worker pesado e margem de controle. Se a confirmação do spawn se perder, a reserva continua contando; não se assume que nada foi executado.
3. `process_authoring` recebe **nenhum argumento do navegador**. O próprio worker reivindica os jobs e verifica as permissões, checkpoints e capacidade necessários.
4. `--drain` processa trabalho pronto e sai ao encontrar a fila vazia. São no máximo 25 claims por chamada, seis minutos para iniciar novos claims e até oito minutos de execução no Modal (450 segundos no subprocesso), além de startup limitado separadamente a 30 segundos. Esse limite é técnico, não uma cota de uso. Interrupção forçada recupera o lease; não dormimos em memória aguardando quota.
5. `recover_authoring` roda a cada cinco minutos. Atualiza a observação financeira mesmo sem pedidos, pois submissões ao judge também precisam de consumo recente; não inicia Node/Groq se a fila estiver vazia/pausada ou houver uma indisponibilidade conhecida de Groq ou Modal. Até pesquisas do assistente aguardam nesse caso; explorar o catálogo público não depende do worker. Recupera notificações perdidas e leases expirados.

As três funções usam `min_containers=0`, `buffer_containers=0`, `max_containers=1` e `scaledown_window=2`. O worker pede e limita a memória a 1 GiB e CPU entre 0,125 e 1 núcleo; o controlador leve pede e limita a memória a 256 MiB, CPU entre 0,125 e 0,5 núcleo, execução máxima de 40 segundos e startup de até 10 segundos. Zero containers ociosos não significa custo literalmente zero: existem invocações leves, cold starts, builds e observações. A fila continua sendo a fonte da verdade mesmo quando o endpoint ou a notificação falham.

A reserva usa o **teto de CPU de 1 núcleo**, não o mínimo solicitado de 0,125. Com as margens de tarifa fixadas para o beta (40 micros/núcleo-segundo e 7 micros/GiB-segundo), incluímos execução, startup e até dois segundos de scale-down: `(480 + 30 + 2) × 47 + 2 × (40 + 10 + 2) × 21,75 + 2.000 = 28.326 micros`. Arredondamos para 30.000. Essa não é uma previsão de custo real. Mudanças nos recursos, no tempo ou nas tarifas exigem recalcular esse teto; invocações leves sem dispatch continuam dependentes da observação e dos limites nativos do fornecedor.

O consumo usa micros de dólar, arredondados para cima, e o maior valor entre o total bruto reportado e a soma de seu detalhamento; nunca usa o custo líquido após créditos como se fosse consumo zero. Sem leitura válida, ciclo atestado ou controles financeiros nativos, não acorda o worker pesado. O relatório pode atrasar: não é garantia de parar no último centavo e não substitui os limites de cobrança configurados diretamente no fornecedor. Se o contexto Modal não tiver permissão para ler faturamento, a verificação falha fechada; isso deve ser conferido na homologação, sem adicionar um token pessoal ao código.

O bloqueio no PostgreSQL usa uma medida **deliberadamente conservadora**: consumo bruto observado de **todo o workspace**, incluindo outros aplicativos, **mais todas as reservas do Silogium criadas no ciclo**. Reservas concluídas ou com resultado desconhecido continuam somadas. Parte delas pode já estar incluída na observação do fornecedor: a duplicação é intencional enquanto não existe reconciliação confiável, e pode suspender novos trabalhos **antes** de os créditos reais acabarem. Esse número não é a fatura nem o saldo gratuito disponível e não deve ser mostrado como tal. Confirmar uma reserva não é reembolsá-la; ciclos novos exigem nova verificação financeira.

## Execução pelo operador (não executada nesta implementação)

Na raiz, com variáveis injetadas pelo ambiente:

```text
node --import tsx infra/worker/run.ts --check
node --import tsx infra/worker/run.ts --once
node --import tsx infra/worker/run.ts --drain
modal deploy -m infra.worker.app
```

`--check` valida configuração local, **não** conexão, migrações, saúde ou credenciais reais. Por padrão o processo assume produção; `--development` é opt-in somente para testes locais com Supabase. O modo integrado `npm run dev` sem Supabase/worker usa Groq/simulador e execução local de código confiável.

Com Supabase configurado, inclusive em desenvolvimento, o processamento usa obrigatoriamente a fila durável: configure `SILOGIUM_AUTHORING_ENABLED=true` na web e execute o worker separado, por exemplo com `--development --poll` no ambiente local. Não há caminho inline que contorne as reservas e a cota persistida quando o banco existe. Somente a demonstração local **sem Supabase** permanece integrada e em memória. `SILOGIUM_AUTHORING_MODE=worker` pode tornar a exigência explícita, mas não é necessário para ativá-la com banco. Não use `--development` em servidor público.

`--poll` é recusado em hospedagem e só funciona junto de `--development`. SIGTERM deixa o job atual terminar sem reivindicar outro. Em operação normal a notificação acorda o worker logo após o commit; se ela falhar, a recuperação tem latência de até aproximadamente cinco minutos, além de cold start, fila e capacidade do provedor.

Antes do opt-in da web: aplicar migrações; rodar pgTAP; usar um pedido controlado com adapter fake; matar um worker durante uma etapa e comprovar recuperação/ausência de duplicação; então testar o provedor e o judge reais com orçamento explícito. Monitorar jobs antigos `running`, tentativas esgotadas e falhas de configuração do worker. A flag não comprova que um worker está ativo.

Verificações locais sem geração nem deploy:

```text
npx vitest run packages/authoring/test/worker-hosting.test.ts packages/authoring/test/supabase-queue.test.ts
npm run test:judge:controller
npm run test:worker:controller
python -m infra.modal.check_sdk
```

O último comando usa as dependências fixadas em `infra/modal/requirements-deploy.txt` e bloqueia sockets durante a importação das definições Modal; não autentica, constrói imagens nem executa sandboxes.

As suítes Python de controller e worker integram o CI e usam apenas doubles locais. Em 10/09/2026, os testes do worker verificaram autenticação, respostas limitadas, dispatch sem payload, espera sem reserva/spawn pesado, observação financeira e retenção conservadora de reservas. O checker de SDK carrega também os limites declarados do controller do judge (CPU e memória limitadas, zero containers mínimos e scale-down curto). Isso comprova compatibilidade de declaração, não consumo real, permissão de faturamento no contexto remoto, OOM ou isolamento em produção.

## Compatibilidade e limites conhecidos

- Pedidos antigos sem registro em `private.authoring_tasks` não são reexecutados automaticamente: podem já ter criado conteúdo. Conferir `Minhas questões` e histórico antes de refazer; recuperação desses pedidos exige decisão operacional explícita.
- O endpoint de importação síncrona legado não roda IA em produção: usar `async: true` ou `/api/v1/authoring` com `mode: import`. O Studio já usa jobs.
- A validação editorial manual (`validateDraft`) continua síncrona; não é um pedido de IA/refinamento. Avaliar seu orçamento de execução antes de liberar esse fluxo em hospedagem.
- O proprietário e o administrador podem cancelar pedidos não terminais; retomada revalida acesso e capacidade. Falhas finais não são reprocessadas automaticamente; ficam visíveis e exigem novo pedido. Cancelar não interrompe uma chamada externa já aceita, mas o token de lease impede que ela publique efeitos após o cancelamento.
- A fila em memória existe para testes determinísticos; não oferece persistência após reiniciar Node. Produção exige PostgreSQL e falha fechada quando ele não está configurado.

Referências de infraestrutura: [funções agendadas Modal](https://modal.com/docs/guide/cron) e [construção de imagens](https://modal.com/docs/reference/modal.Image).
