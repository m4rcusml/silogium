# Q3 — Fazenda de execução de jobs — Nível 1

Implemente um serviço em memória que distribui jobs de compilação entre workers.

Use `BuildFarmService`. Os `timestamp`s chegam em ordem estritamente crescente e não precisam ser validados.

## Operações

### `addWorker(workerId, capacity)` / `add_worker`

- Cria um worker com ID não vazio e capacidade inteira positiva.
- IDs de workers ativos não podem se repetir.
- Retorna `true` no sucesso e `false` no erro.

### `submitJob(timestamp, jobId, workerId, cost)` / `submit_job`

- Cria um job ativo no worker indicado.
- `jobId` é não vazio e nunca pode ser reutilizado, mesmo após conclusão.
- `cost` é inteiro positivo e consome capacidade enquanto o job estiver ativo.
- Falha quando o worker não existe ou sua capacidade livre é menor que o custo.

### `completeJob(timestamp, jobId)` / `complete_job`

- Conclui um job ativo e libera sua capacidade.
- Job inexistente ou já concluído retorna `false`.

### `getWorkerLoad(timestamp, workerId)` / `get_worker_load`

- Retorna a soma dos custos dos jobs ativos no worker.
- Worker inexistente retorna `null`/`None`.

```text
addWorker("w1", 10)               -> true
submitJob(1, "build-a", "w1", 6) -> true
submitJob(2, "build-b", "w1", 5) -> false
getWorkerLoad(3, "w1")            -> 6
completeJob(4, "build-a")         -> true
getWorkerLoad(5, "w1")            -> 0
```

Quando terminar:

```powershell
npm run assessment -- test q3 ts 1
# ou
npm run assessment -- test q3 py 1
```
