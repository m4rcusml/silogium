# Q1 — Rede de armários de encomendas — Nível 2

Todos os requisitos do nível 1 continuam válidos.

Cada armário passa a possuir uma métrica histórica chamada **atividade**, inicialmente zero:

- armazenamento bem-sucedido: soma o tamanho ao armário de destino;
- coleta bem-sucedida: soma o tamanho ao armário de origem;
- movimentação bem-sucedida: soma o tamanho tanto à origem quanto ao destino;
- operações malsucedidas não alteram atividade.

## Novas operações

### `moveParcel(timestamp, parcelId, targetLockerId)` / `move_parcel`

- Move uma encomenda armazenada para outro armário.
- Falha se a encomenda ou o destino não existir, o destino for o armário atual ou não houver capacidade.
- A operação é atômica: em caso de falha, nenhum estado ou métrica muda.

### `topLockers(timestamp, n)` / `top_lockers`

- Retorna até `n` armários ordenados por atividade decrescente.
- Empates são resolvidos por `lockerId` em ordem lexicográfica crescente.
- O formato de cada item é `lockerId(activity)`, por exemplo `A(17)`.
- Armários com atividade zero são incluídos.
- Para `n <= 0`, retorna uma lista vazia.

## Exemplo

```text
addLocker("A", 10)                 -> true
addLocker("B", 10)                 -> true
storeParcel(1, "p1", "A", 4)    -> true   // A = 4
moveParcel(2, "p1", "B")         -> true   // A = 8, B = 4
collectParcel(3, "p1")            -> true   // B = 8
topLockers(4, 2)                    -> ["A(8)", "B(8)"]
```
