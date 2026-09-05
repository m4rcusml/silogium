# Q3 — Fazenda de execução de jobs — Nível 3

Todos os requisitos anteriores continuam válidos.

Jobs agora podem depender de outros jobs. Um job está **pronto** quando está ativo e todas as suas dependências foram concluídas. `completeJob` deve retornar `false` enquanto houver qualquer dependência não concluída.

## Novas operações

### `addDependency(timestamp, jobId, prerequisiteJobId)` / `add_dependency`

- O job dependente deve existir e estar ativo.
- O pré-requisito pode estar ativo ou concluído, mas deve existir.
- Não permite autodependência, duplicata ou ciclo direto/indireto.
- Em caso de sucesso, registra a dependência e retorna `true`.

Um ciclo existe quando, após a operação, algum job depende de si por uma cadeia de dependências.

### `readyJobs(timestamp, workerId)` / `ready_jobs`

- Retorna IDs dos jobs ativos e prontos atribuídos ao worker.
- Ordene por `cost` decrescente e, em empate, `jobId` crescente.
- Worker inexistente retorna lista vazia.

Transferir um job não altera suas dependências.
