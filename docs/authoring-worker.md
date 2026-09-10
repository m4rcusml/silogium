# Worker durável de autoria

## Estado e arquitetura

Implementado, **não provisionado nem validado contra Supabase/Modal reais**. Aplicar a migração `202609090010_authoring_worker.sql` e executar os testes de banco antes de habilitar.

Em produção/preview, a web grava o pedido e a tarefa em uma transação e retorna `202`; não inicia IA em uma promise descartada. O worker reivindica a tarefa no PostgreSQL com `FOR UPDATE SKIP LOCKED`, lease de 120 segundos, heartbeat a cada 40 segundos e no máximo três tentativas. Retries aguardam 10 e 30 segundos. O status público continua `running` enquanto aguarda execução; a fila privada distingue espera e processamento.

O worker hospeda-se no **mesmo fornecedor Modal**, mas em outro app/função confiável, com acesso à rede. Não executá-lo dentro da sandbox sem rede que roda soluções de usuários. Não requer Redis, Railway ou outro fornecedor. A fila usa uma tabela transacional no Supabase, não as filas pgmq ainda sem consumidores da migração inicial.

Geração, importação e refinamento usam o mesmo módulo. Checkpoints privados guardam respostas da IA, snapshots licenciados e validações concluídas; falhas de infraestrutura do judge não são confundidas com questões defeituosas. Ao terminar, uma única transação grava a questão/rascunho, fonte/revisão, resultado e turno da conversa. Token de lease impede que um worker antigo sobrescreva o novo. Confirmações são idempotentes e nunca geram antes do consentimento. Refinamento mantém CAS da revisão do rascunho. Resultados públicos não incluem gabaritos/checkpoints. Checkpoints são removidos ao concluir/esgotar retries.

Uma operação consome no máximo **uma cota Silogium de IA por job**, inclusive nos retries. A chamada ao provedor é **at least once**: morte depois da resposta e antes do checkpoint pode repetir a chamada e gerar custo adicional no provedor. Não prometemos exactly-once de uma API externa. Uma resposta perdida após commit não duplica a questão.

A admissão limita cada usuário a três tarefas em fila/processamento e dez pedidos por minuto, sem cobrar IA antecipadamente. Admissão, nova conversa e job são gravados juntos: recusa não cria conversas órfãs. Recomendações aguardando confirmação não ocupam vagas ativas (o usuário pode preferir resolver uma existente); ao confirmar, o limite de três é verificado novamente. Pedidos em espera continuam contando na janela de admissões por minuto.

## Configuração

- Web: trio Supabase completo e `SILOGIUM_AUTHORING_ENABLED=true` somente depois de validar o worker. Ausente/false em hospedagem desabilita novos pedidos **antes de criar conversa/job ou consumir cota**; catálogo e resolução continuam funcionando.
- Worker: trio Supabase, `SILOGIUM_AUTHORING_ENABLED=true`, provedor IA configurado via `SILOGIUM_AI_PROVIDER` e suas variáveis, `MODAL_JUDGE_ENDPOINT` e `MODAL_JUDGE_TOKEN`.
- `SILOGIUM_WORKER_ID` é opcional, somente diagnóstico de lease. Nunca contém segredo.
- A fila não depende de OpenAI: recebe um `AiAuthoringAdapter`. Os adapters atuais são OpenAI remoto, Codex pessoal local e simulador local. Os dois últimos são recusados pelo worker hospedado. Um futuro provedor remoto gratuito só exige outro adapter; nenhuma mudança de fila.
- Segredos no ambiente do servidor ou Modal Secret `silogium-authoring-worker`, nunca em arquivos versionados. `OPENAI_*` só é necessário se esse for o provedor escolhido. A web não instancia nem precisa da chave do provedor.

## Execução pelo operador (não executada nesta implementação)

Na raiz, com variáveis injetadas pelo ambiente:

```text
node --import tsx infra/worker/run.ts --check
node --import tsx infra/worker/run.ts --once
node --import tsx infra/worker/run.ts --poll
modal deploy -m infra.worker.app
```

`--check` valida configuração local, **não** conexão, migrações, saúde ou credenciais reais. Por padrão o processo assume produção; `--development` é opt-in somente para testes locais com Supabase. O modo integrado `npm run dev` sem Supabase/worker mantém Codex/simulador e execução local existentes.

Para testar a fila inteira em desenvolvimento com banco, configure `SILOGIUM_AUTHORING_MODE=worker` e `SILOGIUM_AUTHORING_ENABLED=true` na web; execute o worker separado com `--development --poll`. Sem esse opt-in, a experiência local continua integrada. Não use `--development` em servidor público.

A função Modal consulta a fila a cada minuto e processa um job por chamada, com até dois containers e limite de 900 segundos. Portanto há latência inicial de até aproximadamente um minuto, além da fila. Ajustar capacidade/agendamento conforme demanda. SIGTERM no poller deixa a tarefa atual terminar; interrupção forçada é recuperada após o lease expirar.

Antes do opt-in da web: aplicar migrações; rodar pgTAP; usar um pedido controlado com adapter fake; matar um worker durante uma etapa e comprovar recuperação/ausência de duplicação; então testar o provedor e o judge reais com orçamento explícito. Monitorar jobs antigos `running`, tentativas esgotadas e falhas de configuração do worker. A flag não comprova que um worker está ativo.

## Compatibilidade e limites conhecidos

- Pedidos antigos sem registro em `private.authoring_tasks` não são reexecutados automaticamente: podem já ter criado conteúdo. Conferir `Minhas questões` e histórico antes de refazer; recuperação desses pedidos exige decisão operacional explícita.
- O endpoint de importação síncrona legado não roda IA em produção: usar `async: true` ou `/api/v1/authoring` com `mode: import`. O Studio já usa jobs.
- A validação editorial manual (`validateDraft`) continua síncrona; não é um pedido de IA/refinamento. Avaliar seu orçamento de execução antes de liberar esse fluxo em hospedagem.
- Não há cancelamento/reprocessamento administrativo automático de falhas finais nesta versão. Falhas finais são visíveis no job e o usuário pode iniciar novo pedido.
- A fila em memória existe para testes determinísticos; não oferece persistência após reiniciar Node. Produção exige PostgreSQL e falha fechada quando ele não está configurado.

Referências de infraestrutura: [funções agendadas Modal](https://modal.com/docs/guide/cron) e [construção de imagens](https://modal.com/docs/reference/modal.Image).
