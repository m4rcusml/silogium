# Q1 — Rede de armários de encomendas — Nível 1

Implemente um serviço em memória que administra armários e encomendas.

Use a classe `ParcelLockerService` do arquivo da linguagem escolhida. Os `timestamp`s fornecidos aos métodos são inteiros e aparecem em ordem estritamente crescente nos testes; não é necessário validá-los.

## Operações

### `addLocker(lockerId, capacity)` / `add_locker`

- Cria um armário com capacidade total `capacity`.
- `lockerId` deve ser não vazio, `capacity` deve ser inteiro positivo e o identificador não pode existir.
- Retorna `true` em caso de sucesso; caso contrário, `false`.

### `storeParcel(timestamp, parcelId, lockerId, size)` / `store_parcel`

- Armazena uma nova encomenda no armário.
- `parcelId` deve ser não vazio e nunca pode ser reutilizado, mesmo após coleta.
- `size` deve ser inteiro positivo.
- A operação falha se o armário não existir ou se a capacidade livre for menor que `size`.
- Retorna `true` ou `false`.

### `collectParcel(timestamp, parcelId)` / `collect_parcel`

- Remove uma encomenda atualmente armazenada e libera sua capacidade.
- Uma encomenda já coletada ou inexistente provoca retorno `false`.

### `getLoad(timestamp, lockerId)` / `get_load`

- Retorna a soma dos tamanhos das encomendas atualmente armazenadas.
- Retorna `null`/`None` quando o armário não existe.

## Exemplo

```text
addLocker("A", 10)                 -> true
storeParcel(1, "p1", "A", 6)    -> true
storeParcel(2, "p2", "A", 5)    -> false
getLoad(3, "A")                   -> 6
collectParcel(4, "p1")            -> true
getLoad(5, "A")                   -> 0
```

Quando terminar:

```powershell
npm run assessment -- test q1 ts 1
# ou
npm run assessment -- test q1 py 1
```
