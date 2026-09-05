# Q3 — Fazenda de execução de jobs — Nível 4

Todos os requisitos anteriores continuam válidos.

Desde o nível 1, cada job mantém um histórico cronológico com textos exatos:

- `submitted:WORKER@TIMESTAMP`;
- `transferred:ORIGEM->DESTINO@TIMESTAMP`;
- `completed:WORKER@TIMESTAMP`;
- `depends-on:JOB@TIMESTAMP`;
- `drained:ORIGEM->DESTINO@TIMESTAMP`.

## Novas operações

### `drainWorker(timestamp, sourceWorkerId, targetWorkerIds)` / `drain_worker`

Desativa um worker e redistribui todos os seus jobs ativos de forma atômica.

- Origem deve existir.
- A lista de destinos deve ser não vazia, sem duplicatas, sem a origem e composta apenas por workers existentes.
- Ordene os jobs da origem por `cost` decrescente e depois `jobId` crescente.
- Para cada job, escolha o destino com **maior capacidade livre naquele momento**; em empate, use `workerId` crescente.
- Um destino só é elegível se comportar o job.
- Se algum job não puder ser alocado, nada muda e a origem permanece ativa.
- No sucesso, registre `drained` nos jobs transferidos e remova o worker de origem.
- O trabalho concluído histórico da origem não é transferido; ele deixa de aparecer em `topWorkers` porque a origem foi removida.
- Dependências continuam inalteradas.

### `getJobHistory(timestamp, jobId)` / `get_job_history`

- Retorna uma nova lista com o histórico do job.
- Job inexistente retorna lista vazia.
- Alterar o array/lista retornado não pode modificar o estado interno.

Ao terminar:

```powershell
npm run assessment -- submit q3 ts
# ou
npm run assessment -- submit q3 py
```
