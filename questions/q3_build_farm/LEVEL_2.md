# Q3 — Fazenda de execução de jobs — Nível 2

Todos os requisitos anteriores continuam válidos.

Cada worker passa a manter **trabalho concluído**, inicialmente zero. Ao concluir um job, some seu `cost` ao worker em que ele estava naquele momento. Transferências não alteram essa métrica.

## Novas operações

### `transferJob(timestamp, jobId, targetWorkerId)` / `transfer_job`

- Move um job ativo para outro worker.
- Falha se job ou destino não existir, o destino for o worker atual ou não houver capacidade.
- A operação é atômica: uma falha não altera cargas nem estado.

### `topWorkers(timestamp, n)` / `top_workers`

- Retorna até `n` workers ativos por trabalho concluído decrescente.
- Empates usam `workerId` lexicográfico crescente.
- Formato: `workerId(total)`, por exemplo `w1(17)`.
- Workers com zero são incluídos; `n <= 0` retorna lista vazia.

```text
addWorker("a", 10)          -> true
addWorker("b", 10)          -> true
submitJob(1, "j", "a", 4)  -> true
transferJob(2, "j", "b")   -> true
completeJob(3, "j")         -> true
topWorkers(4, 2)             -> ["b(4)", "a(0)"]
```
